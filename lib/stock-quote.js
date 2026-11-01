export function stockSecId(code) {
  const normalized = String(code ?? "").trim();
  if (!/^\d{6}$/.test(normalized)) throw new Error("invalid_stock_code");

  const market = /^[569]/.test(normalized) ? "1" : "0";
  return `${market}.${normalized}`;
}

export function stockSymbol(code) {
  const normalized = String(code ?? "").trim();
  if (!/^\d{6}$/.test(normalized)) throw new Error("invalid_stock_code");

  const market = /^[569]/.test(normalized) ? "sh" : "sz";
  return `${market}${normalized}`;
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
    volume: finiteNonNegativeNumber(data.f47),
    amount: finiteNonNegativeNumber(data.f48),
    updatedAt: new Date(timestamp * 1000).toISOString(),
  };
}

export function parseTencentQuote(payload) {
  const match = String(payload ?? "").match(/="([\s\S]*)";?\s*$/);
  if (!match) throw new Error("quote_unavailable");

  const fields = match[1].split("~");
  const price = finitePositiveNumber(fields[3]);
  const previousClose = finitePositiveNumber(fields[4]);
  if (price === null || previousClose === null) throw new Error("quote_unavailable");

  return {
    code: fields[2] ?? "",
    name: fields[1]?.includes("�") ? "" : fields[1] ?? "",
    price,
    previousClose,
    change: finiteNumber(fields[31]) ?? roundPrice(price - previousClose),
    changePercent: finiteNumber(fields[32]) ?? roundPrice((price - previousClose) / previousClose * 100),
    open: finitePositiveNumber(fields[5]),
    high: finitePositiveNumber(fields[33]),
    low: finitePositiveNumber(fields[34]),
    volume: finiteNonNegativeNumber(fields[6]),
    amount: parseTencentAmount(fields[35]),
    updatedAt: parseTencentTime(fields[30]),
  };
}

function scaledNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= -1_000_000) return null;
  return roundPrice(number / 100);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function finitePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseTencentAmount(value) {
  const amount = Number(String(value ?? "").split("/")[2]);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function parseTencentTime(value) {
  const match = String(value ?? "").match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) throw new Error("quote_unavailable");

  const [, year, month, day, hour, minute, second] = match;
  return new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 8,
    Number(minute),
    Number(second),
  )).toISOString();
}

function roundPrice(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
