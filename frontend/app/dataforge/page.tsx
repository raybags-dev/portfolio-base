"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBootstrap, submitPipelineRequest } from "@/lib/api";
import ThemeProvider from "@/components/ThemeProvider";
import Navbar from "@/components/Navbar";

const TECH = [
  { label: "Python 3.13", emoji: "🐍" },
  { label: "FastAPI", emoji: "⚡" },
  { label: "DuckDB", emoji: "🦆" },
  { label: "dbt", emoji: "🔧" },
  { label: "React", emoji: "⚛️" },
  { label: "Playwright", emoji: "🕷️" },
  { label: "Docker", emoji: "🐳" },
];

const STEPS = [
  {
    n: "01",
    title: "Crawl",
    body: "Playwright spiders scrape Reddit, Steam, IMDB, and news sources into raw Parquet files partitioned by date.",
  },
  {
    n: "02",
    title: "Stage",
    body: "Data lands in a versioned data lake (raw → bronze → silver → gold) with idempotent re-run support.",
  },
  {
    n: "03",
    title: "Transform",
    body: "dbt models run on DuckDB: clean, enrich, and aggregate across all sources into analysis-ready tables.",
  },
  {
    n: "04",
    title: "Serve",
    body: "FastAPI exposes query endpoints; a React dashboard visualises pipeline state and warehouse contents in real time.",
  },
];

export default function DataForgePage() {
  const { data } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", reason: "" });
  const [reqStatus, setReqStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setReqStatus(null);
    try {
      const res = await submitPipelineRequest({
        name: form.name,
        email: form.email,
        reason: form.reason || undefined,
      });
      setReqStatus({ ok: true, msg: res.detail || "Request received." });
      setForm({ name: "", email: "", reason: "" });
    } catch (err) {
      setReqStatus({ ok: false, msg: err instanceof Error ? err.message : "Failed to submit." });
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

  return (
    <>
      <ThemeProvider theme={data.theme} />
      <Navbar site={site} theme={data.theme} sections={data.sections} />

      <main className="container-x py-16 max-w-5xl">

        {/* ── Hero ── */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-4xl">🔧</span>
            <h1 className="text-4xl sm:text-5xl font-heading font-bold tracking-tight">
              DataForge ELT
            </h1>
          </div>
          <p className="text-muted text-lg max-w-2xl mb-6 leading-relaxed">
            A production-quality data engineering platform — Playwright crawlers, a
            partitioned data lake, DuckDB warehouse, dbt transformations, and a live
            React dashboard. All deployable on a single VPS.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap gap-3 mb-8">
            <a
              href="/dataforge/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-theme bg-primary text-white font-medium hover:opacity-90 transition-opacity"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
              Open Dashboard
            </a>
            <a
              href="https://github.com/raybags-dev/DataForge-ELT"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-theme bg-surface border border-white/15 hover:border-primary/50 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              View Source
            </a>
          </div>

          {/* Tech chips */}
          <div className="flex flex-wrap gap-2">
            {TECH.map((t) => (
              <span
                key={t.label}
                className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-surface border border-white/10 text-muted"
              >
                <span>{t.emoji}</span>
                {t.label}
              </span>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="mb-16">
          <h2 className="font-heading font-semibold text-2xl mb-6">How it works</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {STEPS.map((step) => (
              <div
                key={step.n}
                className="rounded-theme bg-surface border border-white/10 p-5"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-xs text-primary font-bold">{step.n}</span>
                  <h3 className="font-heading font-semibold">{step.title}</h3>
                </div>
                <p className="text-sm text-muted leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pipeline access (secondary, collapsible) ── */}
        <section className="border-t border-white/10 pt-10">
          <div className="max-w-xl">
            <p className="text-muted text-sm mb-4">
              Want to trigger a pipeline run?{" "}
              <strong className="text-foreground">You get one free.</strong>{" "}
              After that, request a token below and I'll send one your way.
            </p>

            {!formOpen ? (
              <button
                onClick={() => setFormOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-theme bg-surface border border-white/15 text-sm hover:border-primary/50 transition-colors"
              >
                Request access token
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
            ) : (
              <div className="rounded-theme bg-surface border border-white/10 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-heading font-semibold text-sm">Request access token</h3>
                  <button
                    onClick={() => { setFormOpen(false); setReqStatus(null); }}
                    className="text-muted hover:text-foreground transition-colors"
                    aria-label="Close"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>

                {reqStatus ? (
                  <div
                    className={`p-3 rounded-theme text-sm border ${
                      reqStatus.ok
                        ? "bg-green-500/10 border-green-500/30 text-green-400"
                        : "bg-red-500/10 border-red-500/30 text-red-400"
                    }`}
                  >
                    {reqStatus.msg}
                  </div>
                ) : (
                  <form onSubmit={onSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs text-muted uppercase tracking-wide mb-1">Name</label>
                      <input
                        required
                        className={input}
                        placeholder="Your name"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted uppercase tracking-wide mb-1">Email</label>
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
                        Reason <span className="normal-case">(optional)</span>
                      </label>
                      <textarea
                        rows={2}
                        className={`${input} resize-none`}
                        placeholder="What are you looking to explore?"
                        value={form.reason}
                        onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full py-2 rounded-theme bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {busy ? "Submitting…" : "Submit request"}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
