import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBuyTransaction,
  calculateProfitAtPrice,
  calculateSellTransaction,
  findMinimumProfitableSale,
  findMinimumProfitableSaleWithFixedFee,
} from "../lib/trading-costs.js";

test("万一免五买入按佣金和过户费计算", () => {
  const result = calculateBuyTransaction(200, 52.39);
  assert.equal(result.grossAmount, 10478);
  assert.equal(result.commission, 1.05);
  assert.equal(result.transferFee, 0.1);
  assert.equal(result.totalFees, 1.15);
  assert.equal(result.totalCost, 10479.15);
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

test("按台账实际费用计算两笔T仓最低盈利卖价", () => {
  const first = findMinimumProfitableSaleWithFixedFee(200, 10479.15, 6.42);
  const second = findMinimumProfitableSaleWithFixedFee(100, 5243.15, 3.7);
  const combined = findMinimumProfitableSaleWithFixedFee(300, 15722.3, 10.12);

  assert.equal(first?.minimumProfitPrice, 52.43);
  assert.equal(second?.minimumProfitPrice, 52.47);
  assert.equal(combined?.minimumProfitPrice, 52.45);
  assert.equal(combined?.profit, 2.58);
});

test("中国平安1800股按整仓成本和收盘价计算盈亏", () => {
  const totalCost = 1800 * 50.987;
  const current = calculateProfitAtPrice(1800, totalCost, 52.8);
  const minimum = findMinimumProfitableSale(1800, totalCost);

  assert.equal(totalCost, 91776.6);
  assert.equal(current.totalFees, 57.97);
  assert.equal(current.profit, 3205.43);
  assert.equal(minimum?.minimumProfitPrice, 51.02);
});
