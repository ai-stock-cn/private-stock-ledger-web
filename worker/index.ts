/** Cloudflare Worker entry point for the vinext site. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { calculateTradePlan } from "../lib/trade-calculator.js";
import type { AShareFeeRates } from "../lib/trading-costs.js";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  TRADING_FEE_CONFIG: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type RateBucket = {
  count: number;
  expiresAt: number;
};

const requestBuckets = new Map<string, RateBucket>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 120;
const MAX_BODY_BYTES = 32_000;
const PUBLIC_API_ORIGINS = new Set([
  "https://ai-stock-cn.github.io",
]);

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/calculate") {
      return calculateResponse(request, env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

async function calculateResponse(request: Request, env: Env): Promise<Response> {
  const corsHeaders = apiCorsHeaders(request);

  if (!isAllowedApiOrigin(request)) {
    return jsonResponse({ error: "origin_not_allowed" }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, { ...corsHeaders, Allow: "POST, OPTIONS" });
  }

  if (!allowRequest(request)) {
    return jsonResponse({ error: "too_many_requests" }, 429, { ...corsHeaders, "Retry-After": "60" });
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "payload_too_large" }, 413, corsHeaders);
  }

  try {
    const rates = parsePrivateRates(env.TRADING_FEE_CONFIG);
    const payload = await request.json();
    return jsonResponse(calculateTradePlan(payload, rates), 200, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_request";
    const status = message === "fee_config_unavailable" ? 503 : 400;
    return jsonResponse({ error: status === 503 ? "service_unavailable" : "invalid_request" }, status, corsHeaders);
  }
}

function isAllowedApiOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin || PUBLIC_API_ORIGINS.has(origin);
}

function apiCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (!origin || !isAllowedApiOrigin(request)) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function parsePrivateRates(value: string | undefined): AShareFeeRates {
  if (!value) throw new Error("fee_config_unavailable");

  const parsed = JSON.parse(value) as Partial<AShareFeeRates>;
  const rates: AShareFeeRates = {
    commissionRate: finiteNonNegative(parsed.commissionRate),
    minimumCommission: finiteNonNegative(parsed.minimumCommission),
    transferFeeRate: finiteNonNegative(parsed.transferFeeRate),
    stampDutyRate: finiteNonNegative(parsed.stampDutyRate),
    priceTick: finitePositive(parsed.priceTick),
  };

  return rates;
}

function finiteNonNegative(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("fee_config_unavailable");
  return number;
}

function finitePositive(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error("fee_config_unavailable");
  return number;
}

function allowRequest(request: Request): boolean {
  const now = Date.now();
  const client = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const current = requestBuckets.get(client);

  if (!current || current.expiresAt <= now) {
    requestBuckets.set(client, { count: 1, expiresAt: now + RATE_LIMIT_WINDOW_MS });
    if (requestBuckets.size > 1_000) pruneBuckets(now);
    return true;
  }

  current.count += 1;
  return current.count <= RATE_LIMIT_REQUESTS;
}

function pruneBuckets(now: number) {
  for (const [key, bucket] of requestBuckets) {
    if (bucket.expiresAt <= now) requestBuckets.delete(key);
  }
}

function jsonResponse(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

export default worker;
