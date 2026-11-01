export function stockSecId(code) {
  const normalized = String(code ?? "").trim();
  if (!/^\d{6}$/.test(normalized)) throw new Error("invalid_stock_code");

  const market = /^[569]/.test(normalized) ? "1" : "0";
  return `${market}.${normalized}`;
}

export function parseEastMoneyQuote(payload) {
  const data = payload?.data;
  if (!data || typeof data !== "object") throw new Error("quote_unavailable");

  const currentPrice = scaledNumber(data.f43);
  const previousClose = scaledNumber(data.f60);
  const timestamp = Number(data.f86);

  if (currentPrice === null || previousClose === null || !Number.isFinite(timestamp)) {
    throw new Error("quote_unavailable");
  }

  return {
    code: String(data.f57 ?? ""),
    name: String(data.f58 ?? ""),
    price: currentPrice,
    previousClose,
    change: scaledNumber(data.f169) ?? roundPrice(currentPrice - previousClose),
    changePercent: scaledNumber(data.f170) ?? roundPrice((currentPrice - previousClose) / previousClose * 100),
    open: scaledNumber(data.f46),
    high: scaledNumber(data.f44),
    low: scaledNumber(data.f45),
    volume: finiteNumber(data.f47),
    amount: finiteNumber(data.f48),
    updatedAt: new Date(timestamp * 1000).toISOString(),
  };
}

function scaledNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= -1_000_000) return null;
  return roundPrice(number / 100);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function roundPrice(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
