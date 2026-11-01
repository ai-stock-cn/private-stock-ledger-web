export const DEFAULT_A_SHARE_FEE_RATES = Object.freeze({
  commissionRate: 0.0001,
  minimumCommission: 1,
  transferFeeRate: 0.00001,
  stampDutyRate: 0.0005,
  priceTick: 0.01,
});

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calculateBuyTransaction(shares, price, rates = DEFAULT_A_SHARE_FEE_RATES) {
  const safeShares = positiveNumber(shares);
  const safePrice = positiveNumber(price);
  const grossAmount = roundMoney(safeShares * safePrice);
  const commission = Math.max(
    roundMoney(grossAmount * rates.commissionRate),
    nonNegativeNumber(rates.minimumCommission),
  );
  const transferFee = roundMoney(grossAmount * rates.transferFeeRate);
  const totalFees = roundMoney(commission + transferFee);
  const totalCost = roundMoney(grossAmount + totalFees);

  return {
    shares: safeShares,
    price: safePrice,
    grossAmount,
    commission,
    transferFee,
    stampDuty: 0,
    totalFees,
    totalCost,
    unitCost: safeShares > 0 ? totalCost / safeShares : 0,
  };
}

export function calculateRemainingLotCost(shares, price, totalBuyFee, soldShares = 0) {
  const boughtShares = positiveNumber(shares);
  const safePrice = positiveNumber(price);
  const safeBuyFee = nonNegativeNumber(totalBuyFee);
  const safeSoldShares = Math.min(nonNegativeNumber(soldShares), boughtShares);
  const remainingShares = boughtShares - safeSoldShares;
  const buyFeePerShare = boughtShares > 0 ? safeBuyFee / boughtShares : 0;
  const soldBuyFee = buyFeePerShare * safeSoldShares;
  const remainingBuyFee = buyFeePerShare * remainingShares;
  const remainingGrossAmount = roundMoney(remainingShares * safePrice);
  const remainingCost = roundMoney(remainingGrossAmount + remainingBuyFee);

  return {
    boughtShares,
    soldShares: safeSoldShares,
    remainingShares,
    buyFeePerShare,
    soldBuyFee,
    remainingBuyFee,
    remainingGrossAmount,
    remainingCost,
    remainingUnitCost: remainingShares > 0 ? remainingCost / remainingShares : 0,
  };
}

export function calculateSellTransaction(shares, price, rates = DEFAULT_A_SHARE_FEE_RATES) {
  const safeShares = positiveNumber(shares);
  const safePrice = positiveNumber(price);
  const grossAmount = roundMoney(safeShares * safePrice);
  const commission = Math.max(
    roundMoney(grossAmount * rates.commissionRate),
    nonNegativeNumber(rates.minimumCommission),
  );
  const transferFee = roundMoney(grossAmount * rates.transferFeeRate);
  const stampDuty = roundMoney(grossAmount * rates.stampDutyRate);
  const totalFees = roundMoney(commission + transferFee + stampDuty);
  const netProceeds = roundMoney(grossAmount - totalFees);

  return { grossAmount, commission, transferFee, stampDuty, totalFees, netProceeds };
}

export function calculateRealizedLotSale(
  soldShares,
  buyPrice,
  allocatedBuyFee,
  sellPrice,
  rates = DEFAULT_A_SHARE_FEE_RATES,
) {
  const safeShares = positiveNumber(soldShares);
  const safeBuyPrice = positiveNumber(buyPrice);
  const safeSellPrice = positiveNumber(sellPrice);
  const safeBuyFee = nonNegativeNumber(allocatedBuyFee);
  if (!safeShares || !safeBuyPrice || !safeSellPrice) return null;

  const soldCost = roundMoney(safeShares * safeBuyPrice + safeBuyFee);
  const sale = calculateSellTransaction(safeShares, safeSellPrice, rates);

  return {
    ...sale,
    shares: safeShares,
    sellPrice: safeSellPrice,
    soldCost,
    profit: roundMoney(sale.netProceeds - soldCost),
  };
}

