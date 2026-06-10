"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from "recharts";
import {
  createCrawlSession,
  getCrawlSession,
  runCrawlSession,
  generateSessionBlog,
  listCrawlSessions,
  type CrawlSession,
  type ChartData,
} from "@/lib/api";

const ANALYTICS_OPTIONS = [
  { id: "price_distribution", label: "Price Distribution" },
  { id: "rating_distribution", label: "Rating Distribution" },
  { id: "top_expensive", label: "Most Expensive (Top 10)" },
  { id: "top_rated", label: "Highly Rated Items" },
  { id: "category_breakdown", label: "Category Breakdown" },
  { id: "temporal_distribution", label: "Reviews Over Time" },
];

const CHART_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe", "#f5f3ff", "#4f46e5"];

type Step = "configure" | "running" | "results";

export default function HotelReviewsPage() {
  const [step, setStep] = useState<Step>("configure");
  const [sessions, setSessions] = useState<CrawlSession[]>([]);
  const [activeSession, setActiveSession] = useState<CrawlSession | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Form state
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [maxPages, setMaxPages] = useState(5);
  const [analyticsTypes, setAnalyticsTypes] = useState<string[]>([]);
  const [ratingThreshold, setRatingThreshold] = useState(7);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPolling = useCallback((sessionId: number) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const s = await getCrawlSession(sessionId);
        setActiveSession(s);
        if (s.status === "done") { setStep("results"); stopPolling(); }
        if (s.status === "failed") { stopPolling(); }
      } catch {}
    }, 2500);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function loadHistory() {
    try { setSessions(await listCrawlSessions()); } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) { setFormError("Website URL is required"); return; }
    if (!prompt.trim()) { setFormError("Tell me what to collect"); return; }
    setFormError("");
    setSubmitting(true);
    try {
      const session = await createCrawlSession({
        name: name.trim() || `Crawl – ${new Date().toLocaleString()}`,
        target_url: url.trim(),
        collection_prompt: prompt.trim(),
        analytics_spec: {
          types: analyticsTypes.length ? analyticsTypes : undefined,
          rating_threshold: ratingThreshold,
        },
        max_pages: maxPages,
      });
      setActiveSession(session);
      setStep("running");
      await runCrawlSession(session.id);
      startPolling(session.id);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to start crawl");
      setSubmitting(false);
    }
  }

  async function resumeSession(s: CrawlSession) {
    setActiveSession(s);
    if (s.status === "done") { setStep("results"); }
    else if (s.status === "running") { setStep("running"); startPolling(s.id); }
    else { setStep("results"); }
    setShowHistory(false);
  }

  function reset() {
    stopPolling();
    setStep("configure");
    setActiveSession(null);
    setUrl(""); setName(""); setPrompt(""); setSubmitting(false); setFormError("");
    setAnalyticsTypes([]); setMaxPages(5); setRatingThreshold(7);
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Header */}
      <header className="border-b border-white/10 bg-surface/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/#platform" className="text-muted hover:text-text text-sm">← Back</a>
            <span className="text-white/20">|</span>
            <h1 className="font-heading font-bold text-lg">Hotel Review Analytics</h1>
            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
              AI-Powered Crawler
            </span>
          </div>
          <div className="flex gap-2">
            {step !== "configure" && (
              <button onClick={reset} className="text-sm text-muted hover:text-text px-3 py-1.5 rounded-theme border border-white/10">
                New Crawl
              </button>
            )}
            <button
              onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}
              className="text-sm text-muted hover:text-text px-3 py-1.5 rounded-theme border border-white/10"
            >
              History
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Session history panel */}
        {showHistory && (
          <div className="mb-6 rounded-theme bg-surface border border-white/10 p-4">
            <h2 className="font-semibold mb-3 text-sm">Previous Sessions</h2>
            {sessions.length === 0 ? (
              <p className="text-muted text-sm">No sessions yet.</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => resumeSession(s)}
                    className="w-full text-left rounded-theme bg-white/5 hover:bg-white/10 px-3 py-2 text-sm transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{s.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        s.status === "done" ? "bg-green-500/20 text-green-400"
                        : s.status === "running" ? "bg-yellow-500/20 text-yellow-400"
                        : s.status === "failed" ? "bg-red-500/20 text-red-400"
                        : "bg-white/10 text-muted"
                      }`}>{s.status}</span>
                    </div>
                    <p className="text-muted truncate">{s.target_url}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "configure" && <ConfigureStep {...{ url, setUrl, name, setName, prompt, setPrompt, maxPages, setMaxPages, analyticsTypes, setAnalyticsTypes, ratingThreshold, setRatingThreshold, formError, submitting, handleSubmit }} />}
        {step === "running" && activeSession && <RunningStep session={activeSession} />}
        {step === "results" && activeSession && <ResultsStep session={activeSession} onRefresh={() => getCrawlSession(activeSession.id).then(setActiveSession)} />}
      </main>
    </div>
  );
}

// ── Configure Step ────────────────────────────────────────────────────────────

interface ConfigureProps {
  url: string; setUrl: (v: string) => void;
  name: string; setName: (v: string) => void;
  prompt: string; setPrompt: (v: string) => void;
  maxPages: number; setMaxPages: (v: number) => void;
  analyticsTypes: string[]; setAnalyticsTypes: React.Dispatch<React.SetStateAction<string[]>>;
  ratingThreshold: number; setRatingThreshold: (v: number) => void;
  formError: string;
  submitting: boolean;
  handleSubmit: (e: React.FormEvent) => void;
}

function ConfigureStep({ url, setUrl, name, setName, prompt, setPrompt, maxPages, setMaxPages, analyticsTypes, setAnalyticsTypes, ratingThreshold, setRatingThreshold, formError, submitting, handleSubmit }: ConfigureProps) {
  function toggleType(id: string) {
    setAnalyticsTypes((prev: string[]) => prev.includes(id) ? prev.filter((t: string) => t !== id) : [...prev, id]);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 text-center">
        <h2 className="font-heading font-bold text-2xl mb-2">Configure Your Crawl</h2>
        <p className="text-muted">
          Provide a URL, describe what you want to collect, and choose your analytics. The AI will navigate the site, extract structured data, and generate charts.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {formError && (
          <div className="rounded-theme bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 text-sm">
            {formError}
          </div>
        )}

        {/* Step 1: Target */}
        <fieldset className="rounded-theme bg-surface border border-white/10 p-5 space-y-4">
          <legend className="px-2 text-xs font-semibold text-primary uppercase tracking-wider">
            1. Target Website
          </legend>
          <div>
            <label className="block text-sm font-medium mb-1">Website URL <span className="text-red-400">*</span></label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://www.booking.com/searchresults.html?dest_id=-1456928"
              className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm placeholder:text-muted/50 focus:outline-none focus:border-primary/60"
              required
            />
            <p className="mt-1 text-xs text-muted">Paste any website URL — search results, property page, review listing, etc.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Session name <span className="text-muted">(optional)</span></label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Booking.com – California Hotels"
              className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm placeholder:text-muted/50 focus:outline-none focus:border-primary/60"
            />
          </div>
        </fieldset>

        {/* Step 2: What to collect */}
        <fieldset className="rounded-theme bg-surface border border-white/10 p-5 space-y-4">
          <legend className="px-2 text-xs font-semibold text-primary uppercase tracking-wider">
            2. What to Collect
          </legend>
          <div>
            <label className="block text-sm font-medium mb-1">Describe what you want <span className="text-red-400">*</span></label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={3}
              placeholder={`Examples:\n• "Collect all hotel listings in California — name, price, rating, location"\n• "Find all reviews with a score above 7 for property XYZ"\n• "Extract every Airbnb listing in Barcelona with nightly price and amenities"`}
              className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm placeholder:text-muted/50 focus:outline-none focus:border-primary/60 resize-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Pages to crawl</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={20}
                value={maxPages}
                onChange={e => setMaxPages(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-sm font-medium w-8 text-right">{maxPages}</span>
            </div>
            <p className="mt-1 text-xs text-muted">More pages = more data but slower. Each page may yield 10–25 records.</p>
          </div>
        </fieldset>

        {/* Step 3: Analytics */}
        <fieldset className="rounded-theme bg-surface border border-white/10 p-5 space-y-4">
          <legend className="px-2 text-xs font-semibold text-primary uppercase tracking-wider">
            3. Analytics to Run
          </legend>
          <p className="text-xs text-muted">Select the analyses you want (leave blank to run all applicable).</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {ANALYTICS_OPTIONS.map(opt => (
              <label key={opt.id} className={`flex items-center gap-2 rounded-theme border px-3 py-2 cursor-pointer text-sm transition-colors ${
                analyticsTypes.includes(opt.id)
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}>
                <input
                  type="checkbox"
                  checked={analyticsTypes.includes(opt.id)}
                  onChange={() => toggleType(opt.id)}
                  className="hidden"
                />
                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                  analyticsTypes.includes(opt.id) ? "bg-primary border-primary" : "border-white/30"
                }`}>
                  {analyticsTypes.includes(opt.id) && <span className="text-white text-xs">✓</span>}
                </span>
                {opt.label}
              </label>
            ))}
          </div>
          {(analyticsTypes.includes("top_rated") || analyticsTypes.length === 0) && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Rating threshold for "Highly Rated" filter: <span className="text-primary">{ratingThreshold}</span>
              </label>
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={ratingThreshold}
                onChange={e => setRatingThreshold(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          )}
        </fieldset>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-theme bg-primary text-white font-medium py-3 text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Starting crawl…" : "Launch AI Crawler →"}
        </button>
      </form>
    </div>
  );
}

// ── Running Step ─────────────────────────────────────────────────────────────

function RunningStep({ session }: { session: CrawlSession }) {
  const progress = session.progress || {};
  const log = progress.log || [];
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log.length]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 text-yellow-400 mb-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <span className="font-medium">Crawling in Progress</span>
        </div>
        <h2 className="font-heading font-bold text-2xl">{session.name}</h2>
        <p className="text-muted text-sm mt-1 break-all">{session.target_url}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {[
          { label: "Records Collected", value: progress.records_collected ?? 0 },
          { label: "Max Pages", value: session.max_pages },
          { label: "Status", value: session.status },
        ].map(stat => (
          <div key={stat.label} className="rounded-theme bg-surface border border-white/10 p-3 text-center">
            <div className="text-2xl font-bold text-primary">{stat.value}</div>
            <div className="text-xs text-muted mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Current activity */}
      {progress.last_message && (
        <div className="rounded-theme bg-surface border border-white/10 p-3 mb-4 text-sm text-muted">
          <span className="text-primary font-medium">→ </span>{progress.last_message}
        </div>
      )}

      {/* Log */}
      <div className="rounded-theme bg-surface border border-white/10 overflow-hidden">
        <div className="px-4 py-2 border-b border-white/10 text-xs font-semibold text-muted uppercase tracking-wider">
          Live Log
        </div>
        <div ref={logRef} className="h-64 overflow-auto p-3 space-y-1 font-mono text-xs">
          {log.length === 0 ? (
            <p className="text-muted">Initialising…</p>
          ) : (
            log.map((line, i) => (
              <div key={i} className="text-muted/80">
                <span className="text-primary/60 select-none">{String(i + 1).padStart(3, " ")} </span>
                {line}
              </div>
            ))
          )}
        </div>
      </div>

      {session.status === "failed" && (
        <div className="mt-4 rounded-theme bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 text-sm">
          <strong>Crawl failed:</strong> {session.error || "Unknown error"}
        </div>
      )}
    </div>
  );
}

// ── Results Step ─────────────────────────────────────────────────────────────

function ResultsStep({ session, onRefresh }: { session: CrawlSession; onRefresh: () => void }) {
  const [blogStatus, setBlogStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [blogResult, setBlogResult] = useState<{ title: string; slug: string } | null>(null);
  const analytics = session.analytics_result;
  const progress = session.progress || {};

  async function handleGenerateBlog() {
    setBlogStatus("generating");
    try {
      const result = await generateSessionBlog(session.id);
      setBlogResult({ title: result.title, slug: result.slug });
      setBlogStatus("done");
    } catch {
      setBlogStatus("error");
    }
  }

  return (
    <div>
      {/* Summary header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 text-green-400 mb-2">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="font-medium text-sm">Crawl Complete</span>
          </div>
          <h2 className="font-heading font-bold text-2xl">{session.name}</h2>
          <p className="text-muted text-sm break-all">{session.target_url}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={onRefresh} className="text-sm rounded-theme border border-white/15 px-3 py-1.5 hover:bg-white/5">
            Refresh
          </button>
          {blogStatus === "idle" && (
            <button
              onClick={handleGenerateBlog}
              className="text-sm rounded-theme bg-primary text-white px-3 py-1.5 hover:bg-primary/90"
            >
              Generate Blog Post
            </button>
          )}
          {blogStatus === "generating" && (
            <span className="text-sm text-muted px-3 py-1.5">Generating…</span>
          )}
          {blogStatus === "done" && blogResult && (
            <a
              href={`/blog/${blogResult.slug}`}
              className="text-sm rounded-theme bg-green-600 text-white px-3 py-1.5 hover:bg-green-500"
            >
              View Blog Post
            </a>
          )}
          {blogStatus === "error" && (
            <span className="text-sm text-red-400 px-3 py-1.5">Blog generation failed</span>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Records", value: analytics?.total_records ?? progress.records_collected ?? 0 },
          { label: "Charts", value: analytics?.charts?.length ?? 0 },
          { label: "Fields Found", value: analytics?.fields_found?.length ?? 0 },
          { label: "Pages Crawled", value: session.max_pages },
        ].map(s => (
          <div key={s.label} className="rounded-theme bg-surface border border-white/10 p-4 text-center">
            <div className="text-3xl font-bold text-primary">{s.value}</div>
            <div className="text-xs text-muted mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Summary stats */}
      {analytics?.summary_stats && Object.keys(analytics.summary_stats).length > 0 && (
        <div className="rounded-theme bg-surface border border-white/10 p-5 mb-6">
          <h3 className="font-semibold mb-3">Summary Statistics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted text-xs border-b border-white/10">
                  <th className="pb-2 font-medium">Field</th>
                  <th className="pb-2 font-medium text-right">Min</th>
                  <th className="pb-2 font-medium text-right">Avg</th>
                  <th className="pb-2 font-medium text-right">Max</th>
                  <th className="pb-2 font-medium text-right">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {Object.entries(analytics.summary_stats).map(([field, stats]) => (
                  <tr key={field}>
                    <td className="py-2 font-mono text-xs text-primary">{field}</td>
                    <td className="py-2 text-right">{stats.min}</td>
                    <td className="py-2 text-right font-medium">{stats.avg}</td>
                    <td className="py-2 text-right">{stats.max}</td>
                    <td className="py-2 text-right text-muted">{stats.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Error state */}
      {analytics?.error && (
        <div className="rounded-theme bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 text-sm mb-6">
          {analytics.error}
        </div>
      )}

      {/* Charts */}
      <div className="space-y-8">
        {(analytics?.charts || []).map(chart => (
          <ChartPanel key={chart.id} chart={chart} />
        ))}
      </div>

      {(!analytics?.charts || analytics.charts.length === 0) && !analytics?.error && (
        <div className="rounded-theme bg-surface border border-white/10 p-8 text-center text-muted">
          <p className="text-lg mb-2">No charts generated</p>
          <p className="text-sm">The crawler may not have found enough numeric data. Try a different URL or collection prompt.</p>
        </div>
      )}
    </div>
  );
}

// ── Chart Panel ───────────────────────────────────────────────────────────────

function ChartPanel({ chart }: { chart: ChartData }) {
  if (!chart.data || chart.data.length === 0) return null;

  return (
    <div className="rounded-theme bg-surface border border-white/10 p-5">
      <h3 className="font-semibold mb-4">{chart.title}</h3>
      {chart.type === "bar" && <BarChartView data={chart.data} />}
      {chart.type === "pie" && <PieChartView data={chart.data} />}
      {chart.type === "line" && <LineChartView data={chart.data} />}
    </div>
  );
}

function BarChartView({ data }: { data: Record<string, unknown>[] }) {
  const numKeys = Object.keys(data[0] || {}).filter(k => typeof data[0][k] === "number");
  const labelKey = Object.keys(data[0] || {}).find(k => typeof data[0][k] === "string") || "name";
  const valueKey = numKeys[0] || "count";

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey={labelKey} tick={{ fill: "#9ca3af", fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
        <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
        <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} labelStyle={{ color: "#e5e7eb" }} itemStyle={{ color: "#a78bfa" }} />
        <Bar dataKey={valueKey} fill="#6366f1" radius={[3, 3, 0, 0]} />
        {numKeys[1] && <Bar dataKey={numKeys[1]} fill="#8b5cf6" radius={[3, 3, 0, 0]} />}
      </BarChart>
    </ResponsiveContainer>
  );
}

function PieChartView({ data }: { data: Record<string, unknown>[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} (${((percent ?? 0) * 100).toFixed(0)}%)`} labelLine={{ stroke: "rgba(255,255,255,0.2)" }}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Legend formatter={(value: string) => <span style={{ color: "#9ca3af", fontSize: 12 }}>{value}</span>} />
        <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function LineChartView({ data }: { data: Record<string, unknown>[] }) {
  const labelKey = Object.keys(data[0] || {}).find(k => typeof data[0][k] === "string") || "period";
  const valueKey = Object.keys(data[0] || {}).find(k => typeof data[0][k] === "number") || "count";

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey={labelKey} tick={{ fill: "#9ca3af", fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
        <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
        <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
        <Line type="monotone" dataKey={valueKey} stroke="#6366f1" strokeWidth={2} dot={{ fill: "#6366f1", r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
