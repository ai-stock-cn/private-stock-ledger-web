"use client";

import { useMemo, useState } from "react";
import {
  calculateBuyTransaction,
  calculateProfitAtPrice,
  findMinimumProfitableSale,
  type AShareFeeRates,
} from "@/lib/trading-costs.js";

type TradeInput = {
  id: string;
  stockName?: string;
  shares: string;
  buyPrice: string;
  sellPrice: string;
};

const FIXED_RATES: AShareFeeRates = {
  commissionRate: 0.0001,
  minimumCommission: 1,
  transferFeeRate: 0.00001,
  stampDutyRate: 0.0005,
  priceTick: 0.01,
};

const INITIAL_TRADES: TradeInput[] = [
  {
    id: "ping-an-1",
    stockName: "中国平安",
    shares: "200",
    buyPrice: "52.39",
    sellPrice: "",
  },
  {
    id: "ping-an-2",
    stockName: "中国平安",
    shares: "100",
    buyPrice: "52.42",
    sellPrice: "",
  },
];

const money = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const price = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const integer = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });

export default function PortfolioCalculator() {
  const [trades, setTrades] = useState<TradeInput[]>(() => initialTrades());
  const [combinedSellPrice, setCombinedSellPrice] = useState("");

  const calculations = useMemo(() => trades.map((trade) => {
    const shares = positiveNumber(trade.shares);
    const buyPrice = positiveNumber(trade.buyPrice);
    const sellPrice = positiveNumber(trade.sellPrice);
    const buy = shares && buyPrice
      ? calculateBuyTransaction(shares, buyPrice, FIXED_RATES)
      : null;
    const sale = buy && sellPrice
      ? calculateProfitAtPrice(shares, buy.totalCost, sellPrice, FIXED_RATES)
      : null;
    const minimum = buy
      ? findMinimumProfitableSale(shares, buy.totalCost, FIXED_RATES)
      : null;

    return { trade, shares, buy, sale, minimum };
  }), [trades]);

  const combined = useMemo(() => {
    const validRows = calculations.filter((item) => item.buy);
    const totalShares = validRows.reduce((sum, item) => sum + item.shares, 0);
    const totalCost = validRows.reduce((sum, item) => sum + (item.buy?.totalCost ?? 0), 0);
    const totalBuyAmount = validRows.reduce((sum, item) => sum + (item.buy?.grossAmount ?? 0), 0);
    const targetPrice = positiveNumber(combinedSellPrice);
    const sale = totalShares && totalCost && targetPrice
      ? calculateProfitAtPrice(totalShares, totalCost, targetPrice, FIXED_RATES)
      : null;
    const minimum = totalShares && totalCost
      ? findMinimumProfitableSale(totalShares, totalCost, FIXED_RATES)
      : null;
    const separateProfit = calculations.reduce(
      (sum, item) => sum + (item.sale?.profit ?? 0),
      0,
    );
    const completedSeparateTrades = calculations.filter((item) => item.sale).length;

    return {
      totalShares,
      totalCost,
      totalBuyAmount,
      targetPrice,
      sale,
      minimum,
      separateProfit,
      completedSeparateTrades,
    };
  }, [calculations, combinedSellPrice]);

  function updateTrade(id: string, field: "shares" | "buyPrice" | "sellPrice", value: string) {
    setTrades((current) => current.map((trade) => (
      trade.id === id ? { ...trade, [field]: value } : trade
    )));
  }

  function addTrade() {
    setTrades((current) => [
      ...current,
      { id: createId(), shares: "", buyPrice: "", sellPrice: "" },
    ]);
  }

  function removeTrade(id: string) {
    setTrades((current) => {
      const next = current.filter((trade) => trade.id !== id);
      return next.length ? next : [{ id: createId(), shares: "", buyPrice: "", sellPrice: "" }];
    });
  }

  function resetCalculator() {
    setTrades(initialTrades());
    setCombinedSellPrice("");
  }

  return (
    <main className="calculator-shell">
      <section className="trade-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">分笔测算</span>
            <h2>买入与卖出</h2>
          </div>
          <div className="heading-actions">
            <button className="secondary-button" type="button" onClick={resetCalculator}>清空重算</button>
            <button className="primary-button" type="button" onClick={addTrade}>＋ 新增一笔</button>
          </div>
        </div>

        <div className="trade-list">
          {calculations.map(({ trade, buy, sale, minimum }, index) => (
            <article className="trade-card" key={trade.id}>
              <div className="trade-title">
                <span>{trade.stockName ? `${trade.stockName} · ` : ""}第 {String(index + 1).padStart(2, "0")} 笔</span>
                {trades.length > 1 ? (
                  <button type="button" onClick={() => removeTrade(trade.id)} aria-label={`删除第 ${index + 1} 笔`}>
                    删除
                  </button>
                ) : null}
              </div>

              <div className="input-grid">
                <label>
                  <span>买入股数</span>
                  <div className="input-wrap">
                    <input
                      inputMode="numeric"
                      min="0"
                      step="100"
                      type="number"
                      value={trade.shares}
                      onChange={(event) => updateTrade(trade.id, "shares", event.target.value)}
                      placeholder="例如 300"
                    />
                    <i>股</i>
                  </div>
                </label>
                <label>
                  <span>买入价格</span>
                  <div className="input-wrap">
                    <i>¥</i>
                    <input
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      type="number"
                      value={trade.buyPrice}
                      onChange={(event) => updateTrade(trade.id, "buyPrice", event.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </label>
                <label>
                  <span>计划卖出价</span>
                  <div className="input-wrap sell-input">
                    <i>¥</i>
                    <input
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      type="number"
                      value={trade.sellPrice}
                      onChange={(event) => updateTrade(trade.id, "sellPrice", event.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </label>
              </div>

              <div className="result-grid">
                <ResultItem label="买入金额" value={buy ? `¥${money.format(buy.grossAmount)}` : "—"} />
                <ResultItem
                  label="不亏卖价"
                  value={minimum ? `¥${price.format(minimum.minimumProfitPrice)}` : "—"}
                  tone="accent"
                />
                <ResultItem
                  label="预计盈利"
                  value={sale ? signedMoney(sale.profit) : "—"}
                  tone={profitTone(sale?.profit)}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="combined-section">
        <div className="combined-heading">
          <div>
            <span className="eyebrow">合并卖出</span>
            <h2>全部一起卖能赚多少</h2>
            <p>所有已填写的买入记录按一笔卖单计算，卖出费用只收一次。</p>
          </div>
          <label className="combined-price">
            <span>全部卖出价格</span>
            <div className="input-wrap">
              <i>¥</i>
              <input
                inputMode="decimal"
                min="0"
                step="0.01"
                type="number"
                value={combinedSellPrice}
                onChange={(event) => setCombinedSellPrice(event.target.value)}
                placeholder="输入统一卖价"
              />
            </div>
          </label>
        </div>

        <div className="combined-results">
          <div className="combined-primary">
            <span>一起卖预计盈利</span>
            <strong className={profitTone(combined.sale?.profit)}>
              {combined.sale ? signedMoney(combined.sale.profit) : "—"}
            </strong>
            <small>
              {combined.sale
                ? `净回款 ¥${money.format(combined.sale.netProceeds)}`
                : "填写买入记录和统一卖价后自动计算"}
            </small>
          </div>
          <div className="combined-details">
            <ResultItem label="合计股数" value={combined.totalShares ? `${integer.format(combined.totalShares)} 股` : "—"} />
            <ResultItem label="总买入金额" value={combined.totalBuyAmount ? `¥${money.format(combined.totalBuyAmount)}` : "—"} />
            <ResultItem
              label="一起卖不亏价"
              value={combined.minimum ? `¥${price.format(combined.minimum.minimumProfitPrice)}` : "—"}
              tone="accent"
            />
            <ResultItem
              label={`分笔卖盈利${combined.completedSeparateTrades ? `（${combined.completedSeparateTrades}笔）` : ""}`}
              value={combined.completedSeparateTrades ? signedMoney(combined.separateProfit) : "—"}
              tone={combined.completedSeparateTrades ? profitTone(combined.separateProfit) : undefined}
            />
          </div>
        </div>
      </section>

      <footer>
        买卖费用已按内置费率自动计入，结果用于交易计划参考，请以券商最终交割单为准。
      </footer>
    </main>
  );
}

function ResultItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "accent";
}) {
  return (
    <div className="result-item">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function positiveNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function signedMoney(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}¥${money.format(Math.abs(value))}`;
}

function profitTone(value?: number): "positive" | "negative" | undefined {
  if (value === undefined || value === 0) return undefined;
  return value > 0 ? "positive" : "negative";
}

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `trade-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function initialTrades() {
  return INITIAL_TRADES.map((trade) => ({ ...trade }));
}
