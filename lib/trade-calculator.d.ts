import type { AShareFeeRates } from "./trading-costs.js";

export type TradePlanInput = {
  trades: Array<{
    shares?: number;
    buyPrice?: number;
    sellPrice?: number;
  }>;
  combinedSellPrice?: number;
};

export type TradePlanResult = {
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

export function calculateTradePlan(payload: TradePlanInput, rates: AShareFeeRates): TradePlanResult;
