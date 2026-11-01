"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type TradeInput = {
  id: string;
  shares: string;
  buyPrice: string;
  sellPrice: string;
};

type StockLedger = {
  id: string;
  name: string;
  code: string;
  trades: TradeInput[];
  combinedSellPrice: string;
};

type StoredLedgers = {
  stocks: StockLedger[];
  selectedStockId: string;
};

const STORAGE_KEY = "stock-profit-calculator-v2";
const GITHUB_PAGES_API = "https://private-stock-ledger.pastelbear20.chatgpt.site/api/calculate";
const GITHUB_PAGES_QUOTE_API = "https://private-stock-ledger.pastelbear20.chatgpt.site/api/quote";
const QUOTE_REFRESH_MS = 60_000;

const INITIAL_STOCKS: StockLedger[] = [
  {
    id: "ping-an",
    name: "中国平安",
    code: "601318",
    trades: [
      { id: "ping-an-1", shares: "200", buyPrice: "52.39", sellPrice: "" },
      { id: "ping-an-2", shares: "100", buyPrice: "52.42", sellPrice: "" },
    ],
    combinedSellPrice: "",
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

type CalculationResult = {
  rows: Array<{
    buyAmount: number | null;
    minimumProfitPrice: number | null;
    profit: number | null;
  }>;
  combined: {
    totalShares: number;
    totalBuyAmount: number;
    minimumProfitPrice: number | null;
    profit: number | null;
    netProceeds: number | null;
    completedSeparateTrades: number;
    separateProfit: number;
  };
};

type StockQuote = {
  code: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  amount: number | null;
  updatedAt: string;
};

export default function PortfolioCalculator() {
  const [stocks, setStocks] = useState<StockLedger[]>(() => initialStocks());
  const [selectedStockId, setSelectedStockId] = useState(INITIAL_STOCKS[0].id);
  const [storageReady, setStorageReady] = useState(false);
  const [pendingSaleId, setPendingSaleId] = useState<string | null>(null);
  const [pendingFullSale, setPendingFullSale] = useState(false);
  const [calculation, setCalculation] = useState<CalculationResult | null>(null);
  const [calculationError, setCalculationError] = useState(false);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(false);
  const selectedStock = stocks.find((stock) => stock.id === selectedStockId) ?? stocks[0]!;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = loadStoredLedgers();
      if (stored) {
        setStocks(stored.stocks);
        setSelectedStockId(stored.selectedStockId);
      }
      setStorageReady(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ stocks, selectedStockId }));
  }, [selectedStockId, storageReady, stocks]);

  const refreshQuote = useCallback(async () => {
    const code = selectedStock.code.trim();
    if (!/^\d{6}$/.test(code)) {
      setQuote(null);
      setQuoteError(false);
      return;
    }

    setQuoteLoading(true);
    try {
      const response = await fetch(quoteEndpoint(code), { cache: "no-store" });
      if (!response.ok) throw new Error("quote_failed");
      setQuote(await response.json() as StockQuote);
      setQuoteError(false);
    } catch {
      setQuoteError(true);
    } finally {
      setQuoteLoading(false);
    }
  }, [selectedStock.code]);

  useEffect(() => {
    setQuote(null);
    void refreshQuote();
    const interval = window.setInterval(() => void refreshQuote(), QUOTE_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [refreshQuote]);

  const requestPayload = useMemo(() => ({
    trades: selectedStock.trades.map((trade) => ({
      shares: positiveNumber(trade.shares),
      buyPrice: positiveNumber(trade.buyPrice),
      sellPrice: positiveNumber(trade.sellPrice),
    })),
    combinedSellPrice: positiveNumber(selectedStock.combinedSellPrice),
  }), [selectedStock]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(calculationEndpoint(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("calculation_failed");
        const result = await response.json() as CalculationResult;
        setCalculation(result);
        setCalculationError(false);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCalculation(null);
        setCalculationError(true);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [requestPayload]);

  const calculations = selectedStock.trades.map((trade, index) => ({
    trade,
    result: calculation?.rows[index] ?? null,
  }));
  const combined = calculation?.combined ?? null;

  function updateSelectedStock(updater: (stock: StockLedger) => StockLedger) {
    setStocks((current) => current.map((stock) => (
      stock.id === selectedStock.id ? updater(stock) : stock
    )));
  }

  function updateStockIdentity(field: "name" | "code", value: string) {
    updateSelectedStock((stock) => ({ ...stock, [field]: value }));
  }

  function updateTrade(id: string, field: "shares" | "buyPrice" | "sellPrice", value: string) {
    updateSelectedStock((stock) => ({
      ...stock,
      trades: stock.trades.map((trade) => (
        trade.id === id ? { ...trade, [field]: value } : trade
      )),
    }));
  }

  function updateCombinedSellPrice(value: string) {
    updateSelectedStock((stock) => ({ ...stock, combinedSellPrice: value }));
  }

  function addTrade() {
    updateSelectedStock((stock) => ({
      ...stock,
      trades: [...stock.trades, emptyTrade()],
    }));
  }

  function removeTrade(id: string) {
    if (pendingSaleId === id) setPendingSaleId(null);
    updateSelectedStock((stock) => {
      const next = stock.trades.filter((trade) => trade.id !== id);
      return { ...stock, trades: next.length ? next : [emptyTrade()] };
    });
  }

  function selectStock(id: string) {
    setPendingSaleId(null);
    setPendingFullSale(false);
    setSelectedStockId(id);
  }

  function beginTradeSale(trade: TradeInput) {
    if (!positiveNumber(trade.sellPrice) || !positiveNumber(trade.shares)) return;
    setPendingSaleId(trade.id);
  }

  function confirmTradeSale(id: string) {
    removeTrade(id);
    setPendingSaleId(null);
  }

  function beginFullSale() {
    const hasShares = selectedStock.trades.some((trade) => positiveNumber(trade.shares) > 0);
    if (!hasShares || !positiveNumber(selectedStock.combinedSellPrice)) return;
    setPendingSaleId(null);
    setPendingFullSale(true);
  }

  function confirmFullSale() {
    updateSelectedStock((stock) => ({
      ...stock,
      trades: [emptyTrade()],
      combinedSellPrice: "",
    }));
    setPendingSaleId(null);
    setPendingFullSale(false);
  }

  function resetCalculator() {
    setPendingSaleId(null);
    setPendingFullSale(false);
    updateSelectedStock((stock) => ({
      ...stock,
      trades: [emptyTrade()],
      combinedSellPrice: "",
    }));
  }

  function addStock() {
    const stock = createStock(stocks.length + 1);
    setStocks((current) => [...current, stock]);
    setPendingSaleId(null);
    setPendingFullSale(false);
    setSelectedStockId(stock.id);
  }

  function removeSelectedStock() {
    if (stocks.length === 1) return;
    const next = stocks.filter((stock) => stock.id !== selectedStock.id);
    setStocks(next);
    setPendingSaleId(null);
    setPendingFullSale(false);
    setSelectedStockId(next[0].id);
  }

  return (
    <main className="calculator-shell">
      <section className="stock-panel">
        <div className="stock-switcher">
          <div>
            <span className="eyebrow">股票台账</span>
            <h1>{selectedStock.name || "未命名股票"}</h1>
            <p>每只股票独立记录，切换后不会混合计算。</p>
          </div>
          <div className="stock-switcher-actions">
            <label className="stock-select">
              <span>切换股票</span>
              <select value={selectedStock.id} onChange={(event) => selectStock(event.target.value)}>
                {stocks.map((stock) => (
                  <option key={stock.id} value={stock.id}>
                    {stock.name || "未命名股票"}{stock.code ? ` · ${stock.code}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button" type="button" onClick={addStock}>＋ 新增股票</button>
            {stocks.length > 1 ? (
              <button className="danger-button" type="button" onClick={removeSelectedStock}>删除当前</button>
            ) : null}
          </div>
        </div>
        <div className="stock-identity">
          <label>
            <span>股票名称</span>
            <input
              type="text"
              value={selectedStock.name}
              onChange={(event) => updateStockIdentity("name", event.target.value)}
              placeholder="例如 云南白药"
            />
          </label>
          <label>
            <span>股票代码</span>
            <input
              inputMode="numeric"
              type="text"
              value={selectedStock.code}
              onChange={(event) => updateStockIdentity("code", event.target.value)}
              placeholder="例如 000538"
            />
          </label>
          <div className="storage-note">
            <strong>{stocks.length} 只</strong>
            <span>数据仅保存在当前浏览器</span>
          </div>
        </div>
        <LiveQuotePanel
          quote={quote}
          loading={quoteLoading}
          error={quoteError}
          code={selectedStock.code}
          fallbackName={selectedStock.name}
          onRefresh={() => void refreshQuote()}
        />
      </section>

      <section className="trade-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{selectedStock.name || "当前股票"} · 分笔测算</span>
            <h2>买入与卖出</h2>
          </div>
          <div className="heading-actions">
            <button className="secondary-button" type="button" onClick={resetCalculator}>清空当前</button>
            <button className="primary-button" type="button" onClick={addTrade}>＋ 新增一笔</button>
          </div>
        </div>

        <div className="trade-list">
          {calculationError ? (
            <p className="calculation-error" role="alert">暂时无法计算，请稍后再试。</p>
          ) : null}
          {calculations.map(({ trade, result }, index) => (
            <article className="trade-card" key={trade.id}>
              <div className="trade-title">
                <span>{selectedStock.name || "当前股票"} · 第 {String(index + 1).padStart(2, "0")} 笔</span>
                <div className="trade-actions">
                  {selectedStock.trades.length > 1 ? (
                    <button
                      className="delete-trade"
                      type="button"
                      onClick={() => removeTrade(trade.id)}
                      aria-label={`删除第 ${index + 1} 笔`}
                    >
                      删除
                    </button>
                  ) : null}
                  {pendingSaleId === trade.id ? (
                    <>
                      <button className="cancel-sale" type="button" onClick={() => setPendingSaleId(null)}>
                        取消
                      </button>
                      <button className="finalize-sale" type="button" onClick={() => confirmTradeSale(trade.id)}>
                        确定卖出
                      </button>
                    </>
                  ) : (
                    <button
                      className="confirm-sale"
                      type="button"
                      disabled={!positiveNumber(trade.shares) || !positiveNumber(trade.sellPrice)}
                      onClick={() => beginTradeSale(trade)}
                    >
                      确认卖出
                    </button>
                  )}
                </div>
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
                <ResultItem label="买入金额" value={currencyOrDash(result?.buyAmount)} />
                <ResultItem label="不亏卖价" value={priceOrDash(result?.minimumProfitPrice)} tone="accent" />
                <ResultItem
                  label="预计盈利"
                  value={result?.profit === null || result?.profit === undefined ? "—" : signedMoney(result.profit)}
                  tone={profitTone(result?.profit ?? undefined)}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="combined-section">
        <div className="combined-heading">
          <div>
            <span className="eyebrow">{selectedStock.name || "当前股票"} · 合并卖出</span>
            <h2>全部一起卖能赚多少</h2>
            <p>当前股票的所有买入记录按一笔卖单计算，卖出费用只收一次。</p>
          </div>
          <div className="combined-controls">
            <label className="combined-price">
              <span>全部卖出价格</span>
              <div className="input-wrap">
                <i>¥</i>
                <input
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  type="number"
                  value={selectedStock.combinedSellPrice}
                  onChange={(event) => updateCombinedSellPrice(event.target.value)}
                  placeholder="输入统一卖价"
                />
              </div>
            </label>
            <div className="full-sale-actions">
              {pendingFullSale ? (
                <>
                  <button className="cancel-full-sale" type="button" onClick={() => setPendingFullSale(false)}>
                    取消
                  </button>
                  <button className="finalize-full-sale" type="button" onClick={confirmFullSale}>
                    确定全部卖出
                  </button>
                </>
              ) : (
                <button
                  className="full-sale-button"
                  type="button"
                  disabled={
                    !positiveNumber(selectedStock.combinedSellPrice)
                    || !selectedStock.trades.some((trade) => positiveNumber(trade.shares) > 0)
                  }
                  onClick={beginFullSale}
                >
                  全量卖出
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="combined-results">
          <div className="combined-primary">
            <span>一起卖预计盈利</span>
            <strong className={profitTone(combined?.profit ?? undefined)}>
              {combined?.profit === null || combined?.profit === undefined ? "—" : signedMoney(combined.profit)}
            </strong>
            <small>
              {combined?.netProceeds !== null && combined?.netProceeds !== undefined
                ? `净回款 ¥${money.format(combined.netProceeds)}`
                : "填写买入记录和统一卖价后自动计算"}
            </small>
          </div>
          <div className="combined-details">
            <ResultItem label="合计股数" value={combined?.totalShares ? `${integer.format(combined.totalShares)} 股` : "—"} />
            <ResultItem label="总买入金额" value={currencyOrDash(combined?.totalBuyAmount)} />
            <ResultItem label="一起卖不亏价" value={priceOrDash(combined?.minimumProfitPrice)} tone="accent" />
            <ResultItem
              label={`分笔卖盈利${combined?.completedSeparateTrades ? `（${combined.completedSeparateTrades}笔）` : ""}`}
              value={combined?.completedSeparateTrades ? signedMoney(combined.separateProfit) : "—"}
              tone={combined?.completedSeparateTrades ? profitTone(combined.separateProfit) : undefined}
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

function LiveQuotePanel({
  quote,
  loading,
  error,
  code,
  fallbackName,
  onRefresh,
}: {
  quote: StockQuote | null;
  loading: boolean;
  error: boolean;
  code: string;
  fallbackName: string;
  onRefresh: () => void;
}) {
  const validCode = /^\d{6}$/.test(code.trim());
  const tone = quoteTone(quote?.change);

  return (
    <div className="live-quote" aria-live="polite">
      <div className="live-quote-heading">
        <div>
          <span className="eyebrow">实时行情 · 每60秒自动刷新</span>
          <strong>{quote?.name || fallbackName || (validCode ? "正在获取行情" : "请输入六位股票代码")}</strong>
        </div>
        <button type="button" onClick={onRefresh} disabled={!validCode || loading}>
          {loading ? "刷新中" : "刷新行情"}
        </button>
      </div>

      {quote ? (
        <div className="live-quote-body">
          <div className="quote-price">
            <span>最新价</span>
            <strong className={tone}>¥{money.format(quote.price)}</strong>
            <small className={tone}>
              {signedNumber(quote.change)} · {signedPercent(quote.changePercent)}
            </small>
          </div>
          <div className="quote-stats">
            <QuoteMetric label="开盘" value={quote.open} />
            <QuoteMetric label="最高" value={quote.high} />
            <QuoteMetric label="最低" value={quote.low} />
            <QuoteMetric label="昨收" value={quote.previousClose} />
          </div>
          <div className="quote-time">
            <span>行情时间</span>
            <strong>{formatQuoteTime(quote.updatedAt)}</strong>
            <small>行情可能存在延迟，仅供交易计划参考</small>
          </div>
        </div>
      ) : (
        <div className={`quote-placeholder${error ? " error" : ""}`}>
          {error ? "暂时无法获取行情，请稍后重试。" : validCode ? "正在加载最新价格…" : "填写股票代码后自动加载行情。"}
        </div>
      )}
    </div>
  );
}

function QuoteMetric({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value === null ? "—" : `¥${money.format(value)}`}</strong>
    </div>
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

function currencyOrDash(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `¥${money.format(value)}`;
}

function priceOrDash(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `¥${price.format(value)}`;
}

function profitTone(value?: number): "positive" | "negative" | undefined {
  if (value === undefined || value === 0) return undefined;
  return value > 0 ? "positive" : "negative";
}

function quoteTone(value?: number): "positive" | "negative" | "flat" {
  if (!value) return "flat";
  return value > 0 ? "positive" : "negative";
}

function signedNumber(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${money.format(Math.abs(value))}`;
}

function signedPercent(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${money.format(Math.abs(value))}%`;
}

function formatQuoteTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function calculationEndpoint() {
  return window.location.hostname === "ai-stock-cn.github.io" ? GITHUB_PAGES_API : "/api/calculate";
}

function quoteEndpoint(code: string) {
  const endpoint = window.location.hostname === "ai-stock-cn.github.io" ? GITHUB_PAGES_QUOTE_API : "/api/quote";
  return `${endpoint}?code=${encodeURIComponent(code)}`;
}

function createId(prefix = "trade") {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

function emptyTrade(): TradeInput {
  return { id: createId(), shares: "", buyPrice: "", sellPrice: "" };
}

function createStock(position: number): StockLedger {
  return {
    id: createId("stock"),
    name: `股票 ${position}`,
    code: "",
    trades: [emptyTrade()],
    combinedSellPrice: "",
  };
}

function initialStocks() {
  return INITIAL_STOCKS.map((stock) => ({
    ...stock,
    trades: stock.trades.map((trade) => ({ ...trade })),
  }));
}

function loadStoredLedgers(): StoredLedgers | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredLedgers>;
    if (!Array.isArray(stored.stocks) || stored.stocks.length === 0) return null;

    const stocks = stored.stocks.map((stock, stockIndex) => ({
      id: typeof stock.id === "string" && stock.id ? stock.id : createId("stock"),
      name: typeof stock.name === "string" ? stock.name : `股票 ${stockIndex + 1}`,
      code: typeof stock.code === "string" ? stock.code : "",
      trades: Array.isArray(stock.trades) && stock.trades.length
        ? stock.trades.map((trade) => ({
          id: typeof trade.id === "string" && trade.id ? trade.id : createId(),
          shares: typeof trade.shares === "string" ? trade.shares : "",
          buyPrice: typeof trade.buyPrice === "string" ? trade.buyPrice : "",
          sellPrice: typeof trade.sellPrice === "string" ? trade.sellPrice : "",
        }))
        : [emptyTrade()],
      combinedSellPrice: typeof stock.combinedSellPrice === "string" ? stock.combinedSellPrice : "",
    }));
    const selectedStockId = stocks.some((stock) => stock.id === stored.selectedStockId)
      ? stored.selectedStockId as string
      : stocks[0].id;

    return { stocks, selectedStockId };
  } catch {
    return null;
  }
}
