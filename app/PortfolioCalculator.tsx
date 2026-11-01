"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateBuyTransaction,
  calculateProfitAtPrice,
  findMinimumProfitableSale,
  findMinimumProfitableSaleWithFixedFee,
  roundMoney,
  type AShareFeeRates,
} from "@/lib/trading-costs.js";

type StockPreset = {
  symbol: string;
  name: string;
  code: string;
  market: string;
  referencePrice: number;
};

type BuyLot = {
  id: string;
  batchId?: string;
  date: string;
  shares: number | null;
  price: number | null;
  actualBuyFee?: number | null;
  expectedSellFee?: number | null;
};

type Holding = StockPreset & {
  id: string;
  baseShares: number | null;
  baseUnitCost: number | null;
  lots: BuyLot[];
};

type FeeForm = {
  commissionPercent: number;
  transferFeePercent: number;
  stampDutyPercent: number;
};

type SavedPortfolio = {
  version: 2;
  holdings: Holding[];
  fees: FeeForm;
};

const STOCK_PRESETS: StockPreset[] = [
  { symbol: "601318.SH", name: "中国平安", code: "601318", market: "上交所", referencePrice: 52.8 },
  { symbol: "000538.SZ", name: "云南白药", code: "000538", market: "深交所", referencePrice: 53.71 },
  { symbol: "600941.SH", name: "中国移动", code: "600941", market: "上交所", referencePrice: 102.13 },
  { symbol: "000423.SZ", name: "东阿阿胶", code: "000423", market: "深交所", referencePrice: 47.93 },
  { symbol: "002508.SZ", name: "老板电器", code: "002508", market: "深交所", referencePrice: 15.33 },
  { symbol: "000807.SZ", name: "云铝股份", code: "000807", market: "深交所", referencePrice: 25.36 },
  { symbol: "000933.SZ", name: "神火股份", code: "000933", market: "深交所", referencePrice: 26.08 },
  { symbol: "000333.SZ", name: "美的集团", code: "000333", market: "深交所", referencePrice: 89.18 },
  { symbol: "000651.SZ", name: "格力电器", code: "000651", market: "深交所", referencePrice: 38.49 },
  { symbol: "600690.SH", name: "海尔智家", code: "600690", market: "上交所", referencePrice: 20.74 },
  { symbol: "600887.SH", name: "伊利股份", code: "600887", market: "上交所", referencePrice: 30.15 },
  { symbol: "000895.SZ", name: "双汇发展", code: "000895", market: "深交所", referencePrice: 24.42 },
  { symbol: "603288.SH", name: "海天味业", code: "603288", market: "上交所", referencePrice: 34.86 },
  { symbol: "603345.SH", name: "安井食品", code: "603345", market: "上交所", referencePrice: 81.62 },
  { symbol: "600900.SH", name: "长江电力", code: "600900", market: "上交所", referencePrice: 29.74 },
  { symbol: "600036.SH", name: "招商银行", code: "600036", market: "上交所", referencePrice: 43.55 },
  { symbol: "601838.SH", name: "成都银行", code: "601838", market: "上交所", referencePrice: 19.94 },
  { symbol: "600919.SH", name: "江苏银行", code: "600919", market: "上交所", referencePrice: 12.96 },
  { symbol: "601009.SH", name: "南京银行", code: "601009", market: "上交所", referencePrice: 12.37 },
  { symbol: "002142.SZ", name: "宁波银行", code: "002142", market: "深交所", referencePrice: 35.17 },
  { symbol: "000001.SZ", name: "平安银行", code: "000001", market: "深交所", referencePrice: 11.64 },
  { symbol: "601899.SH", name: "紫金矿业", code: "601899", market: "上交所", referencePrice: 27.6 },
  { symbol: "600938.SH", name: "中国海油", code: "600938", market: "上交所", referencePrice: 35.97 },
  { symbol: "601088.SH", name: "中国神华", code: "601088", market: "上交所", referencePrice: 51.99 },
];

