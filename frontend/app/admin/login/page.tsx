"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, forgotPassword } from "@/lib/api";
import { useAuth } from "@/lib/store";

type View = "login" | "forgot" | "forgot-sent";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [view, setView] = useState<View>("login");

  // login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // forgot-password form
  const [fpEmail, setFpEmail] = useState("");
  const [fpBusy, setFpBusy] = useState(false);
  const [fpError, setFpError] = useState<string | null>(null);
  const [fpResult, setFpResult] = useState<{ reset_url: string; wa_url: string; expires_minutes: number } | null>(null);
  const [copied, setCopied] = useState(false);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await login(email, password);
      setAuth(res.access_token, email, res.refresh_token);
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    setFpBusy(true);
    setFpError(null);
    try {
      const res = await forgotPassword(fpEmail);
      setFpResult(res);
      setView("forgot-sent");
    } catch (err) {
      setFpError(err instanceof Error ? err.message : "Could not generate reset link");
    } finally {
      setFpBusy(false);
    }
  }

  function copyLink() {
    if (!fpResult) return;
    navigator.clipboard.writeText(fpResult.reset_url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const INPUT = "w-full rounded-theme bg-bg border border-white/15 px-3 py-2 mb-4 outline-none focus:border-primary text-sm";

  return (
    <div className="min-h-screen grid place-items-center px-6">

      {/* ── Login form ── */}
      {view === "login" && (
        <form onSubmit={onLogin} className="w-full max-w-sm rounded-theme bg-surface shadow-card p-8 border border-white/10">
          <h1 className="font-heading font-bold text-xl mb-6">Admin sign in</h1>
          {error && (
            <p className="mb-4 text-sm text-red-400 bg-red-400/10 rounded p-2">{error}</p>
          )}
          <label className="block text-sm mb-1">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={INPUT} />
          <label className="block text-sm mb-1">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className={INPUT} />
          <button type="submit" disabled={busy} className="w-full rounded-theme bg-primary text-white py-2.5 font-medium hover:opacity-90 disabled:opacity-50 mb-4">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button type="button" onClick={() => { setView("forgot"); setFpEmail(email); setFpError(null); }} className="w-full text-sm text-muted hover:text-primary transition-colors text-center">
            Forgot your password?
          </button>
        </form>
      )}

      {/* ── Forgot password form ── */}
      {view === "forgot" && (
        <form onSubmit={onForgot} className="w-full max-w-sm rounded-theme bg-surface shadow-card p-8 border border-white/10">
          <button type="button" onClick={() => setView("login")} className="text-xs text-muted hover:text-primary mb-5 flex items-center gap-1">
            ← Back to sign in
          </button>
          <h1 className="font-heading font-bold text-xl mb-2">Reset password</h1>
          <p className="text-sm text-muted mb-6">Enter your admin email. A one-time reset link will be generated — you can copy it or send it to yourself via WhatsApp.</p>
          {fpError && (
            <p className="mb-4 text-sm text-red-400 bg-red-400/10 rounded p-2">{fpError}</p>
          )}
          <label className="block text-sm mb-1">Admin email</label>
          <input type="email" value={fpEmail} onChange={(e) => setFpEmail(e.target.value)} required placeholder="baguma.github@gmail.com" className={INPUT} />
          <button type="submit" disabled={fpBusy || !fpEmail.trim()} className="w-full rounded-theme bg-primary text-white py-2.5 font-medium hover:opacity-90 disabled:opacity-50">
            {fpBusy ? "Generating link…" : "Generate reset link"}
          </button>
        </form>
      )}

      {/* ── Reset link sent ── */}
      {view === "forgot-sent" && fpResult && (
        <div className="w-full max-w-sm rounded-theme bg-surface shadow-card p-8 border border-white/10">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">🔑</span>
            <h1 className="font-heading font-bold text-xl">Reset link ready</h1>
          </div>
          <p className="text-sm text-muted mb-5">
            Valid for {fpResult.expires_minutes} minutes. Copy the link below or send it to yourself on WhatsApp.
          </p>

          {/* Reset URL */}
          <div className="rounded-theme bg-bg border border-white/10 p-3 mb-4">
            <p className="text-xs text-muted mb-1">Reset URL</p>
            <p className="text-xs font-mono break-all text-primary">{fpResult.reset_url}</p>
          </div>

          <div className="flex gap-2 mb-4">
            <button onClick={copyLink} className="flex-1 rounded-theme border border-white/15 text-sm py-2.5 hover:bg-white/5 transition-colors">
              {copied ? "✓ Copied!" : "Copy link"}
            </button>
            <a
              href={fpResult.wa_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-theme border border-[#25D366]/40 bg-[#25D366]/10 text-[#25D366] text-sm py-2.5 text-center hover:bg-[#25D366]/20 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
              </svg>
              Send via WhatsApp
            </a>
          </div>

          <button type="button" onClick={() => { setView("login"); setFpResult(null); }} className="w-full text-sm text-muted hover:text-primary transition-colors text-center">
            ← Back to sign in
          </button>
        </div>
      )}
    </div>
  );
}
