"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateBrokerAdjustedPosition,
  calculateBuyTransaction,
  calculateFifoSale,
  calculateProfitAtPrice,
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

export type BuyLot = {
  id: string;
  batchId?: string;
  date: string;
  shares: number | null;
  price: number | null;
  buyFee?: number | null;
  draftSellShares?: number | null;
  draftSellPrice?: number | null;
};

export type SoldTrade = {
  id: string;
  date: string;
  batchId: string;
  shares: number;
  averageBuyPrice: number;
  buyFee: number;
  soldCost: number;
  sellPrice: number;
  grossAmount: number;
  sellFee: number;
  netProceeds: number;
  profit: number;
  mode: "单笔" | "批量" | "旧记录";
  confirmedAt: string;
};

export type Holding = StockPreset & {
  id: string;
  baseShares: number | null;
  baseUnitCost: number | null;
  totalCostOverride?: number | null;
  lots: BuyLot[];
  soldTrades: SoldTrade[];
};

export type FeeForm = {
  commissionPercent: number;
  minimumCommission: number;
  transferFeePercent: number;
  stampDutyPercent: number;
};

export type SavedPortfolio = {
  version: 8;
  holdings: Holding[];
  fees: FeeForm;
};

type LegacyBuyLot = BuyLot & {
  soldShares?: number | null;
  sellPrice?: number | null;
};

type LegacyHolding = Omit<Holding, "lots" | "soldTrades"> & {
  lots: LegacyBuyLot[];
  soldTrades?: SoldTrade[];
};

type BulkSaleDraft = {
  shares: number | null;
  price: number | null;
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

export const DEFAULT_FEES: FeeForm = {
  commissionPercent: 0.01,
  minimumCommission: 1,
  transferFeePercent: 0.001,
  stampDutyPercent: 0.05,
};

const STORAGE_KEY = "private-stock-portfolio-v8";
const PREVIOUS_STORAGE_KEYS = [
  "private-stock-portfolio-v7",
  "private-stock-portfolio-v6",
  "private-stock-portfolio-v5",
  "private-stock-portfolio-v4",
  "private-stock-portfolio-v3",
  "private-stock-portfolio-v2",
  "private-stock-portfolio-v1",
];
const money = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const precisePrice = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const integer = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });

type PortfolioCalculatorProps = {
  initialHoldings?: Holding[] | LegacyHolding[];
  onLogout?: () => void;
};

