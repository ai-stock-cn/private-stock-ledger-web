import {
  calculateBuyTransaction,
  calculateProfitAtPrice,
  findMinimumProfitableSale,
} from "./trading-costs.js";

const MAX_TRADES = 20;
const MAX_SHARES = 100_000_000;
const MAX_PRICE = 1_000_000;

export function calculateTradePlan(payload, rates) {
  if (!payload || typeof payload !== "object") throw new Error("invalid_request");
  if (!Array.isArray(payload.trades) || payload.trades.length > MAX_TRADES) {
    throw new Error("invalid_request");
  }

  const rows = payload.trades.map((trade) => calculateRow(trade, rates));
  const validRows = rows.filter((row) => row.internal);
  const totalShares = validRows.reduce((sum, row) => sum + row.internal.shares, 0);
  const totalCost = validRows.reduce((sum, row) => sum + row.internal.totalCost, 0);
  const totalBuyAmount = validRows.reduce((sum, row) => sum + row.internal.buyAmount, 0);
  const combinedSellPrice = boundedPositive(payload.combinedSellPrice, MAX_PRICE);
  const combinedSale = totalShares && totalCost && combinedSellPrice
    ? calculateProfitAtPrice(totalShares, totalCost, combinedSellPrice, rates)
    : null;
  const combinedMinimum = totalShares && totalCost
    ? findMinimumProfitableSale(totalShares, totalCost, rates)
    : null;
  const completedSeparateTrades = rows.filter((row) => row.profit !== null).length;
  const separateProfit = rows.reduce((sum, row) => sum + (row.profit ?? 0), 0);

  return {
    rows: rows.map((row) => ({
      buyAmount: row.buyAmount,
      minimumProfitPrice: row.minimumProfitPrice,
      profit: row.profit,
    })),
    combined: {
      totalShares,
      totalBuyAmount,
      minimumProfitPrice: combinedMinimum?.minimumProfitPrice ?? null,
      profit: combinedSale?.profit ?? null,
      netProceeds: combinedSale?.netProceeds ?? null,
      completedSeparateTrades,
      separateProfit,
    },
  };
}

function calculateRow(trade, rates) {
  const shares = boundedPositive(trade?.shares, MAX_SHARES);
  const buyPrice = boundedPositive(trade?.buyPrice, MAX_PRICE);
  const sellPrice = boundedPositive(trade?.sellPrice, MAX_PRICE);

  if (!shares || !buyPrice) {
    return {
      buyAmount: null,
      minimumProfitPrice: null,
      profit: null,
      internal: null,
    };
  }

  const buy = calculateBuyTransaction(shares, buyPrice, rates);
  const minimum = findMinimumProfitableSale(shares, buy.totalCost, rates);
  const sale = sellPrice
    ? calculateProfitAtPrice(shares, buy.totalCost, sellPrice, rates)
    : null;

  return {
    buyAmount: buy.grossAmount,
    minimumProfitPrice: minimum?.minimumProfitPrice ?? null,
    profit: sale?.profit ?? null,
    internal: {
      shares,
      totalCost: buy.totalCost,
      buyAmount: buy.grossAmount,
    },
  };
}

function boundedPositive(value, maximum) {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > maximum) {
    throw new Error("invalid_request");
  }
  return number;
}
