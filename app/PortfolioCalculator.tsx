"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateAdjustedHoldingCosts,
  calculateBuyTransaction,
  calculateProfitAtPrice,
  calculateRealizedLotSale,
  calculateRemainingLotCost,
  findMinimumProfitableSale,
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
  soldShares?: number | null;
  price: number | null;
  sellPrice?: number | null;
  applyProfitToCost?: boolean;
};

type Holding = StockPreset & {
  id: string;
  baseShares: number | null;
  baseUnitCost: number | null;
  totalCostOverride?: number | null;
  lots: BuyLot[];
};

type FeeForm = {
  commissionPercent: number;
  minimumCommission: number;
  transferFeePercent: number;
  stampDutyPercent: number;
};

type SavedPortfolio = {
  version: 7;
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
  minimumCommission: 1,
  transferFeePercent: 0.001,
  stampDutyPercent: 0.05,
};
const DEFAULT_HOLDINGS: Holding[] = [
  {
    ...STOCK_PRESETS[0],
    id: "holding-601318",
    baseShares: 1500,
    baseUnitCost: 50.987,
    totalCostOverride: 91777.18,
    lots: [
      {
        id: "lot-t-001-a",
        batchId: "T-001-A",
        date: "",
        shares: 200,
        soldShares: 0,
        price: 52.39,
        sellPrice: null,
        applyProfitToCost: true,
      },
      {
        id: "lot-t-001-b",
        batchId: "T-001-B",
        date: "",
        shares: 200,
        soldShares: 100,
        price: 52.42,
        sellPrice: null,
        applyProfitToCost: true,
      },
    ],
  },
];
const STORAGE_KEY = "private-stock-portfolio-v7";
const PREVIOUS_STORAGE_KEYS = ["private-stock-portfolio-v6", "private-stock-portfolio-v5", "private-stock-portfolio-v4", "private-stock-portfolio-v3", "private-stock-portfolio-v2", "private-stock-portfolio-v1"];
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
        if (saved.version === 7 && Array.isArray(saved.holdings)) {
          setHoldings(saved.holdings);
          setFees({ ...DEFAULT_FEES, ...saved.fees });
        }
      } else {
        const previousValue = PREVIOUS_STORAGE_KEYS
          .map((key) => window.localStorage.getItem(key))
          .find((item): item is string => Boolean(item));
        if (previousValue) {
          const previous = JSON.parse(previousValue) as Omit<SavedPortfolio, "version"> & { version: 1 | 2 | 3 | 4 | 5 | 6 };
          if ([1, 2, 3, 4, 5, 6].includes(previous.version) && Array.isArray(previous.holdings)) {
            setHoldings(mergeLedgerData(previous.holdings));
            setFees({ ...DEFAULT_FEES, ...previous.fees });
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
    const saved: SavedPortfolio = { version: 7, holdings, fees };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
  }, [fees, holdings, isReady]);

  const rates = useMemo<AShareFeeRates>(() => ({
    commissionRate: fees.commissionPercent / 100,
    minimumCommission: fees.minimumCommission,
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
      totalCostOverride: null,
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
        soldShares: 0,
        price: null,
        sellPrice: null,
        applyProfitToCost: true,
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
          <strong>万一 · 最低 ¥{money.format(fees.minimumCommission)}</strong>
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
            const lotTransactions = holding.lots
              .filter((lot) => (lot.shares ?? 0) > 0 && (lot.price ?? 0) > 0)
              .map((lot) => ({ lot, position: calculateLotPosition(lot, rates) }));
            const newShares = lotTransactions.reduce((sum, item) => sum + item.position.remainingShares, 0);
            const totalShares = baseShares + newShares;
            const calculatedTotalCost = roundMoney(totalShares * (holding.baseUnitCost ?? 0));
            const totalCost = (holding.totalCostOverride ?? 0) > 0
              ? roundMoney(holding.totalCostOverride ?? 0)
              : calculatedTotalCost;
            const costReady = totalShares === 0 || totalCost > 0;
            const wholeSale = costReady ? findMinimumProfitableSale(totalShares, totalCost, rates) : null;
            const currentResult = costReady && holding.referencePrice > 0 && totalShares > 0
              ? calculateProfitAtPrice(totalShares, totalCost, holding.referencePrice, rates)
              : null;
            const currentMarketValue = roundMoney(totalShares * holding.referencePrice);
            const grossProfit = currentResult ? roundMoney(currentMarketValue - totalCost) : null;
            const grossReturn = currentResult && (holding.baseUnitCost ?? 0) > 0
              ? ((holding.referencePrice / (holding.baseUnitCost ?? 1)) - 1) * 100
              : null;
            const remainingLotCost = roundMoney(
              lotTransactions.reduce((sum, item) => sum + item.position.remainingCost, 0),
            );
            const completedSales = lotTransactions.filter((item) => item.position.realizedSale);
            const appliedSales = completedSales.filter((item) => item.lot.applyProfitToCost !== false);
            const realizedProfitToApply = roundMoney(
              appliedSales.reduce((sum, item) => sum + (item.position.realizedSale?.profit ?? 0), 0),
            );
            const adjustedCosts = costReady && baseShares > 0
              ? calculateAdjustedHoldingCosts(
                  totalCost,
                  baseShares,
                  totalShares,
                  remainingLotCost,
                  realizedProfitToApply,
                )
              : null;

            return (
              <article className="holding-card" key={holding.id}>
                <div className="holding-head">
                  <div className="stock-name"><span>{String(index + 1).padStart(2, "0")}</span><div><small>{holding.market} · {holding.code}</small><h2>{holding.name}</h2></div></div>
                  <label className="reference-price"><span>当前参考价</span><span className="currency-input"><i>¥</i><input aria-label={`${holding.name}当前参考价`} type="number" min="0" step="0.01" value={holding.referencePrice} onChange={(event) => updateHolding(holding.id, { referencePrice: Number(event.target.value) })} /></span></label>
                  <button className="remove-holding" type="button" onClick={() => setHoldings((current) => current.filter((item) => item.id !== holding.id))}>删除</button>
                </div>

                <div className="base-panel">
                  <div className="base-copy"><span className="eyebrow">长期底仓</span><h3>持仓信息</h3><p>底仓股数与券商成本分开记录；精确总成本用于校准券商浮盈和预计卖出净收益。</p></div>
                  <label><span>底仓股数</span><input type="number" min="0" step="100" value={holding.baseShares ?? ""} onChange={(event) => updateHolding(holding.id, { baseShares: optionalNumber(event.target.value) })} placeholder="如 1500" /></label>
                  <label><span>整仓综合成本价 / 股</span><input type="number" min="0" step="0.001" value={holding.baseUnitCost ?? ""} onChange={(event) => updateHolding(holding.id, { baseUnitCost: optionalNumber(event.target.value) })} placeholder="按券商成本填写" /></label>
                  <label><span>券商精确总成本</span><input type="number" min="0" step="0.01" value={holding.totalCostOverride ?? ""} onChange={(event) => updateHolding(holding.id, { totalCostOverride: optionalNumber(event.target.value) })} placeholder={calculatedTotalCost ? money.format(calculatedTotalCost) : "自动计算"} /></label>
                </div>

                <div className="lot-heading"><div><span className="eyebrow">新买记录</span><h3>做T批次</h3></div><button type="button" onClick={() => addLot(holding.id)}>＋ 新增买入</button></div>
                {holding.lots.length === 0 ? <div className="empty-lots">还没有新买记录。新增后自动计算最低盈利卖价。</div> : (
                  <div className="lot-table-wrap"><table className="lot-table"><thead><tr><th>批次 / 日期</th><th>买入</th><th>已卖</th><th>剩余</th><th>买入价</th><th>卖出价</th><th>自动买入费</th><th>自动卖出费</th><th>已实现盈亏</th><th>剩余含费成本</th><th>剩余最低盈利价</th><th /></tr></thead><tbody>
                    {holding.lots.map((lot) => {
                      const valid = (lot.shares ?? 0) > 0 && (lot.price ?? 0) > 0;
                      const position = calculateLotPosition(lot, rates);
                      const minimumSale = valid && position.remainingShares > 0
                        ? findMinimumProfitableSale(position.remainingShares, position.remainingCost, rates)
                        : null;
                      return <tr key={lot.id}>
                        <td><span className="batch-id">{lot.batchId || "未编号"}</span><input aria-label="买入日期" type="date" value={lot.date} onChange={(event) => updateLot(holding.id, lot.id, { date: event.target.value })} /></td>
                        <td><input aria-label="买入股数" type="number" min="0" step="100" value={lot.shares ?? ""} onChange={(event) => updateLot(holding.id, lot.id, { shares: optionalNumber(event.target.value) })} placeholder="300" /></td>
                        <td><input aria-label="已卖股数" type="number" min="0" max={lot.shares ?? undefined} step="100" value={lot.soldShares ?? 0} onChange={(event) => updateLot(holding.id, lot.id, { soldShares: optionalNumber(event.target.value) })} placeholder="0" /></td>
                        <td><strong>{integer.format(position.remainingShares)}</strong><small>持仓股数</small></td>
                        <td><input aria-label="买入价格" type="number" min="0" step="0.01" value={lot.price ?? ""} onChange={(event) => updateLot(holding.id, lot.id, { price: optionalNumber(event.target.value) })} placeholder="52.39" /></td>
                        <td><input aria-label="卖出价格" type="number" min="0" step="0.01" disabled={position.soldShares <= 0} value={lot.sellPrice ?? ""} onChange={(event) => updateLot(holding.id, lot.id, { sellPrice: optionalNumber(event.target.value) })} placeholder={position.soldShares > 0 ? "填写成交价" : "先填已卖"} />{position.realizedSale ? <small>卖出金额 ¥{money.format(position.realizedSale.grossAmount)}</small> : null}</td>
                        <td className="auto-fee">{valid ? <><strong>¥{money.format(position.totalFees)}</strong><small>金额 ¥{money.format(position.grossAmount)}</small></> : "—"}</td>
                        <td className="auto-fee">{position.realizedSale ? <><strong>¥{money.format(position.realizedSale.totalFees)}</strong><small>净回款 ¥{money.format(position.realizedSale.netProceeds)}</small></> : position.soldShares > 0 ? <small>等待填写卖出价</small> : <small>尚未卖出</small>}</td>
                        <td className={position.realizedSale && position.realizedSale.profit >= 0 ? "realized-profit positive" : "realized-profit negative"}>{position.realizedSale ? <><strong>{position.realizedSale.profit >= 0 ? "+" : "−"}¥{money.format(Math.abs(position.realizedSale.profit))}</strong><small>卖出成本 ¥{money.format(position.realizedSale.soldCost)}</small><label className="apply-profit-toggle"><input type="checkbox" checked={lot.applyProfitToCost !== false} onChange={(event) => updateLot(holding.id, lot.id, { applyProfitToCost: event.target.checked })} /><span>计入降本</span></label></> : <small>填写卖出价后计算</small>}</td>
                        <td>{valid ? <><strong>¥{money.format(position.remainingCost)}</strong><small>买入费分摊 ¥{money.format(position.remainingBuyFee)}</small></> : "—"}</td>
                        <td className="profit-price">{minimumSale ? <><strong>¥{money.format(minimumSale.minimumProfitPrice)}</strong><small>需涨 ¥{money.format(minimumSale.minimumProfitPrice - (lot.price ?? 0))}</small></> : "—"}</td>
                        <td><button className="delete-lot" type="button" onClick={() => removeLot(holding.id, lot.id)}>×</button></td>
                      </tr>;
                    })}
                  </tbody></table></div>
                )}

                <section className="cost-adjustment">
                  <div className="cost-adjustment-head">
                    <div><span className="eyebrow">做T降本结果</span><h3>盈利自动计入持仓成本</h3></div>
                    <p>卖出价填写后自动计算真实盈利。若券商成本已经包含某笔收益，可取消该笔“计入降本”，避免重复扣减。</p>
                  </div>
                  <div className="cost-adjustment-grid">
                    <div className={realizedProfitToApply >= 0 ? "positive" : "negative"}><span>累计已实现盈亏</span><strong>{completedSales.length ? `${realizedProfitToApply >= 0 ? "+" : "−"}¥${money.format(Math.abs(realizedProfitToApply))}` : "等待卖出价"}</strong><small>{completedSales.length ? `已计入 ${appliedSales.length} 笔 / 已完成 ${completedSales.length} 笔` : "填写已卖股数和实际卖出价"}</small></div>
                    <div><span>{integer.format(baseShares)} 股底仓推算成本</span><strong>{adjustedCosts ? `¥${money.format(adjustedCosts.baseCostBeforeAdjustment)}` : "—"}</strong><small>{adjustedCosts ? `计入前 ¥${precisePrice.format(adjustedCosts.baseUnitCostBeforeAdjustment)} / 股` : "需先填写整仓总成本"}</small></div>
                    <div className="summary-focus"><span>计入盈亏后底仓成本</span><strong>{adjustedCosts ? `¥${money.format(adjustedCosts.adjustedBaseCost)}` : "—"}</strong><small>{adjustedCosts ? `策略成本 ¥${precisePrice.format(adjustedCosts.adjustedBaseUnitCost)} / 股` : "完成卖出后自动更新"}</small></div>
                    <div><span>计入盈亏后整仓成本</span><strong>{adjustedCosts ? `¥${money.format(adjustedCosts.adjustedTotalCost)}` : "—"}</strong><small>{adjustedCosts ? `策略成本 ¥${precisePrice.format(adjustedCosts.adjustedTotalUnitCost)} / 股` : "完成卖出后自动更新"}</small></div>
                  </div>
                </section>

                <div className="position-summary">
                  <div><span>总持仓</span><strong>{integer.format(totalShares)} 股</strong><small>底仓 {integer.format(baseShares)} + 新买 {integer.format(newShares)}</small></div>
                  <div><span>总投入成本</span><strong>{costReady ? `¥${money.format(totalCost)}` : "待补充整仓成本"}</strong><small>{costReady && totalShares > 0 ? `综合成本 ¥${precisePrice.format(totalCost / totalShares)} / 股` : "填写完整后计算"}</small></div>
                  <div className={grossProfit != null && grossProfit >= 0 ? "positive" : "negative"}><span>券商口径浮盈</span><strong>{grossProfit != null ? `${grossProfit >= 0 ? "+" : "−"}¥${money.format(Math.abs(grossProfit))}` : "—"}</strong><small>{grossReturn != null ? `${grossReturn >= 0 ? "+" : ""}${grossReturn.toFixed(3)}% · 未扣卖出费用` : "价格或成本待补充"}</small></div>
                  <div className="summary-focus"><span>整仓最低盈利卖价</span><strong>{wholeSale ? `¥${money.format(wholeSale.minimumProfitPrice)}` : "—"}</strong><small>{wholeSale ? `全部卖出金额 ¥${money.format(wholeSale.grossAmount)}` : "需先填写整仓成本"}</small></div>
                  <div className={currentResult && currentResult.profit >= 0 ? "positive" : "negative"}><span>全部卖出预计净收益</span><strong>{currentResult ? `${currentResult.profit >= 0 ? "+" : "−"}¥${money.format(Math.abs(currentResult.profit))}` : "—"}</strong><small>{currentResult ? `已扣预计卖出费用 ¥${money.format(currentResult.totalFees)}` : "价格或成本待补充"}</small></div>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="fee-settings">
          <span className="eyebrow">费用设置</span><h2>交易费率</h2><p>按您的光大证券交割明细：佣金万一、每笔最低 1 元。</p>
          <label><span>券商佣金（双向）</span><span className="percent-input"><input type="number" min="0" step="0.001" value={fees.commissionPercent} onChange={(event) => setFees((current) => ({ ...current, commissionPercent: Number(event.target.value) }))} /><i>%</i></span></label>
          <label><span>单笔最低佣金</span><span className="currency-setting"><i>¥</i><input type="number" min="0" step="0.01" value={fees.minimumCommission} onChange={(event) => setFees((current) => ({ ...current, minimumCommission: Number(event.target.value) }))} /></span></label>
          <label><span>A股过户费（双向）</span><span className="percent-input"><input type="number" min="0" step="0.001" value={fees.transferFeePercent} onChange={(event) => setFees((current) => ({ ...current, transferFeePercent: Number(event.target.value) }))} /><i>%</i></span></label>
          <label><span>印花税（仅卖出）</span><span className="percent-input"><input type="number" min="0" step="0.01" value={fees.stampDutyPercent} onChange={(event) => setFees((current) => ({ ...current, stampDutyPercent: Number(event.target.value) }))} /><i>%</i></span></label>
          <div className="fee-rules"><div><span>买入</span><b>佣金 + 过户费</b></div><div><span>卖出</span><b>佣金 + 过户费 + 印花税</b></div><div><span>最低佣金</span><b>¥{money.format(fees.minimumCommission)} / 笔</b></div></div>
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
  return calculateBuyTransaction(lot.shares ?? 0, lot.price ?? 0, rates);
}

function calculateLotPosition(lot: BuyLot, rates: AShareFeeRates) {
  const buy = calculateLotBuy(lot, rates);
  const remaining = calculateRemainingLotCost(
    buy.shares,
    buy.price,
    buy.totalFees,
    lot.soldShares ?? 0,
  );
  const realizedSale = calculateRealizedLotSale(
    remaining.soldShares,
    buy.price,
    remaining.soldBuyFee,
    lot.sellPrice ?? 0,
    rates,
  );
  return { ...buy, ...remaining, realizedSale };
}

function mergeLedgerData(holdings: Holding[]): Holding[] {
  const importedHolding = DEFAULT_HOLDINGS[0];
  const existing = holdings.find((holding) => holding.symbol === importedHolding.symbol);
  if (!existing) return [importedHolding, ...holdings];

  const mergedLots = existing.lots.map((lot) => {
    const importedLot = importedHolding.lots.find(
      (candidate) => candidate.id === lot.id
        || candidate.batchId === lot.batchId
        || (candidate.shares === lot.shares && candidate.price === lot.price),
    );
    return importedLot
      ? {
          ...lot,
          shares: importedLot.shares,
          soldShares: lot.soldShares ?? importedLot.soldShares,
          batchId: lot.batchId || importedLot.batchId,
          sellPrice: lot.sellPrice ?? importedLot.sellPrice,
          applyProfitToCost: lot.applyProfitToCost ?? true,
        }
      : { ...lot, sellPrice: lot.sellPrice ?? null, applyProfitToCost: lot.applyProfitToCost ?? true };
  });

  for (const importedLot of importedHolding.lots) {
    const alreadyPresent = mergedLots.some(
      (lot) => lot.id === importedLot.id
        || lot.batchId === importedLot.batchId
        || (lot.shares === importedLot.shares && lot.price === importedLot.price),
    );
    if (!alreadyPresent) mergedLots.push(importedLot);
  }

  return holdings.map((holding) => holding.symbol === importedHolding.symbol
    ? {
        ...holding,
        baseShares: 1500,
        baseUnitCost: holding.baseUnitCost ?? importedHolding.baseUnitCost,
        totalCostOverride: holding.totalCostOverride ?? importedHolding.totalCostOverride,
        referencePrice: 52.8,
        lots: mergedLots,
      }
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
