import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAdjustedHoldingCosts,
  calculateBrokerAdjustedPosition,
  calculateBuyTransaction,
  calculateFifoSale,
  calculateProfitAtPrice,
  calculateRealizedLotSale,
  calculateRemainingLotCost,
  calculateSellTransaction,
  findMinimumProfitableSale,
  findMinimumProfitableSaleWithFixedFee,
  roundMoney,
} from "../lib/trading-costs.js";

test("万一且最低一元买入按佣金和过户费计算", () => {
  const result = calculateBuyTransaction(200, 52.39);
  assert.equal(result.grossAmount, 10478);
  assert.equal(result.commission, 1.05);
  assert.equal(result.transferFee, 0.1);
  assert.equal(result.totalFees, 1.15);
  assert.equal(result.totalCost, 10479.15);
});

test("小额买入按最低一元佣金计算", () => {
  const result = calculateBuyTransaction(100, 52.35);

  assert.equal(result.grossAmount, 5235);
  assert.equal(result.commission, 1);
  assert.equal(result.transferFee, 0.05);
  assert.equal(result.totalFees, 1.05);
});

test("卖出费用包含印花税", () => {
  const result = calculateSellTransaction(200, 52.8);
  assert.equal(result.commission, 1.06);
  assert.equal(result.transferFee, 0.11);
  assert.equal(result.stampDuty, 5.28);
  assert.equal(result.totalFees, 6.45);
});

test("最低盈利卖价严格覆盖全部买卖费用", () => {
  const buy = calculateBuyTransaction(300, 52.39);
  const result = findMinimumProfitableSale(300, buy.totalCost);
  assert.ok(result);
  assert.ok(result.profit > 0);
  const previous = calculateSellTransaction(300, result.minimumProfitPrice - 0.01);
  assert.ok(previous.netProceeds <= buy.totalCost);
});

test("按台账实际费用计算剩余T仓最低盈利卖价", () => {
  const first = findMinimumProfitableSaleWithFixedFee(200, 10479.15, 6.42);
  const second = findMinimumProfitableSale(100, 5242.58);

  assert.equal(first?.minimumProfitPrice, 52.43);
  assert.equal(second?.minimumProfitPrice, 52.47);
});

test("买入200股卖出100股后按比例分摊买入费用", () => {
  const remaining = calculateRemainingLotCost(200, 52.42, 1.15, 100);

  assert.equal(remaining.remainingShares, 100);
  assert.equal(remaining.soldBuyFee, 0.575);
  assert.equal(remaining.remainingBuyFee, 0.575);
  assert.equal(remaining.remainingCost, 5242.58);
  assert.equal(remaining.remainingUnitCost, 52.4258);
});

test("填写卖出价后自动计算已实现盈利", () => {
  const sale = calculateRealizedLotSale(100, 52.42, 0.575, 52.8);

  assert.ok(sale);
  assert.equal(sale.soldCost, 5242.58);
  assert.equal(sale.grossAmount, 5280);
  assert.equal(sale.totalFees, 3.69);
  assert.equal(sale.netProceeds, 5276.31);
  assert.equal(sale.profit, 33.73);
});

test("已实现盈利自动降低1500股底仓和1800股整仓策略成本", () => {
  const result = calculateAdjustedHoldingCosts(91777.18, 1500, 1800, 15721.73, 33.73);

  assert.equal(result.baseCostBeforeAdjustment, 76055.45);
  assert.equal(result.adjustedBaseCost, 76021.72);
  assert.equal(roundMoney(result.adjustedBaseUnitCost), 50.68);
  assert.equal(result.adjustedTotalCost, 91743.45);
  assert.equal(roundMoney(result.adjustedTotalUnitCost), 50.97);
});

test("中国平安1800股按整仓成本和收盘价计算盈亏", () => {
  const totalCost = 91777.18;
  const marketValue = 1800 * 52.8;
  const grossProfit = roundMoney(marketValue - totalCost);
  const current = calculateProfitAtPrice(1800, totalCost, 52.8);
  const minimum = findMinimumProfitableSale(1800, totalCost);

  assert.equal(grossProfit, 3262.82);
  assert.equal(current.totalFees, 57.97);
  assert.equal(current.profit, 3204.85);
  assert.equal(minimum?.minimumProfitPrice, 51.02);
});

test("多批次一起卖只计算一笔卖出费用并按先进先出分摊成本", () => {
  const sale = calculateFifoSale([
    { id: "A", shares: 200, price: 52.39, buyFee: 1.15 },
    { id: "B", shares: 100, price: 52.42, buyFee: 0.575 },
  ], 300, 52.8);

  assert.ok(sale);
  assert.equal(sale.shares, 300);
  assert.equal(sale.allocations.length, 2);
  assert.equal(sale.totalFees, 9.66);
  assert.equal(sale.soldCost, 15721.73);
  assert.equal(sale.profit, 108.61);
});

test("确认卖出后按券商T口径用净回款降低剩余持仓成本", () => {
  const sale = calculateFifoSale([
    { id: "B", shares: 100, price: 52.42, buyFee: 0.575 },
  ], 100, 52.8);
  assert.ok(sale);

  const adjusted = calculateBrokerAdjustedPosition(91777.18, sale.netProceeds, 1700);
  assert.equal(adjusted.adjustedTotalCost, 86500.87);
  assert.equal(roundMoney(adjusted.adjustedUnitCost), 50.88);
});
