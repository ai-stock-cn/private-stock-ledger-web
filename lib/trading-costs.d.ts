export type AShareFeeRates = {
  commissionRate: number;
  transferFeeRate: number;
  stampDutyRate: number;
  priceTick: number;
};

export type BuyTransaction = {
  shares: number;
  price: number;
  grossAmount: number;
  commission: number;
  transferFee: number;
  stampDuty: number;
  totalFees: number;
  totalCost: number;
  unitCost: number;
};

export type SellTransaction = {
  grossAmount: number;
  commission: number;
  transferFee: number;
  stampDuty: number;
  totalFees: number;
  netProceeds: number;
};

export type MinimumProfitableSale = {
  breakEvenPrice: number;
  minimumProfitPrice: number;
  grossAmount: number;
  totalFees: number;
  netProceeds: number;
  profit: number;
};

export const DEFAULT_A_SHARE_FEE_RATES: Readonly<AShareFeeRates>;
export function roundMoney(value: number): number;
export function calculateBuyTransaction(shares: number, price: number, rates?: AShareFeeRates): BuyTransaction;
export function calculateSellTransaction(shares: number, price: number, rates?: AShareFeeRates): SellTransaction;
export function findMinimumProfitableSale(shares: number, totalCost: number, rates?: AShareFeeRates): MinimumProfitableSale | null;
export function findMinimumProfitableSaleWithFixedFee(shares: number, totalCost: number, fixedSellFee: number, priceTick?: number): MinimumProfitableSale | null;
export function calculateProfitAtPrice(shares: number, totalCost: number, sellPrice: number, rates?: AShareFeeRates): SellTransaction & { profit: number };
