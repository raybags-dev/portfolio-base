"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { useAuth } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await login(email, password);
      setAuth(res.access_token, email);
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-theme bg-surface shadow-card p-8 border border-white/10"
      >
        <h1 className="font-heading font-bold text-xl mb-6">Admin sign in</h1>
        {error && (
          <p className="mb-4 text-sm text-red-400 bg-red-400/10 rounded p-2">{error}</p>
        )}
        <label className="block text-sm mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 mb-4 outline-none focus:border-primary"
        />
        <label className="block text-sm mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 mb-6 outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-theme bg-primary text-white py-2.5 font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
