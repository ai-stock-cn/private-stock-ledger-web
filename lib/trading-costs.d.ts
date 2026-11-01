export type AShareFeeRates = {
  commissionRate: number;
  minimumCommission: number;
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

export type RealizedLotSale = SellTransaction & {
  shares: number;
  sellPrice: number;
  soldCost: number;
  profit: number;
};

export type FifoSaleAllocation = {
  id: string;
  shares: number;
  buyPrice: number;
  allocatedBuyFee: number;
  soldCost: number;
  remainingShares: number;
  remainingBuyFee: number;
};

export type FifoSale = SellTransaction & {
  requestedShares: number;
  shares: number;
  sellPrice: number;
  soldCost: number;
  allocatedBuyFee: number;
  averageBuyPrice: number;
  profit: number;
  allocations: FifoSaleAllocation[];
  fullyAllocated: boolean;
};

export type AdjustedHoldingCosts = {
  baseCostBeforeAdjustment: number;
  baseUnitCostBeforeAdjustment: number;
  adjustedBaseCost: number;
  adjustedBaseUnitCost: number;
  adjustedTotalCost: number;
  adjustedTotalUnitCost: number;
};

export type RemainingLotCost = {
  boughtShares: number;
  soldShares: number;
  remainingShares: number;
  buyFeePerShare: number;
  soldBuyFee: number;
  remainingBuyFee: number;
  remainingGrossAmount: number;
  remainingCost: number;
  remainingUnitCost: number;
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
export function calculateRemainingLotCost(shares: number, price: number, totalBuyFee: number, soldShares?: number): RemainingLotCost;
export function calculateSellTransaction(shares: number, price: number, rates?: AShareFeeRates): SellTransaction;
export function calculateRealizedLotSale(soldShares: number, buyPrice: number, allocatedBuyFee: number, sellPrice: number, rates?: AShareFeeRates): RealizedLotSale | null;
export function calculateFifoSale(lots: Array<{ id: string; shares: number; price: number; buyFee: number }>, soldShares: number, sellPrice: number, rates?: AShareFeeRates): FifoSale | null;
export function calculateBrokerAdjustedPosition(totalCost: number, netSaleProceeds: number, remainingShares: number): { adjustedTotalCost: number; adjustedUnitCost: number };
export function calculateAdjustedHoldingCosts(totalCost: number, baseShares: number, totalShares: number, remainingLotCost: number, realizedProfit: number): AdjustedHoldingCosts;
export function findMinimumProfitableSale(shares: number, totalCost: number, rates?: AShareFeeRates): MinimumProfitableSale | null;
export function findMinimumProfitableSaleWithFixedFee(shares: number, totalCost: number, fixedSellFee: number, priceTick?: number): MinimumProfitableSale | null;
export function calculateProfitAtPrice(shares: number, totalCost: number, sellPrice: number, rates?: AShareFeeRates): SellTransaction & { profit: number };