const DEFAULT_FEES: FeeForm = {
  commissionPercent: 0.01,
  transferFeePercent: 0.001,
  stampDutyPercent: 0.05,
};
const DEFAULT_HOLDINGS: Holding[] = [
  {
    ...STOCK_PRESETS[0],
    id: "holding-601318",
    baseShares: 1500,
    baseUnitCost: null,
    lots: [
      {
        id: "lot-t-001-a",
        batchId: "T-001-A",
        date: "",
        shares: 200,
        price: 52.39,
        actualBuyFee: 1.15,
        expectedSellFee: 6.42,
      },
      {
        id: "lot-t-001-b",
        batchId: "T-001-B",
        date: "",
        shares: 100,
        price: 52.42,
        actualBuyFee: 1.15,
        expectedSellFee: 3.7,
      },
    ],
  },
];
const STORAGE_KEY = "private-stock-portfolio-v2";
const LEGACY_STORAGE_KEY = "private-stock-portfolio-v1";
const money = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const precisePrice = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const integer = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });

export default function PortfolioCalculator() {
  const [holdings, setHoldings] = useState<Holding[]>(DEFAULT_HOLDINGS);
  const [fees, setFees] = useState<FeeForm>(DEFAULT_FEES);
  const [selectedSymbol, setSelectedSymbol] = useState(STOCK_PRESETS[1].symbol);
  const [isReady, setIsReady] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      if (value) {
        const saved = JSON.parse(value) as SavedPortfolio;
        if (saved.version === 2 && Array.isArray(saved.holdings)) {
          setHoldings(saved.holdings);
          setFees(saved.fees ?? DEFAULT_FEES);
        }
      } else {
        const legacyValue = window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyValue) {
          const legacy = JSON.parse(legacyValue) as Omit<SavedPortfolio, "version"> & { version: 1 };
          if (legacy.version === 1 && Array.isArray(legacy.holdings)) {
            setHoldings(mergeLedgerData(legacy.holdings));
            setFees(legacy.fees ?? DEFAULT_FEES);
          }
        }
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isReady) return;
    const saved: SavedPortfolio = { version: 2, holdings, fees };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
  }, [fees, holdings, isReady]);

  const rates = useMemo<AShareFeeRates>(() => ({
    commissionRate: fees.commissionPercent / 100,
    transferFeeRate: fees.transferFeePercent / 100,
    stampDutyRate: fees.stampDutyPercent / 100,
    priceTick: 0.01,
  }), [fees]);

  const availableStocks = STOCK_PRESETS.filter(
    (stock) => !holdings.some((holding) => holding.symbol === stock.symbol),
  );

  function updateHolding(id: string, patch: Partial<Holding>) {
    setHoldings((current) => current.map((holding) => holding.id === id ? { ...holding, ...patch } : holding));
  }

  function addHolding() {
    const stock = STOCK_PRESETS.find((item) => item.symbol === selectedSymbol);
    if (!stock || holdings.some((holding) => holding.symbol === stock.symbol)) return;
    setHoldings((current) => [...current, {
      ...stock,
      id: createId("holding"),
      baseShares: null,
      baseUnitCost: null,
      lots: [],
    }]);
  }

  function addLot(holdingId: string) {
    setHoldings((current) => current.map((holding) => holding.id === holdingId ? {
      ...holding,
      lots: [...holding.lots, {
        id: createId("lot"),
        batchId: "",
        date: localDate(),
        shares: null,
        price: null,
        actualBuyFee: null,
        expectedSellFee: null,
      }],
    } : holding));
  }

  function updateLot(holdingId: string, lotId: string, patch: Partial<BuyLot>) {
    setHoldings((current) => current.map((holding) => holding.id === holdingId ? {
      ...holding,
      lots: holding.lots.map((lot) => lot.id === lotId ? { ...lot, ...patch } : lot),
    } : holding));
  }

  function removeLot(holdingId: string, lotId: string) {
    setHoldings((current) => current.map((holding) => holding.id === holdingId ? {
      ...holding,
      lots: holding.lots.filter((lot) => lot.id !== lotId),
    } : holding));
  }

  return (
    <main className="portfolio-shell">
      <header className="portfolio-topbar">
        <div className="brand">
          <span className="brand-mark">私</span>
          <span><strong>私人持仓台账</strong><small>PASSWORD PROTECTED · 本人可见</small></span>
        </div>
        <div className="topbar-actions">
          <div className="save-status"><i />{savedAt ? `本机已保存 ${savedAt}` : "数据仅保存在本机"}</div>
          <form action="/auth/logout" method="post"><button className="logout-button" type="submit">退出登录</button></form>
        </div>
      </header>

      <section className="portfolio-intro">
        <div>
          <span className="eyebrow">持仓管理 · 做T测算</span>
          <h1>把底仓守住，<br />每一笔交易算清楚。</h1>
          <p>底仓、新买批次、交易费用和整仓盈亏分开记录。只有输入专属账号和口令才能打开本站。</p>
        </div>
        <div className="fee-hero">
          <span>当前账户口径</span>
          <strong>万一免五</strong>
          <div><span>买入综合费率</span><b>{formatPercent(fees.commissionPercent + fees.transferFeePercent)}</b></div>
          <div><span>卖出综合费率</span><b>{formatPercent(fees.commissionPercent + fees.transferFeePercent + fees.stampDutyPercent)}</b></div>
          <div><span>最小报价单位</span><b>¥0.01</b></div>
        </div>
      </section>

      <section className="portfolio-toolbar">
        <div><span className="eyebrow">股票持仓</span><h2>{holdings.length} 只股票</h2></div>
        <div className="add-stock">
          <select aria-label="选择股票" value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}>
            {availableStocks.map((stock) => <option value={stock.symbol} key={stock.symbol}>{stock.name} · {stock.code} · {stock.market}</option>)}
          </select>
          <button type="button" onClick={addHolding} disabled={!availableStocks.length}>＋ 添加股票</button>
        </div>
      </section>

      <section className="portfolio-layout">
        <div className="holdings-list">
          {holdings.map((holding, index) => {
            const baseShares = holding.baseShares ?? 0;
            const baseReady = baseShares === 0 || (holding.baseUnitCost ?? 0) > 0;
            const baseCost = baseShares * (holding.baseUnitCost ?? 0);
            const lotTransactions = holding.lots
              .filter((lot) => (lot.shares ?? 0) > 0 && (lot.price ?? 0) > 0)
              .map((lot) => ({ lot, buy: calculateLotBuy(lot, rates) }));
            const newShares = lotTransactions.reduce((sum, item) => sum + item.buy.shares, 0);
            const newCost = lotTransactions.reduce((sum, item) => sum + item.buy.totalCost, 0);
            const totalShares = baseShares + newShares;
            const totalCost = baseCost + newCost;
            const wholeSale = baseReady ? findMinimumProfitableSale(totalShares, totalCost, rates) : null;
            const currentResult = baseReady && holding.referencePrice > 0 && totalShares > 0
              ? calculateProfitAtPrice(totalShares, totalCost, holding.referencePrice, rates)
              : null;

            return (
              <article className="holding-card" key={holding.id}>
                <div className="holding-head">
                  <div className="stock-name"><span>{String(index + 1).padStart(2, "0")}</span><div><small>{holding.market} · {holding.code}</small><h2>{holding.name}</h2></div></div>
                  <label className="reference-price"><span>当前参考价</span><span className="currency-input"><i>¥</i><input aria-label={`${holding.name}当前参考价`} type="number" min="0" step="0.01" value={holding.referencePrice} onChange={(event) => updateHolding(holding.id, { referencePrice: Number(event.target.value) })} /></span></label>
                  <button className="remove-holding" type="button" onClick={() => setHoldings((current) => current.filter((item) => item.id !== holding.id))}>删除</button>
                </div>

                <div className="base-panel">
                  <div className="base-copy"><span className="eyebrow">长期底仓</span><h3>底仓信息</h3><p>成本价填写券商显示的持仓成本，视为已经包含历史交易费用。</p></div>
                  <label><span>底仓股数</span><input type="number" min="0" step="100" value={holding.baseShares ?? ""} onChange={(event) => updateHolding(holding.id, { baseShares: optionalNumber(event.target.value) })} placeholder="如 1500" /></label>
                  <label><span>底仓成本价 / 股</span><input type="number" min="0" step="0.01" value={holding.baseUnitCost ?? ""} onChange={(event) => updateHolding(holding.id, { baseUnitCost: optionalNumber(event.target.value) })} placeholder="按券商成本填写" /></label>
                  <div className="base-total"><span>底仓成本总额</span><strong>{baseReady && baseShares > 0 ? `¥${money.format(baseCost)}` : "待补充成本"}</strong></div>
                </div>

                <div className="lot-heading"><div><span className="eyebrow">新买记录</span><h3>做T批次</h3></div><button type="button" onClick={() => addLot(holding.id)}>＋ 新增买入</button></div>
                {holding.lots.length === 0 ? <div className="empty-lots">还没有新买记录。新增后自动计算最低盈利卖价。</div> : (
                  <div className="lot-table-wrap"><table className="lot-table"><thead><tr><th>批次 / 日期</th><th>股数</th><th>买入价</th><th>实际买入费</th><th>含费成本</th><th>预计卖出费</th><th>最低盈利卖价</th><th>最低卖出金额</th><th /></tr></thead><tbody>
                    {holding.lots.map((lot) => {
                      const valid = (lot.shares ?? 0) > 0 && (lot.price ?? 0) > 0;
                      const buy = calculateLotBuy(lot, rates);
                      const minimumSale = valid
                        ? lot.expectedSellFee != null
                          ? findMinimumProfitableSaleWithFixedFee(
                              buy.shares,
                              buy.totalCost,
                              lot.expectedSellFee,
                              rates.priceTick,
                            )
                          : findMinimumProfitableSale(buy.shares, buy.totalCost, rates)
                        : null;
                      return <tr key={lot.id}>
                        <td><span className="batch-id">{lot.batchId || "未编号"}</span><input aria-label="买入日期" type="date" value={lot.date} onChange={(event) => updateLot(holding.id, lot.id, { date: event.target.value })} /></td>
                        <td><input aria-label="买入股数" type="number" min="0" step="100" value={lot.shares ?? ""} onChange={(event) => updateLot(holding.id, lot.id, { shares: optionalNumber(event.target.value) })} placeholder="300" /></td>
                        <td><input aria-label="买入价格" type="number" min="0" step="0.01" value={lot.price ?? ""} onChange={(event) => updateLot(holding.id, lot.id, { price: optionalNumber(event.target.value) })} placeholder="52.39" /></td>
                        <td><input aria-label="实际买入费用" type="number" min="0" step="0.01" value={lot.actualBuyFee ?? ""} onChange={(event) => updateLot(holding.id, lot.id, { actualBuyFee: optionalNumber(event.target.value) })} placeholder={valid ? money.format(calculateBuyTransaction(lot.shares ?? 0, lot.price ?? 0, rates).totalFees) : "自动"} /></td>
                        <td>{valid ? <><strong>¥{money.format(buy.totalCost)}</strong><small>¥{precisePrice.format(buy.unitCost)} / 股</small></> : "—"}</td>
                        <td><input aria-label="预计卖出费用" type="number" min="0" step="0.01" value={lot.expectedSellFee ?? ""} onChange={(event) => updateLot(holding.id, lot.id, { expectedSellFee: optionalNumber(event.target.value) })} placeholder="按费率" /></td>
                        <td className="profit-price">{minimumSale ? <><strong>¥{money.format(minimumSale.minimumProfitPrice)}</strong><small>需涨 ¥{money.format(minimumSale.minimumProfitPrice - (lot.price ?? 0))}</small></> : "—"}</td>
                        <td>{minimumSale ? <><strong>¥{money.format(minimumSale.grossAmount)}</strong><small>卖出费 ¥{money.format(minimumSale.totalFees)}</small></> : "—"}</td>
                        <td><button className="delete-lot" type="button" onClick={() => removeLot(holding.id, lot.id)}>×</button></td>
                      </tr>;
                    })}
                  </tbody></table></div>
                )}

                <div className="position-summary">
                  <div><span>总持仓</span><strong>{integer.format(totalShares)} 股</strong><small>底仓 {integer.format(baseShares)} + 新买 {integer.format(newShares)}</small></div>
                  <div><span>总投入成本</span><strong>{baseReady ? `¥${money.format(totalCost)}` : "待补充底仓成本"}</strong><small>{baseReady && totalShares > 0 ? `综合成本 ¥${precisePrice.format(totalCost / totalShares)} / 股` : "填写完整后计算"}</small></div>
                  <div className="summary-focus"><span>整仓最低盈利卖价</span><strong>{wholeSale ? `¥${money.format(wholeSale.minimumProfitPrice)}` : "—"}</strong><small>{wholeSale ? `全部卖出金额 ¥${money.format(wholeSale.grossAmount)}` : "需先填写底仓成本"}</small></div>
                  <div className={currentResult && currentResult.profit >= 0 ? "positive" : "negative"}><span>按参考价全部卖出</span><strong>{currentResult ? `${currentResult.profit >= 0 ? "+" : "−"}¥${money.format(Math.abs(currentResult.profit))}` : "—"}</strong><small>{currentResult ? `已扣预计卖出费用 ¥${money.format(currentResult.totalFees)}` : "价格或成本待补充"}</small></div>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="fee-settings">
          <span className="eyebrow">费用设置</span><h2>交易费率</h2><p>默认按万一免五计算，每项费用按分四舍五入。</p>
          <label><span>券商佣金（双向）</span><span className="percent-input"><input type="number" min="0" step="0.001" value={fees.commissionPercent} onChange={(event) => setFees((current) => ({ ...current, commissionPercent: Number(event.target.value) }))} /><i>%</i></span></label>
          <label><span>A股过户费（双向）</span><span className="percent-input"><input type="number" min="0" step="0.001" value={fees.transferFeePercent} onChange={(event) => setFees((current) => ({ ...current, transferFeePercent: Number(event.target.value) }))} /><i>%</i></span></label>
          <label><span>印花税（仅卖出）</span><span className="percent-input"><input type="number" min="0" step="0.01" value={fees.stampDutyPercent} onChange={(event) => setFees((current) => ({ ...current, stampDutyPercent: Number(event.target.value) }))} /><i>%</i></span></label>
          <div className="fee-rules"><div><span>买入</span><b>佣金 + 过户费</b></div><div><span>卖出</span><b>佣金 + 过户费 + 印花税</b></div><div><span>最低佣金</span><b>¥0（免五）</b></div></div>
          <div className="formula"><strong>计算方法</strong><p>最低盈利价是第一个满足“卖出净额 &gt; 含费成本”的 ¥0.01 报价。</p></div>
          <div className="privacy-note"><strong>隐私说明</strong><p>持仓与买卖记录仅保存在当前浏览器，不会写入网站代码或公开数据。</p></div>
          <small>实际费用可能存在规费合并或尾差，请以券商交割单为准，可在上方调整费率。</small>
        </aside>
      </section>
    </main>
  );
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function calculateLotBuy(lot: BuyLot, rates: AShareFeeRates) {
  const calculated = calculateBuyTransaction(lot.shares ?? 0, lot.price ?? 0, rates);
  const totalFees = lot.actualBuyFee ?? calculated.totalFees;
  const totalCost = roundMoney(calculated.grossAmount + totalFees);
  return {
    ...calculated,
    totalFees,
    totalCost,
    unitCost: calculated.shares > 0 ? totalCost / calculated.shares : 0,
  };
}

function mergeLedgerData(holdings: Holding[]): Holding[] {
  const importedHolding = DEFAULT_HOLDINGS[0];
  const existing = holdings.find((holding) => holding.symbol === importedHolding.symbol);
  if (!existing) return [importedHolding, ...holdings];

  const mergedLots = existing.lots.map((lot) => {
    const importedLot = importedHolding.lots.find(
      (candidate) => candidate.shares === lot.shares && candidate.price === lot.price,
    );
    return importedLot
      ? {
          ...lot,
          batchId: lot.batchId || importedLot.batchId,
          actualBuyFee: lot.actualBuyFee ?? importedLot.actualBuyFee,
          expectedSellFee: lot.expectedSellFee ?? importedLot.expectedSellFee,
        }
      : lot;
  });

  for (const importedLot of importedHolding.lots) {
    const alreadyPresent = mergedLots.some(
      (lot) => lot.shares === importedLot.shares && lot.price === importedLot.price,
    );
    if (!alreadyPresent) mergedLots.push(importedLot);
  }

  return holdings.map((holding) => holding.symbol === importedHolding.symbol
    ? { ...holding, baseShares: 1500, lots: mergedLots }
    : holding);
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function localDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatPercent(value: number) {
  return `${value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`;
}
