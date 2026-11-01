import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBrokerAdjustedPosition,
  calculateBuyTransaction,
  calculateFifoSale,
  calculateProfitAtPrice,
  calculateRemainingLotCost,
  calculateSellTransaction,
  findMinimumProfitableSale,
  roundMoney,
} from "../lib/trading-costs.js";
import { calculateTradePlan } from "../lib/trade-calculator.js";
import { parseEastMoneyQuote, parseTencentQuote, stockSecId, stockSymbol } from "../lib/stock-quote.js";

const MOCK_RATES = {
  commissionRate: 0.0003,
  minimumCommission: 2.5,
  transferFeeRate: 0.00002,
  stampDutyRate: 0.0008,
  priceTick: 0.01,
};

test("买入按模拟佣金和过户费计算", () => {
  const result = calculateBuyTransaction(100, 10, MOCK_RATES);

  assert.equal(result.grossAmount, 1000);
  assert.equal(result.commission, 2.5);
  assert.equal(result.transferFee, 0.02);
  assert.equal(result.totalFees, 2.52);
  assert.equal(result.totalCost, 1002.52);
});

test("大额买入按比例佣金计算", () => {
  const result = calculateBuyTransaction(1000, 100, MOCK_RATES);

  assert.equal(result.commission, 30);
  assert.equal(result.transferFee, 2);
  assert.equal(result.totalFees, 32);
});

test("卖出包含模拟印花税", () => {
  const result = calculateSellTransaction(100, 10, MOCK_RATES);

  assert.equal(result.commission, 2.5);
  assert.equal(result.transferFee, 0.02);
  assert.equal(result.stampDuty, 0.8);
  assert.equal(result.totalFees, 3.32);
  assert.equal(result.netProceeds, 996.68);
});

test("最低盈利卖价严格覆盖全部费用", () => {
  const buy = calculateBuyTransaction(300, 10, MOCK_RATES);
  const result = findMinimumProfitableSale(300, buy.totalCost, MOCK_RATES);

  assert.ok(result);
  assert.ok(result.profit > 0);
  const previous = calculateSellTransaction(300, result.minimumProfitPrice - 0.01, MOCK_RATES);
  assert.ok(previous.netProceeds <= buy.totalCost);
});

test("部分卖出按比例分摊买入费用", () => {
  const remaining = calculateRemainingLotCost(200, 10, 2.52, 100);

  assert.equal(remaining.remainingShares, 100);
  assert.equal(remaining.soldBuyFee, 1.26);
  assert.equal(remaining.remainingBuyFee, 1.26);
  assert.equal(remaining.remainingCost, 1001.26);
});

test("多批次合并卖出只计算一笔卖出费用", () => {
  const sale = calculateFifoSale([
    { id: "A", shares: 200, price: 10, buyFee: 2.54 },
    { id: "B", shares: 100, price: 10, buyFee: 2.52 },
  ], 300, 11, MOCK_RATES);

  assert.ok(sale);
  assert.equal(sale.allocations.length, 2);
  assert.equal(sale.soldCost, 3005.06);
  assert.equal(sale.profit, 289.73);
});

test("公开计算结果不返回费率和费用明细", () => {
  const result = calculateTradePlan({
    trades: [
      { shares: 200, buyPrice: 10, sellPrice: 11 },
      { shares: 100, buyPrice: 10, sellPrice: 11 },
    ],
    combinedSellPrice: 11,
  }, MOCK_RATES);

  assert.equal(result.rows[0].buyAmount, 2000);
  assert.equal(result.rows[0].profit, 193.16);
  assert.equal(result.combined.profit, 289.73);
  assert.equal("totalFees" in result.rows[0], false);
  assert.equal("rates" in result, false);
});

test("净回款降低剩余持仓成本", () => {
  const sale = calculateProfitAtPrice(100, 1002.52, 11, MOCK_RATES);
  const adjusted = calculateBrokerAdjustedPosition(5000, sale.netProceeds, 400);

  assert.equal(adjusted.adjustedTotalCost, 3903.4);
  assert.equal(roundMoney(adjusted.adjustedUnitCost), 9.76);
});

test("股票代码转换为行情市场标识", () => {
  assert.equal(stockSecId("601318"), "1.601318");
  assert.equal(stockSecId("000538"), "0.000538");
  assert.equal(stockSymbol("601318"), "sh601318");
  assert.equal(stockSymbol("000538"), "sz000538");
  assert.throws(() => stockSecId("60131"), /invalid_stock_code/);
});

test("行情字段转换为价格和涨跌幅", () => {
  const quote = parseEastMoneyQuote({
    data: {
      f43: 5280,
      f44: 5320,
      f45: 5232,
      f46: 5320,
      f47: 709995,
      f48: 3737981236,
      f57: "601318",
      f58: "中国平安",
      f60: 5320,
      f86: 1793347915,
      f169: -40,
      f170: -75,
    },
  });

  assert.equal(quote.price, 52.8);
  assert.equal(quote.change, -0.4);
  assert.equal(quote.changePercent, -0.75);
  assert.equal(quote.high, 53.2);
  assert.equal(quote.low, 52.32);
  assert.equal(quote.code, "601318");
});

test("腾讯行情文本转换为实时价格", () => {
  const fields = Array(36).fill("");
  Object.assign(fields, {
    0: "1",
    1: "中国平安",
    2: "601318",
    3: "52.80",
    4: "53.20",
    5: "53.20",
    6: "709995",
    30: "20261030161455",
    31: "-0.40",
    32: "-0.75",
    33: "53.20",
    34: "52.32",
    35: "52.80/709995/3737981236",
  });
  const quote = parseTencentQuote(`v_sh601318="${fields.join("~")}";`);

  assert.equal(quote.price, 52.8);
  assert.equal(quote.change, -0.4);
  assert.equal(quote.changePercent, -0.75);
  assert.equal(quote.high, 53.2);
  assert.equal(quote.low, 52.32);
  assert.equal(quote.name, "中国平安");
});