export default function PortfolioCalculator({ initialHoldings = [], onLogout }: PortfolioCalculatorProps) {
  const [holdings, setHoldings] = useState<Holding[]>(() => migrateHoldings(initialHoldings));
  const [fees, setFees] = useState<FeeForm>(DEFAULT_FEES);
  const [selectedSymbol, setSelectedSymbol] = useState(STOCK_PRESETS[1].symbol);
  const [bulkSaleDrafts, setBulkSaleDrafts] = useState<Record<string, BulkSaleDraft>>({});
  const [isReady, setIsReady] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const value = window.localStorage.getItem(STORAGE_KEY);
        if (value) {
          const saved = JSON.parse(value) as SavedPortfolio;
          if (saved.version === 8 && Array.isArray(saved.holdings)) {
            setHoldings(migrateHoldings(saved.holdings));
            setFees({ ...DEFAULT_FEES, ...saved.fees });
          }
        } else {
          const previousValue = PREVIOUS_STORAGE_KEYS
            .map((key) => window.localStorage.getItem(key))
            .find((item): item is string => Boolean(item));
          if (previousValue) {
            const previous = JSON.parse(previousValue) as { holdings?: LegacyHolding[]; fees?: FeeForm };
            if (Array.isArray(previous.holdings)) {
              setHoldings(migrateHoldings(previous.holdings));
              setFees({ ...DEFAULT_FEES, ...previous.fees });
            }
          }
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        setIsReady(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!isReady) return;
    const saved: SavedPortfolio = { version: 8, holdings, fees };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    queueMicrotask(() => {
      setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
    });
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
      soldTrades: [],
    }]);
  }

  function addLot(holdingId: string) {
    setHoldings((current) => current.map((holding) => holding.id === holdingId ? {
      ...holding,
      lots: [...holding.lots, {
        id: createId("lot"),
        batchId: `T-${String(holding.lots.length + 1).padStart(3, "0")}`,
        date: localDate(),
        shares: null,
        price: null,
        buyFee: null,
        draftSellShares: null,
        draftSellPrice: null,
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

  function updateBulkDraft(holdingId: string, patch: Partial<BulkSaleDraft>) {
    setBulkSaleDrafts((current) => ({
      ...current,
      [holdingId]: { ...(current[holdingId] ?? { shares: null, price: null }), ...patch },
    }));
  }

  function confirmSale(holdingId: string, requestedShares: number, sellPrice: number, lotId?: string) {
    if (!requestedShares || !sellPrice) return;
    const confirmed = window.confirm(`确认卖出 ${integer.format(requestedShares)} 股，成交价 ¥${money.format(sellPrice)}？\n确认后该成交会进入“已卖出单子”，并按券商 T 口径更新整仓成本。`);
    if (!confirmed) return;

    setHoldings((current) => current.map((holding) => {
      if (holding.id !== holdingId) return holding;
      const candidates = holding.lots
        .filter((lot) => !lotId || lot.id === lotId)
        .map((lot) => toCostLot(lot, rates));
      const sale = calculateFifoSale(candidates, requestedShares, sellPrice, rates);
      if (!sale || !sale.fullyAllocated) return holding;

      const snapshot = getHoldingSnapshot(holding, rates);
      const remainingTotalShares = snapshot.totalShares - sale.shares;
      const adjusted = calculateBrokerAdjustedPosition(
        snapshot.totalCost,
        sale.netProceeds,
        remainingTotalShares,
      );
      const allocationMap = new Map(sale.allocations.map((allocation) => [allocation.id, allocation]));
      const batchId = sale.allocations
        .map((allocation) => holding.lots.find((lot) => lot.id === allocation.id)?.batchId || "未编号")
        .join(" + ");
      const nextLots = holding.lots.flatMap((lot) => {
        const allocation = allocationMap.get(lot.id);
        if (!allocation) return [lot];
        if (allocation.remainingShares <= 0) return [];
        return [{
          ...lot,
          shares: allocation.remainingShares,
          buyFee: allocation.remainingBuyFee,
          draftSellShares: null,
          draftSellPrice: null,
        }];
      });

      const trade: SoldTrade = {
        id: createId("sale"),
        date: localDate(),
        batchId,
        shares: sale.shares,
        averageBuyPrice: sale.averageBuyPrice,
        buyFee: sale.allocatedBuyFee,
        soldCost: sale.soldCost,
        sellPrice: sale.sellPrice,
        grossAmount: sale.grossAmount,
        sellFee: sale.totalFees,
        netProceeds: sale.netProceeds,
        profit: sale.profit,
        mode: lotId ? "单笔" : "批量",
        confirmedAt: new Date().toISOString(),
      };

      return {
        ...holding,
        baseUnitCost: adjusted.adjustedUnitCost,
        totalCostOverride: adjusted.adjustedTotalCost,
        lots: nextLots,
        soldTrades: [...holding.soldTrades, trade],
      };
    }));

    if (!lotId) {
      setBulkSaleDrafts((current) => ({ ...current, [holdingId]: { shares: null, price: null } }));
    }
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
          <form
            action={onLogout ? undefined : "/auth/logout"}
            method={onLogout ? undefined : "post"}
            onSubmit={onLogout ? (event) => { event.preventDefault(); onLogout(); } : undefined}
          >
            <button className="logout-button" type="submit">退出登录</button>
          </form>
        </div>
      </header>

      <section className="portfolio-intro">
        <div>
          <span className="eyebrow">持仓管理 · 做T测算</span>
          <h1>先看卖多少，<br />再决定怎么做T。</h1>
          <p>每一笔新买记录先显示最低盈利卖价；确认成交后自动归档，并按券商做T口径更新总股数和整仓成本。</p>
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
            const snapshot = getHoldingSnapshot(holding, rates);
            const openLots = holding.lots.filter((lot) => (lot.shares ?? 0) > 0 && (lot.price ?? 0) > 0);
            const openLotShares = openLots.reduce((sum, lot) => sum + (lot.shares ?? 0), 0);
            const openLotCost = roundMoney(openLots.reduce((sum, lot) => sum + getLotCost(lot, rates), 0));
            const allNewMinimum = openLotShares > 0 ? findMinimumProfitableSale(openLotShares, openLotCost, rates) : null;
            const bulkDraft = bulkSaleDrafts[holding.id] ?? { shares: null, price: null };
            const bulkPreview = calculateFifoSale(
              openLots.map((lot) => toCostLot(lot, rates)),
              bulkDraft.shares ?? 0,
              bulkDraft.price ?? 0,
              rates,
            );
            const wholeSale = snapshot.costReady && snapshot.totalCost > 0
              ? findMinimumProfitableSale(snapshot.totalShares, snapshot.totalCost, rates)
              : null;
            const currentResult = snapshot.costReady && holding.referencePrice > 0 && snapshot.totalShares > 0
              ? calculateProfitAtPrice(snapshot.totalShares, snapshot.totalCost, holding.referencePrice, rates)
              : null;
            const currentMarketValue = roundMoney(snapshot.totalShares * holding.referencePrice);
            const grossProfit = snapshot.costReady ? roundMoney(currentMarketValue - snapshot.totalCost) : null;
            const grossReturn = grossProfit != null && snapshot.totalCost !== 0
              ? (grossProfit / Math.abs(snapshot.totalCost)) * 100
              : null;
            const realizedProfit = roundMoney(holding.soldTrades.reduce((sum, trade) => sum + trade.profit, 0));

            return (
              <article className="holding-card" key={holding.id}>
                <div className="holding-head">
                  <div className="stock-name"><span>{String(index + 1).padStart(2, "0")}</span><div><small>{holding.market} · {holding.code}</small><h2>{holding.name}</h2></div></div>
                  <label className="reference-price"><span>当前参考价</span><span className="currency-input"><i>¥</i><input aria-label={`${holding.name}当前参考价`} type="number" min="0" step="0.01" value={holding.referencePrice} onChange={(event) => updateHolding(holding.id, { referencePrice: Number(event.target.value) })} /></span></label>
                  <button className="remove-holding" type="button" onClick={() => setHoldings((current) => current.filter((item) => item.id !== holding.id))}>删除</button>
                </div>

                <div className="base-panel">
                  <div className="base-copy"><span className="eyebrow">当前整仓</span><h3>持仓信息</h3><p>底仓股数用于区分长期仓位；卖出确认后只显示并更新整仓总股数与综合成本。</p></div>
                  <label><span>底仓股数</span><input type="number" min="0" step="100" value={holding.baseShares ?? ""} onChange={(event) => updateHolding(holding.id, { baseShares: optionalNumber(event.target.value) })} placeholder="如 1500" /></label>
                  <label><span>券商整仓成本价 / 股</span><input type="number" step="0.001" value={holding.baseUnitCost ?? ""} onChange={(event) => updateHolding(holding.id, { baseUnitCost: optionalSignedNumber(event.target.value) })} placeholder="按券商成本填写" /></label>
                  <label><span>券商精确总成本</span><input type="number" step="0.01" value={holding.totalCostOverride ?? ""} onChange={(event) => updateHolding(holding.id, { totalCostOverride: optionalSignedNumber(event.target.value) })} placeholder={snapshot.calculatedTotalCost ? money.format(snapshot.calculatedTotalCost) : "自动计算"} /></label>
                </div>

                {openLots.length > 0 ? (
                  <section className="bulk-sale-panel">
                    <div className="bulk-sale-highlight">
                      <span>全部新买一起卖 · 最低盈利价</span>
                      <strong>{allNewMinimum ? `¥${money.format(allNewMinimum.minimumProfitPrice)}` : "—"}</strong>
                      <small>{integer.format(openLotShares)} 股 · 含买入费成本 ¥{money.format(openLotCost)} · 卖出费按一笔计算</small>
                    </div>
                    <div className="bulk-sale-form">
                      <label><span>本次卖出股数</span><input type="number" min="0" max={openLotShares} step="100" value={bulkDraft.shares ?? ""} onChange={(event) => updateBulkDraft(holding.id, { shares: optionalNumber(event.target.value) })} placeholder={`${openLotShares}`} /></label>
                      <label><span>实际成交价</span><input type="number" min="0" step="0.01" value={bulkDraft.price ?? ""} onChange={(event) => updateBulkDraft(holding.id, { price: optionalNumber(event.target.value) })} placeholder={allNewMinimum ? money.format(allNewMinimum.minimumProfitPrice) : "0.00"} /></label>
                      <button className="fill-all-button" type="button" onClick={() => updateBulkDraft(holding.id, { shares: openLotShares })}>填入全部 {integer.format(openLotShares)} 股</button>
                    </div>
                    <div className="bulk-sale-result">
                      <span>券商T预计结果</span>
                      <strong className={bulkPreview && bulkPreview.profit >= 0 ? "positive-text" : "negative-text"}>{bulkPreview ? `${bulkPreview.profit >= 0 ? "+" : "−"}¥${money.format(Math.abs(bulkPreview.profit))}` : "等待输入"}</strong>
                      <small>{bulkPreview ? `卖出费 ¥${money.format(bulkPreview.totalFees)} · 净回款 ¥${money.format(bulkPreview.netProceeds)}` : "按先进先出分摊买入成本，卖出费用只算一笔"}</small>
                      <button type="button" disabled={!bulkPreview?.fullyAllocated} onClick={() => confirmSale(holding.id, bulkDraft.shares ?? 0, bulkDraft.price ?? 0)}>确认批量卖出</button>
                    </div>
                  </section>
                ) : null}

                <div className="lot-heading"><div><span className="eyebrow">当前未卖</span><h3>做T买入单</h3></div><button type="button" onClick={() => addLot(holding.id)}>＋ 新增买入</button></div>
                {holding.lots.length === 0 ? <div className="empty-lots">当前没有待卖的新买记录。新增买入后会先显示最低盈利卖价。</div> : (
                  <div className="lot-table-wrap"><table className="lot-table open-lot-table"><thead><tr><th>批次 / 日期</th><th>剩余股数</th><th>买入价</th><th>含费成本</th><th>至少盈利卖价</th><th>本次卖出股数</th><th>实际卖出价</th><th>预计卖出费</th><th>预计盈亏</th><th>操作</th></tr></thead><tbody>
                    {holding.lots.map((lot) => {
                      const shares = lot.shares ?? 0;
                      const buyFee = getLotBuyFee(lot, rates);
                      const lotCost = getLotCost(lot, rates);
                      const plannedShares = Math.min(lot.draftSellShares ?? shares, shares);
                      const plannedCost = shares > 0 ? roundMoney(lotCost * (plannedShares / shares)) : 0;
                      const minimumSale = plannedShares > 0 && plannedCost > 0
                        ? findMinimumProfitableSale(plannedShares, plannedCost, rates)
                        : null;
                      const preview = calculateFifoSale(
                        [toCostLot(lot, rates)],
                        lot.draftSellShares ?? 0,
                        lot.draftSellPrice ?? 0,
                        rates,
                      );
                      return <tr key={lot.id}>
                        <td><span className="batch-id">{lot.batchId || "未编号"}</span><input aria-label="买入日期" type="date" value={lot.date} onChange={(event) => updateLot(holding.id, lot.id, { date: event.target.value })} /></td>
                        <td><input aria-label="剩余股数" type="number" min="0" step="100" value={lot.shares ?? ""} onChange={(event) => updateLot(holding.id, lot.id, { shares: optionalNumber(event.target.value), buyFee: null })} placeholder="300" /></td>
                        <td><input aria-label="买入价格" type="number" min="0" step="0.01" value={lot.price ?? ""} onChange={(event) => updateLot(holding.id, lot.id, { price: optionalNumber(event.target.value), buyFee: null })} placeholder="52.39" /></td>
                        <td><strong>¥{money.format(lotCost)}</strong><small>买入费 ¥{money.format(buyFee)}</small></td>
                        <td className="profit-price"><strong>{minimumSale ? `¥${money.format(minimumSale.minimumProfitPrice)}` : "—"}</strong><small>{lot.draftSellShares ? `按 ${integer.format(plannedShares)} 股测算` : "默认按本批全部卖"}</small></td>
                        <td><input aria-label="本次卖出股数" type="number" min="0" max={shares} step="100" value={lot.draftSellShares ?? ""} onChange={(event) => updateLot(holding.id, lot.id, { draftSellShares: optionalNumber(event.target.value) })} placeholder={`最多 ${shares}`} /></td>
                        <td><input aria-label="实际卖出价格" type="number" min="0" step="0.01" value={lot.draftSellPrice ?? ""} onChange={(event) => updateLot(holding.id, lot.id, { draftSellPrice: optionalNumber(event.target.value) })} placeholder="成交价" /></td>
                        <td className="auto-fee">{preview ? <><strong>¥{money.format(preview.totalFees)}</strong><small>净回款 ¥{money.format(preview.netProceeds)}</small></> : "—"}</td>
                        <td className={preview && preview.profit >= 0 ? "sale-profit positive" : "sale-profit negative"}>{preview ? <><strong>{preview.profit >= 0 ? "+" : "−"}¥{money.format(Math.abs(preview.profit))}</strong><small>含买卖全部费用</small></> : <small>填股数与卖价</small>}</td>
                        <td className="lot-actions"><button className="confirm-sale" type="button" disabled={!preview?.fullyAllocated} onClick={() => confirmSale(holding.id, lot.draftSellShares ?? 0, lot.draftSellPrice ?? 0, lot.id)}>确认卖出</button><button className="delete-lot" type="button" onClick={() => removeLot(holding.id, lot.id)}>×</button></td>
                      </tr>;
                    })}
                  </tbody></table></div>
                )}

                {holding.soldTrades.length > 0 ? (
                  <section className="sold-trades">
                    <div className="sold-trades-head"><div><span className="eyebrow">成交归档</span><h3>已卖出单子</h3></div><p>确认卖出后自动从上方待卖列表扣除，并按券商口径降低整仓成本。</p></div>
                    <div className="sold-table-wrap"><table className="sold-table"><thead><tr><th>卖出日期</th><th>批次</th><th>股数</th><th>买入成本</th><th>卖出价</th><th>卖出费用</th><th>净回款</th><th>已实现盈亏</th></tr></thead><tbody>
                      {[...holding.soldTrades].reverse().map((trade) => <tr key={trade.id}>
                        <td>{trade.date}<small>{trade.mode}</small></td>
                        <td>{trade.batchId}</td>
                        <td>{integer.format(trade.shares)}</td>
                        <td>¥{money.format(trade.soldCost)}<small>买入费 ¥{money.format(trade.buyFee)}</small></td>
                        <td>¥{money.format(trade.sellPrice)}</td>
                        <td>¥{money.format(trade.sellFee)}</td>
                        <td>¥{money.format(trade.netProceeds)}</td>
                        <td className={trade.profit >= 0 ? "positive" : "negative"}><strong>{trade.profit >= 0 ? "+" : "−"}¥{money.format(Math.abs(trade.profit))}</strong></td>
                      </tr>)}
                    </tbody></table></div>
                  </section>
                ) : null}

                <div className="position-summary">
                  <div><span>卖出后当前总股数</span><strong>{integer.format(snapshot.totalShares)} 股</strong><small>底仓 {integer.format(snapshot.baseShares)} + 待卖新买 {integer.format(snapshot.newShares)}</small></div>
                  <div className="summary-focus"><span>券商口径整仓成本</span><strong>{snapshot.costReady ? `¥${money.format(snapshot.totalCost)}` : "待补充"}</strong><small>{snapshot.costReady && snapshot.totalShares > 0 ? `综合成本 ¥${precisePrice.format(snapshot.totalCost / snapshot.totalShares)} / 股` : "确认卖出后自动更新"}</small></div>
                  <div className={realizedProfit >= 0 ? "positive" : "negative"}><span>累计已实现做T盈亏</span><strong>{holding.soldTrades.length ? `${realizedProfit >= 0 ? "+" : "−"}¥${money.format(Math.abs(realizedProfit))}` : "暂无成交"}</strong><small>已归档 {holding.soldTrades.length} 笔卖出记录</small></div>
                  <div><span>整仓最低盈利卖价</span><strong>{wholeSale ? `¥${money.format(wholeSale.minimumProfitPrice)}` : "—"}</strong><small>{wholeSale ? `全部卖出金额 ¥${money.format(wholeSale.grossAmount)}` : "需先填写整仓成本"}</small></div>
                  <div className={currentResult && currentResult.profit >= 0 ? "positive" : "negative"}><span>当前价全部卖出净收益</span><strong>{currentResult ? `${currentResult.profit >= 0 ? "+" : "−"}¥${money.format(Math.abs(currentResult.profit))}` : "—"}</strong><small>{grossProfit != null && grossReturn != null ? `浮盈 ${grossProfit >= 0 ? "+" : "−"}¥${money.format(Math.abs(grossProfit))} · ${grossReturn >= 0 ? "+" : ""}${grossReturn.toFixed(2)}%` : "价格或成本待补充"}</small></div>
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
          <div className="fee-rules"><div><span>买入</span><b>佣金 + 过户费</b></div><div><span>卖出</span><b>佣金 + 过户费 + 印花税</b></div><div><span>成本更新</span><b>原总成本 − 卖出净回款</b></div></div>
          <div className="formula"><strong>券商T计算方法</strong><p>卖出股数按先进先出分摊买入成本；确认卖出后，用卖出净回款直接降低剩余持仓总成本。</p></div>
          <div className="privacy-note"><strong>隐私说明</strong><p>持仓与买卖记录仅保存在当前浏览器，不会写入网站代码或公开数据。</p></div>
          <small>实际费用可能存在规费合并或尾差，请以券商交割单为准，可在上方调整费率。</small>
        </aside>
      </section>
    </main>
  );
}

function getHoldingSnapshot(holding: Holding, rates: AShareFeeRates) {
  const baseShares = holding.baseShares ?? 0;
  const newShares = holding.lots.reduce((sum, lot) => sum + (lot.shares ?? 0), 0);
  const totalShares = baseShares + newShares;
  const calculatedTotalCost = roundMoney(totalShares * (holding.baseUnitCost ?? 0));
  const totalCost = holding.totalCostOverride != null
    ? roundMoney(holding.totalCostOverride)
    : calculatedTotalCost;
  const costReady = totalShares === 0 || holding.totalCostOverride != null || (holding.baseUnitCost ?? 0) !== 0;
  return { baseShares, newShares, totalShares, calculatedTotalCost, totalCost, costReady, rates };
}

function getLotBuyFee(lot: BuyLot, rates: AShareFeeRates) {
  if (lot.buyFee != null) return lot.buyFee;
  return calculateBuyTransaction(lot.shares ?? 0, lot.price ?? 0, rates).totalFees;
}

function getLotCost(lot: BuyLot, rates: AShareFeeRates) {
  return roundMoney((lot.shares ?? 0) * (lot.price ?? 0) + getLotBuyFee(lot, rates));
}

function toCostLot(lot: BuyLot, rates: AShareFeeRates) {
  return {
    id: lot.id,
    shares: lot.shares ?? 0,
    price: lot.price ?? 0,
    buyFee: getLotBuyFee(lot, rates),
  };
}

function migrateHoldings(input: Holding[] | LegacyHolding[]): Holding[] {
  return input.map((rawHolding) => {
    const holding = rawHolding as LegacyHolding;
    const migratedTrades = [...(holding.soldTrades ?? [])];
    const migratedLots = (holding.lots ?? []).flatMap((rawLot) => {
      const lot = rawLot as LegacyBuyLot;
      const originalShares = lot.shares ?? 0;
      const oldSoldShares = Math.min(lot.soldShares ?? 0, originalShares);
      const buy = calculateBuyTransaction(originalShares, lot.price ?? 0);
      const remainingShares = Math.max(originalShares - oldSoldShares, 0);
      const remainingBuyFee = originalShares > 0
        ? buy.totalFees * (remainingShares / originalShares)
        : 0;

      if (oldSoldShares > 0 && (lot.sellPrice ?? 0) > 0) {
        const legacySale = calculateFifoSale([{
          id: lot.id,
          shares: originalShares,
          price: lot.price ?? 0,
          buyFee: buy.totalFees,
        }], oldSoldShares, lot.sellPrice ?? 0);
        if (legacySale) {
          migratedTrades.push({
            id: createId("legacy-sale"),
            date: lot.date || "",
            batchId: lot.batchId || "旧记录",
            shares: legacySale.shares,
            averageBuyPrice: legacySale.averageBuyPrice,
            buyFee: legacySale.allocatedBuyFee,
            soldCost: legacySale.soldCost,
            sellPrice: legacySale.sellPrice,
            grossAmount: legacySale.grossAmount,
            sellFee: legacySale.totalFees,
            netProceeds: legacySale.netProceeds,
            profit: legacySale.profit,
            mode: "旧记录",
            confirmedAt: new Date().toISOString(),
          });
        }
      }

      if (remainingShares <= 0) return [];
      return [{
        id: lot.id,
        batchId: lot.batchId,
        date: lot.date || "",
        shares: remainingShares,
        price: lot.price,
        buyFee: lot.buyFee != null && oldSoldShares === 0 ? lot.buyFee : remainingBuyFee,
        draftSellShares: lot.draftSellShares ?? null,
        draftSellPrice: lot.draftSellPrice ?? null,
      }];
    });

    return {
      ...holding,
      lots: migratedLots,
      soldTrades: migratedTrades,
    };
  });
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function optionalSignedNumber(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
