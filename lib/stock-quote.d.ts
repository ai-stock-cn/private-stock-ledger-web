export type StockQuote = {
  code: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  amount: number | null;
  updatedAt: string;
};

export function stockSecId(code: string): string;
export function parseEastMoneyQuote(payload: unknown): StockQuote;
