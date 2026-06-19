"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPassword } from "@/lib/api";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setError("No reset token found in URL. Request a new link.");
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== confirm) { setError("Passwords do not match"); return; }
    if (pw.length < 8) { setError("Password must be at least 8 characters"); return; }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, pw, confirm);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed. The link may have expired.");
    } finally {
      setBusy(false);
    }
  }

  const INPUT = "w-full rounded-theme bg-bg border border-white/15 px-3 py-2 mb-4 outline-none focus:border-primary text-sm";

  if (done) {
    return (
      <div className="w-full max-w-sm rounded-theme bg-surface shadow-card p-8 border border-white/10 text-center">
        <div className="text-4xl mb-4">✅</div>
        <h1 className="font-heading font-bold text-xl mb-2">Password updated</h1>
        <p className="text-sm text-muted mb-6">You can now sign in with your new password.</p>
        <button onClick={() => router.replace("/admin/login")} className="w-full rounded-theme bg-primary text-white py-2.5 font-medium hover:opacity-90">
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm rounded-theme bg-surface shadow-card p-8 border border-white/10">
      <h1 className="font-heading font-bold text-xl mb-2">Set new password</h1>
      <p className="text-sm text-muted mb-6">Choose a strong password — at least 8 characters.</p>
      {error && <p className="mb-4 text-sm text-red-400 bg-red-400/10 rounded p-2">{error}</p>}
      <label className="block text-sm mb-1">New password</label>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} placeholder="••••••••" className={INPUT} />
      <label className="block text-sm mb-1">Confirm password</label>
      <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} placeholder="••••••••" className={INPUT} />
      <button type="submit" disabled={busy || !token} className="w-full rounded-theme bg-primary text-white py-2.5 font-medium hover:opacity-90 disabled:opacity-50">
        {busy ? "Saving…" : "Set new password"}
      </button>
      <button type="button" onClick={() => router.replace("/admin/login")} className="w-full mt-3 text-sm text-muted hover:text-primary transition-colors text-center">
        ← Back to sign in
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen grid place-items-center px-6">
      <Suspense fallback={<p className="text-muted animate-pulse">Loading…</p>}>
        <ResetForm />
      </Suspense>
    </div>
  );
}
