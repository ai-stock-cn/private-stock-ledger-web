import { FormEvent, useState } from "react";
import { createRoot } from "react-dom/client";
import PortfolioCalculator, { type Holding } from "../app/PortfolioCalculator";
import "../app/globals.css";
import "./pages.css";
import { ENCRYPTED_PORTFOLIO } from "./encrypted-default";

type PortfolioSeed = {
  holdings: Holding[];
};

const SESSION_KEY = "private-stock-pages-session-v1";

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function decryptPortfolio(password: string): Promise<PortfolioSeed> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromBase64(ENCRYPTED_PORTFOLIO.salt),
      iterations: ENCRYPTED_PORTFOLIO.iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ENCRYPTED_PORTFOLIO.iv) },
    key,
    fromBase64(ENCRYPTED_PORTFOLIO.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as PortfolioSeed;
}

function App() {
  const [authenticated, setAuthenticated] = useState(
    () => window.sessionStorage.getItem(SESSION_KEY) === "authenticated",
  );
  const [seed, setSeed] = useState<PortfolioSeed | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      if (username !== ENCRYPTED_PORTFOLIO.username) throw new Error("invalid account");
      const decrypted = await decryptPortfolio(password);
      if (!Array.isArray(decrypted.holdings)) throw new Error("invalid portfolio");
      window.sessionStorage.setItem(SESSION_KEY, "authenticated");
      setSeed(decrypted);
      setAuthenticated(true);
    } catch {
      setError("账号或密码不正确，请重新输入。");
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogout() {
    window.sessionStorage.removeItem(SESSION_KEY);
    setAuthenticated(false);
    setSeed(null);
  }

  if (authenticated) {
    return <PortfolioCalculator initialHoldings={seed?.holdings ?? []} onLogout={handleLogout} />;
  }

  return (
    <main className="pages-login-shell">
      <section className="pages-login-card">
        <div className="pages-login-intro">
          <span className="pages-login-mark">私</span>
          <span className="pages-login-eyebrow">OWNER ONLY</span>
          <h1>私人持仓<br />台账</h1>
          <p>底仓、做T、交易费用与盈亏测算，只为本人开放。</p>
        </div>
        <div className="pages-login-form">
          <h2>身份验证</h2>
          <p>输入原来的账号和密码，即可在手机查看。</p>
          {error ? <p className="pages-login-error" role="alert">{error}</p> : null}
          <form onSubmit={handleLogin}>
            <label>
              <span>账号</span>
              <input name="username" defaultValue={ENCRYPTED_PORTFOLIO.username} autoComplete="username" required />
            </label>
            <label>
              <span>密码</span>
              <input name="password" type="password" autoComplete="current-password" autoFocus required />
            </label>
            <button type="submit" disabled={submitting}>{submitting ? "正在验证…" : "进入私人台账"}</button>
          </form>
          <p className="pages-login-security"><i />持仓初始数据经过密码加密后发布。</p>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