export function calculateAdjustedHoldingCosts(
  totalCost,
  baseShares,
  totalShares,
  remainingLotCost,
  realizedProfit,
) {
  const safeTotalCost = nonNegativeNumber(totalCost);
  const safeBaseShares = positiveNumber(baseShares);
  const safeTotalShares = positiveNumber(totalShares);
  const safeRemainingLotCost = nonNegativeNumber(remainingLotCost);
  const safeRealizedProfit = Number.isFinite(Number(realizedProfit)) ? Number(realizedProfit) : 0;
  const baseCostBeforeAdjustment = roundMoney(Math.max(safeTotalCost - safeRemainingLotCost, 0));
  const adjustedBaseCost = roundMoney(baseCostBeforeAdjustment - safeRealizedProfit);
  const adjustedTotalCost = roundMoney(safeTotalCost - safeRealizedProfit);

  return {
    baseCostBeforeAdjustment,
    baseUnitCostBeforeAdjustment: safeBaseShares > 0 ? baseCostBeforeAdjustment / safeBaseShares : 0,
    adjustedBaseCost,
    adjustedBaseUnitCost: safeBaseShares > 0 ? adjustedBaseCost / safeBaseShares : 0,
    adjustedTotalCost,
    adjustedTotalUnitCost: safeTotalShares > 0 ? adjustedTotalCost / safeTotalShares : 0,
  };
}

export function findMinimumProfitableSale(shares, totalCost, rates = DEFAULT_A_SHARE_FEE_RATES) {
  const safeShares = positiveNumber(shares);
  const safeTotalCost = positiveNumber(totalCost);
  if (!safeShares || !safeTotalCost) return null;

  const totalSellRate = rates.commissionRate + rates.transferFeeRate + rates.stampDutyRate;
  const breakEvenPrice = safeTotalCost / (safeShares * Math.max(1 - totalSellRate, 0.000001));
  let minimumProfitPrice = roundPrice(Math.ceil((breakEvenPrice - 1e-10) / rates.priceTick) * rates.priceTick, rates.priceTick);
  let sale = calculateSellTransaction(safeShares, minimumProfitPrice, rates);
  let guard = 0;

  while (sale.netProceeds <= safeTotalCost && guard < 1000) {
    minimumProfitPrice = roundPrice(minimumProfitPrice + rates.priceTick, rates.priceTick);
    sale = calculateSellTransaction(safeShares, minimumProfitPrice, rates);
    guard += 1;
  }

  return {
    breakEvenPrice,
    minimumProfitPrice,
    grossAmount: sale.grossAmount,
    totalFees: sale.totalFees,
    netProceeds: sale.netProceeds,
    profit: roundMoney(sale.netProceeds - safeTotalCost),
  };
}

export function findMinimumProfitableSaleWithFixedFee(
  shares,
  totalCost,
  fixedSellFee,
  priceTick = DEFAULT_A_SHARE_FEE_RATES.priceTick,
) {
  const safeShares = positiveNumber(shares);
  const safeTotalCost = positiveNumber(totalCost);
  const safeSellFee = nonNegativeNumber(fixedSellFee);
  const safePriceTick = positiveNumber(priceTick) || DEFAULT_A_SHARE_FEE_RATES.priceTick;
  if (!safeShares || !safeTotalCost) return null;

  const breakEvenPrice = (safeTotalCost + safeSellFee) / safeShares;
  let minimumProfitPrice = roundPrice(
    Math.ceil((breakEvenPrice - 1e-10) / safePriceTick) * safePriceTick,
    safePriceTick,
  );
  let grossAmount = roundMoney(safeShares * minimumProfitPrice);
  let netProceeds = roundMoney(grossAmount - safeSellFee);
  let guard = 0;

  while (netProceeds <= safeTotalCost && guard < 1000) {
    minimumProfitPrice = roundPrice(minimumProfitPrice + safePriceTick, safePriceTick);
    grossAmount = roundMoney(safeShares * minimumProfitPrice);
    netProceeds = roundMoney(grossAmount - safeSellFee);
    guard += 1;
  }

  return {
    breakEvenPrice,
    minimumProfitPrice,
    grossAmount,
    totalFees: safeSellFee,
    netProceeds,
    profit: roundMoney(netProceeds - safeTotalCost),
  };
}

export function calculateProfitAtPrice(shares, totalCost, sellPrice, rates = DEFAULT_A_SHARE_FEE_RATES) {
  const sale = calculateSellTransaction(shares, sellPrice, rates);
  return { ...sale, profit: roundMoney(sale.netProceeds - positiveNumber(totalCost)) };
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function roundPrice(value, tick) {
  const decimals = Math.max(0, String(tick).split(".")[1]?.length ?? 0);
  return Number(Number(value).toFixed(decimals));
}
