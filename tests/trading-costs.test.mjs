import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBuyTransaction,
  calculateSellTransaction,
  findMinimumProfitableSale,
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
