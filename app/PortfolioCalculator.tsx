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

const INITIAL_TRADE: TradeInput = {
  id: "trade-1",
  shares: "",
  buyPrice: "",
  sellPrice: "",
};

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
  const [trades, setTrades] = useState<TradeInput[]>([INITIAL_TRADE]);
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
      targetPrice,
      sale,
      minimum,
      separateProfit,
      completedSeparateTrades,
    };
  }, [calculations, combinedSellPrice]);

  function updateTrade(id: string, field: keyof Omit<TradeInput, "id">, value: string) {
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
      return next.length ? next : [{ ...INITIAL_TRADE, id: createId() }];
    });
  }

  function resetCalculator() {
    setTrades([{ ...INITIAL_TRADE }]);
    setCombinedSellPrice("");
  }

  return (
    <main className="calculator-shell">
      <section className="calculator-hero">
        <div>
          <span className="eyebrow">A 股交易测算</span>
          <h1>做T收益计算器</h1>
          <p>输入股数、买入价和卖出价，自动计算单笔收益；多笔买入还可以按同一价格合并卖出。</p>
        </div>
        <div className="rate-note" aria-label="固定交易费率">
          <strong>费率已内置</strong>
          <span>佣金万一 · 最低 ¥1</span>
          <span>过户费 0.001% · 卖出印花税 0.05%</span>
        </div>
      </section>

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
                <span>第 {String(index + 1).padStart(2, "0")} 笔</span>
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
                <ResultItem label="买入费用" value={buy ? `¥${money.format(buy.totalFees)}` : "—"} />
                <ResultItem label="含费成本" value={buy ? `¥${money.format(buy.totalCost)}` : "—"} />
                <ResultItem label="卖出费用" value={sale ? `¥${money.format(sale.totalFees)}` : "—"} />
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
            <ResultItem label="含费总成本" value={combined.totalCost ? `¥${money.format(combined.totalCost)}` : "—"} />
            <ResultItem label="一起卖费用" value={combined.sale ? `¥${money.format(combined.sale.totalFees)}` : "—"} />
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
        计算口径：买入含佣金与过户费；卖出含佣金、过户费与印花税。结果用于交易计划参考，请以券商最终交割单为准。
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
