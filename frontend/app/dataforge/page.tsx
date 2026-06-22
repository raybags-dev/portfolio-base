"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getBootstrap, submitPipelineRequest } from "@/lib/api";
import ThemeProvider from "@/components/ThemeProvider";
import Navbar from "@/components/Navbar";

export default function DataForgePage() {
  const { data } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const [form, setForm] = useState({ name: "", email: "", reason: "" });
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await submitPipelineRequest({
        name: form.name,
        email: form.email,
        reason: form.reason || undefined,
      });
      setStatus({ ok: true, msg: res.detail || "Request received." });
      setForm({ name: "", email: "", reason: "" });
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : "Failed to submit." });
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="text-muted animate-pulse">Loading…</p>
      </main>
    );
  }

  const site = data.site_configuration;
  const input =
    "w-full rounded-theme bg-bg border border-white/15 px-3 py-2 outline-none focus:border-primary text-sm";

  const techStack = [
    { label: "Python / FastAPI", icon: "⚡" },
    { label: "DuckDB + dbt", icon: "🦆" },
    { label: "Playwright crawlers", icon: "🕷️" },
    { label: "React dashboard", icon: "📊" },
    { label: "Docker / VPS", icon: "🐳" },
  ];

  return (
    <>
      <ThemeProvider theme={data.theme} />
      <Navbar site={site} theme={data.theme} sections={data.sections} />

      <main className="container-x py-14 max-w-4xl">
        {/* Hero */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">🔧</span>
            <h1 className="text-3xl sm:text-4xl font-heading font-bold">DataForge ELT</h1>
          </div>
          <p className="text-muted max-w-2xl mb-4">
            A production-quality data engineering platform — Playwright crawlers, a
            partitioned data lake, DuckDB warehouse, dbt transformations, and a live
            React dashboard. All running on a single VPS.
          </p>
          <div className="flex flex-wrap gap-2 mb-6">
            {techStack.map((t) => (
              <span
                key={t.label}
                className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-surface border border-white/10 text-muted"
              >
                <span>{t.icon}</span> {t.label}
              </span>
            ))}
          </div>

          <div className="flex gap-3">
            <a
              href="/dataforge"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-theme bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Open Dashboard
            </a>
            <a
              href="https://github.com/raybags-dev/DataForge-ELT"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-theme bg-surface border border-white/15 text-sm hover:border-primary/50 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Source Code
            </a>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Pipeline access request */}
          <div>
            <h2 className="font-heading font-semibold text-lg mb-1">Request Pipeline Access</h2>
            <p className="text-muted text-sm mb-4">
              Want to trigger the ELT pipeline? Submit your details and I&apos;ll send you a
              one-time access token within 24 hours.
            </p>

            {status && (
              <div
                className={`mb-4 p-3 rounded-theme text-sm border ${
                  status.ok
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400"
                }`}
              >
                {status.msg}
              </div>
            )}

            {!status?.ok && (
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-muted uppercase tracking-wide mb-1">
                    Name
                  </label>
                  <input
                    required
                    className={input}
                    placeholder="Your name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted uppercase tracking-wide mb-1">
                    Email
                  </label>
                  <input
                    required
                    type="email"
                    className={input}
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted uppercase tracking-wide mb-1">
                    Reason <span className="normal-case text-muted">(optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    className={`${input} resize-none`}
                    placeholder="What are you looking to do with the pipeline?"
                    value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2 rounded-theme bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {busy ? "Submitting…" : "Request Access Token"}
                </button>
              </form>
            )}

            {status?.ok && (
              <button
                onClick={() => setStatus(null)}
                className="mt-2 text-sm text-primary hover:underline"
              >
                Submit another request
              </button>
            )}
          </div>

          {/* What it does */}
          <div>
            <h2 className="font-heading font-semibold text-lg mb-3">How it works</h2>
            <ol className="space-y-3 text-sm text-muted">
              {[
                { n: "1", t: "Crawl", d: "Playwright spiders scrape Reddit, Steam, IMDB, and news sources into raw Parquet files." },
                { n: "2", t: "Stage", d: "Data lands in a date-partitioned lake (raw → bronze → silver → gold)." },
                { n: "3", t: "Transform", d: "dbt models run on DuckDB: clean, enrich, and aggregate across all sources." },
                { n: "4", t: "Serve", d: "FastAPI exposes query endpoints; a React dashboard visualises pipeline state in real time." },
              ].map((step) => (
                <li key={step.n} className="flex gap-3">
                  <span className="flex-none w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">
                    {step.n}
                  </span>
                  <div>
                    <span className="font-medium text-foreground">{step.t} — </span>
                    {step.d}
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-6 p-4 rounded-theme bg-surface border border-white/10">
              <p className="text-xs text-muted uppercase tracking-wide mb-2">Admin token management</p>
              <p className="text-sm text-muted mb-3">
                Already an admin? Generate and distribute access tokens from the tokens page.
              </p>
              <Link
                href="/admin/tokens"
                className="text-sm text-primary hover:underline"
              >
                Go to token management →
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
