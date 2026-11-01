/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  APP_AUTH_USERNAME: string;
  APP_AUTH_PASSWORD_HASH: string;
  APP_AUTH_SESSION_SECRET: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

const SESSION_COOKIE = "private_portfolio_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PUBLIC_ASSET_PATHS = new Set(["/favicon.svg", "/og.png"]);

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/auth/logout") {
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/auth/login",
          "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
        },
      });
    }

    if (url.pathname === "/auth/login") {
      if (request.method === "POST") {
        const formData = await request.formData();
        const username = String(formData.get("username") ?? "");
        const password = String(formData.get("password") ?? "");
        const usernameMatches = constantTimeEqual(username, env.APP_AUTH_USERNAME ?? "");
        const passwordHash = await sha256Hex(password);
        const passwordMatches = constantTimeEqual(
          passwordHash,
          env.APP_AUTH_PASSWORD_HASH ?? "",
        );

        if (usernameMatches && passwordMatches && env.APP_AUTH_SESSION_SECRET) {
          const session = await createSession(
            env.APP_AUTH_USERNAME,
            env.APP_AUTH_SESSION_SECRET,
          );
          return new Response(null, {
            status: 303,
            headers: {
              Location: "/",
              "Set-Cookie": `${SESSION_COOKIE}=${session}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
              "Cache-Control": "no-store",
            },
          });
        }

        return loginPage(env.APP_AUTH_USERNAME, true, 401);
      }

      return loginPage(env.APP_AUTH_USERNAME, false, 200);
    }

    if (!PUBLIC_ASSET_PATHS.has(url.pathname) && !(await hasValidSession(request, env))) {
      return loginPage(env.APP_AUTH_USERNAME, false, 401);
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

async function hasValidSession(request: Request, env: Env): Promise<boolean> {
  if (!env.APP_AUTH_USERNAME || !env.APP_AUTH_SESSION_SECRET) return false;

  const session = readCookie(request.headers.get("Cookie"), SESSION_COOKIE);
  if (!session) return false;

  const [expiresAtText, signature] = session.split(".");
  const expiresAt = Number(expiresAtText);
  if (!expiresAtText || !signature || !Number.isInteger(expiresAt)) return false;
  if (expiresAt <= Math.floor(Date.now() / 1000)) return false;

  const expectedSignature = await hmacHex(
    `${env.APP_AUTH_USERNAME}.${expiresAtText}`,
    env.APP_AUTH_SESSION_SECRET,
  );
  return constantTimeEqual(signature, expectedSignature);
}

async function createSession(username: string, secret: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const signature = await hmacHex(`${username}.${expiresAt}`, secret);
  return `${expiresAt}.${signature}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(signature));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const item of header.split(";")) {
    const [cookieName, ...valueParts] = item.trim().split("=");
    if (cookieName === name) return valueParts.join("=");
  }
  return null;
}

function loginPage(username: string, hasError: boolean, status: number): Response {
  const safeUsername = escapeHtml(username || "xiedi");
  const error = hasError
    ? '<p class="error" role="alert">账号或密码不正确，请重新输入。</p>'
    : "";
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>登录 · 做T收益计算器</title>
    <style>
      :root{color-scheme:light;--ink:#0a1222;--paper:#f4f3ed;--lime:#d7ff63;--line:rgba(10,18,34,.13);--muted:#6f7b8e}
      *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 88% 8%,rgba(215,255,99,.58),transparent 29%),radial-gradient(circle at 5% 90%,rgba(121,168,255,.22),transparent 28%),var(--paper);color:var(--ink);font-family:"PingFang SC","Microsoft YaHei",sans-serif}
      main{width:min(940px,100%);display:grid;grid-template-columns:1.05fr .95fr;overflow:hidden;border:1px solid var(--line);border-radius:32px;background:rgba(255,255,252,.92);box-shadow:0 30px 80px rgba(10,18,34,.12)}
      .intro{padding:64px;background:var(--ink);color:white}.mark{display:grid;width:48px;height:48px;place-items:center;border-radius:14px;background:var(--lime);color:var(--ink);font-weight:900}.eyebrow{display:block;margin-top:72px;color:#aab4c5;font:700 11px ui-monospace,monospace;letter-spacing:.18em}.intro h1{margin:16px 0 18px;font:500 clamp(42px,6vw,68px)/1.02 Georgia,"Songti SC",serif;letter-spacing:-.055em}.intro p{max-width:360px;margin:0;color:#aab4c5;font-size:13px;line-height:1.9}
      .login{padding:64px 56px;display:flex;flex-direction:column;justify-content:center}.login h2{margin:0 0 8px;font:500 34px Georgia,"Songti SC",serif}.login>p{margin:0 0 32px;color:var(--muted);font-size:12px;line-height:1.7}.field{display:grid;gap:8px;margin-top:16px;color:var(--muted);font-size:10px}.field input{width:100%;height:50px;padding:0 15px;border:1px solid var(--line);border-radius:13px;outline:none;background:white;color:var(--ink);font:700 14px ui-monospace,monospace}.field input:focus{border-color:#6d84b3;box-shadow:0 0 0 4px rgba(121,168,255,.2)}button{width:100%;height:52px;margin-top:22px;border:0;border-radius:13px;background:var(--ink);color:white;font-weight:800;cursor:pointer}button:hover{background:#162139}.error{margin:16px 0 0!important;padding:11px 13px;border-radius:10px;background:#fff0ec;color:#a83d2b!important;font-size:11px!important}.security{display:flex;align-items:center;gap:8px;margin-top:20px!important;color:#7b8798!important;font-size:9px!important}.security i{width:7px;height:7px;border-radius:50%;background:#56a577;box-shadow:0 0 0 4px rgba(86,165,119,.12)}
      @media(max-width:760px){main{grid-template-columns:1fr}.intro{padding:34px}.eyebrow{margin-top:36px}.intro h1{font-size:46px}.login{padding:42px 32px}}
    </style>
  </head>
  <body>
    <main>
      <section class="intro"><span class="mark">算</span><span class="eyebrow">TRADE CALCULATOR</span><h1>做T收益<br />计算器</h1><p>单笔买卖与多笔合并卖出收益，按固定费率自动测算。</p></section>
      <section class="login"><h2>身份验证</h2><p>输入专属账号和口令后，进入做T收益计算器。</p>${error}<form method="post" action="/auth/login"><label class="field"><span>账号</span><input name="username" value="${safeUsername}" autocomplete="username" required /></label><label class="field"><span>密码</span><input name="password" type="password" autocomplete="current-password" autofocus required /></label><button type="submit">进入收益计算器</button></form><p class="security"><i></i>口令仅在服务端校验，浏览器源码中不保存明文。</p></section>
    </main>
  </body>
</html>`;

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export default worker;
