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
  updateCrawlSession,
  generateSessionBlog,
  listCrawlSessions,
  deleteCrawlSession,
  previewCrawlRecords,
  exportCrawlRecordsUrl,
  type CrawlSession,
  type ChartData,
  ApiError,
} from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

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

  const toast = useToast();

  // Form state
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [maxPages, setMaxPages] = useState(5);
  const [analyticsTypes, setAnalyticsTypes] = useState<string[]>([]);
  const [ratingThreshold, setRatingThreshold] = useState(7);
  const [cookieHints, setCookieHints] = useState("");
  const [paginationType, setPaginationType] = useState<"auto" | "scroll" | "click">("auto");
  const [selectorHintsMap, setSelectorHintsMap] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [tokenModal, setTokenModal] = useState<{ sessionId: number } | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenError, setTokenError] = useState("");
  const [tokenSubmitting, setTokenSubmitting] = useState(false);

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
      const cleanHints = Object.fromEntries(
        Object.entries(selectorHintsMap).filter(([, v]) => v.trim())
      );
      const session = await createCrawlSession({
        name: name.trim() || `Crawl – ${new Date().toLocaleString()}`,
        target_url: url.trim(),
        collection_prompt: prompt.trim(),
        analytics_spec: {
          types: analyticsTypes.length ? analyticsTypes : undefined,
          rating_threshold: ratingThreshold,
          cookie_hints: cookieHints.trim() || undefined,
          pagination_type: paginationType,
          selector_hints: Object.keys(cleanHints).length ? cleanHints : undefined,
        },
        max_pages: maxPages,
      });
      setActiveSession(session);
      try {
        await runCrawlSession(session.id);
      } catch (runErr) {
        if (runErr instanceof ApiError && runErr.status === 403 && runErr.message === "rate_limited") {
          setTokenModal({ sessionId: session.id });
          setSubmitting(false);
          return;
        }
        throw runErr;
      }
      setStep("running");
      startPolling(session.id);
      toast.success("Crawl started", "The AI crawler is now running in the background.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start crawl";
      setFormError(msg);
      toast.error("Failed to start crawl", msg);
      setSubmitting(false);
    }
  }

  async function handleTokenSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenModal || !tokenInput.trim()) return;
    setTokenSubmitting(true);
    setTokenError("");
    try {
      await runCrawlSession(tokenModal.sessionId, tokenInput.trim());
      setTokenModal(null);
      setTokenInput("");
      setStep("running");
      startPolling(tokenModal.sessionId);
      toast.success("Crawl started", "The AI crawler is now running in the background.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setTokenError(err.message === "invalid_token" ? "Invalid or expired token. Request a new one from the site owner." : err.message);
      } else {
        setTokenError(err instanceof Error ? err.message : "Failed to start crawl");
      }
    } finally {
      setTokenSubmitting(false);
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
    setAnalyticsTypes([]); setMaxPages(5); setRatingThreshold(7); setCookieHints("");
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

        {step === "configure" && <ConfigureStep {...{ url, setUrl, name, setName, prompt, setPrompt, maxPages, setMaxPages, analyticsTypes, setAnalyticsTypes, ratingThreshold, setRatingThreshold, cookieHints, setCookieHints, paginationType, setPaginationType, selectorHintsMap, setSelectorHintsMap, formError, submitting, handleSubmit }} />}
        {step === "running" && activeSession && <RunningStep session={activeSession} />}
        {step === "results" && activeSession && (
          <ResultsStep
            session={activeSession}
            onRefresh={() => getCrawlSession(activeSession.id).then(setActiveSession)}
            onDelete={reset}
            onRetryWithHints={async (hints) => {
              const { _pagination_type, ...selectorHints } = hints as Record<string, string>;
              const updated = await updateCrawlSession(activeSession.id, {
                analytics_spec: {
                  ...(activeSession.analytics_spec || {}),
                  selector_hints: Object.keys(selectorHints).length ? selectorHints : undefined,
                  pagination_type: (_pagination_type as string) || "auto",
                },
              });
              setActiveSession(updated);
              try {
                await runCrawlSession(activeSession.id);
              } catch (runErr) {
                if (runErr instanceof ApiError && runErr.status === 403 && runErr.message === "rate_limited") {
                  setTokenModal({ sessionId: activeSession.id });
                  return;
                }
                throw runErr;
              }
              setStep("running");
              startPolling(activeSession.id);
              toast.success("Re-crawling with hints", "The crawler will use your CSS selector hints.");
            }}
          />
        )}
      </main>

      {/* Token required modal */}
      {tokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-theme bg-surface border border-white/15 p-6 shadow-2xl">
            <h2 className="font-heading font-bold text-lg mb-2">Access Token Required</h2>
            <p className="text-sm text-muted mb-4">
              This app has already been run from your IP address. To run it again, please enter a
              valid access token. Tokens are provided by the site owner — reach out to request one.
            </p>
            <form onSubmit={handleTokenSubmit} className="space-y-3">
              {tokenError && (
                <div className="rounded bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 text-sm">
                  {tokenError}
                </div>
              )}
              <input
                type="text"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="Paste your access token here"
                className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm placeholder:text-muted/50 focus:outline-none focus:border-primary/60 font-mono"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={tokenSubmitting || !tokenInput.trim()}
                  className="flex-1 rounded-theme bg-primary text-white py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {tokenSubmitting ? "Verifying…" : "Submit Token"}
                </button>
                <button
                  type="button"
                  onClick={() => { setTokenModal(null); setTokenInput(""); setTokenError(""); setStep("configure"); setActiveSession(null); setSubmitting(false); }}
                  className="px-4 rounded-theme border border-white/15 text-sm hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
  cookieHints: string; setCookieHints: (v: string) => void;
  paginationType: "auto" | "scroll" | "click"; setPaginationType: (v: "auto" | "scroll" | "click") => void;
  selectorHintsMap: Record<string, string>; setSelectorHintsMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  formError: string;
  submitting: boolean;
  handleSubmit: (e: React.FormEvent) => void;
}

function ConfigureStep({
  url, setUrl, name, setName, prompt, setPrompt, maxPages, setMaxPages,
  analyticsTypes, setAnalyticsTypes, ratingThreshold, setRatingThreshold,
  cookieHints, setCookieHints, paginationType, setPaginationType,
  selectorHintsMap, setSelectorHintsMap,
  formError, submitting, handleSubmit,
}: ConfigureProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  function toggleType(id: string) {
    setAnalyticsTypes((prev: string[]) => prev.includes(id) ? prev.filter((t: string) => t !== id) : [...prev, id]);
  }

  // Parse prompt fields for the selector hints form
  const promptFields = prompt
    .split(/[,;\n]/)
    .map(s => s.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""))
    .filter(Boolean)
    .slice(0, 8);

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

        {/* Advanced Settings */}
        <div className="rounded-theme border border-white/10 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium hover:bg-white/5 transition-colors"
          >
            <span className="text-muted">Advanced Settings</span>
            <span className="text-muted text-xs">{showAdvanced ? "▲ hide" : "▼ show"}</span>
          </button>

          {showAdvanced && (
            <div className="px-5 pb-5 space-y-5 border-t border-white/10 pt-4">

              {/* Pagination mode */}
              <div>
                <label className="block text-sm font-medium mb-2">Pagination mode</label>
                <div className="flex gap-2 flex-wrap">
                  {(["auto", "scroll", "click"] as const).map(opt => (
                    <label key={opt} className={`flex items-center gap-2 px-3 py-2 rounded-theme border cursor-pointer text-sm transition-colors ${
                      paginationType === opt
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-white/10 hover:bg-white/5"
                    }`}>
                      <input
                        type="radio"
                        name="pagination"
                        value={opt}
                        checked={paginationType === opt}
                        onChange={() => setPaginationType(opt)}
                        className="hidden"
                      />
                      {opt === "auto" && "Auto (try both)"}
                      {opt === "scroll" && "Infinite scroll"}
                      {opt === "click" && "Next button / link"}
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  Use <strong>Infinite scroll</strong> for sites like Booking.com that load more
                  results as you scroll down. Use <strong>Next button</strong> for sites with
                  explicit page navigation.
                </p>
              </div>

              {/* Cookie hint */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Cookie banner hint <span className="text-muted">(optional)</span>
                </label>
                <input
                  value={cookieHints}
                  onChange={e => setCookieHints(e.target.value)}
                  placeholder={`e.g. "Akkoord", "Alle cookies accepteren", or a CSS selector`}
                  className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm placeholder:text-muted/50 focus:outline-none focus:border-primary/60"
                />
                <p className="mt-1 text-xs text-muted">
                  If the site shows a non-English cookie popup the AI cannot dismiss automatically.
                </p>
              </div>

              {/* Per-field selector hints */}
              {promptFields.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    CSS selector hints per field <span className="text-muted">(optional)</span>
                  </label>
                  <p className="text-xs text-muted mb-3">
                    If the AI struggles to find a specific field, paste the CSS selector here
                    (e.g. <code className="font-mono bg-white/10 px-1 rounded">[data-testid=&apos;price&apos;]</code>).
                    Right-click any element in browser DevTools → Copy → Copy selector.
                  </p>
                  <div className="space-y-2">
                    {promptFields.map(field => (
                      <div key={field} className="flex items-center gap-2">
                        <span className="text-xs font-mono text-primary w-36 flex-shrink-0">{field}</span>
                        <input
                          value={selectorHintsMap[field] || ""}
                          onChange={e => setSelectorHintsMap(m => ({ ...m, [field]: e.target.value }))}
                          placeholder={`CSS selector for "${field.replace(/_/g, " ")}"`}
                          className="flex-1 rounded bg-bg border border-white/15 px-2 py-1.5 text-xs placeholder:text-muted/40 focus:outline-none focus:border-primary/60"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

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

function ResultsStep({
  session,
  onRefresh,
  onDelete,
  onRetryWithHints,
}: {
  session: CrawlSession;
  onRefresh: () => void;
  onDelete: () => void;
  onRetryWithHints: (hints: Record<string, string>) => void;
}) {
  const toast = useToast();
  const [blogStatus, setBlogStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [blogResult, setBlogResult] = useState<{ title: string; slug: string } | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Extraction hints modal (shown when 0 records)
  const [hints, setHints] = useState<Record<string, string>>({});
  const [hintPagination, setHintPagination] = useState<"auto" | "scroll" | "click">("auto");
  const [showHintsModal, setShowHintsModal] = useState(false);

  const analytics = session.analytics_result;
  const progress = session.progress || {};
  const recordCount = analytics?.total_records ?? progress.records_collected ?? 0;
  const zeroRecords = session.status === "done" && recordCount === 0;

  async function handleGenerateBlog() {
    setBlogStatus("generating");
    toast.info("Generating blog post…", "Groq AI is writing an article based on your crawl data.");
    try {
      const result = await generateSessionBlog(session.id);
      setBlogResult({ title: result.title, slug: result.slug });
      setBlogStatus("done");
      toast.success("Blog post created!", `"${result.title}" saved as a draft.`);
    } catch (err) {
      setBlogStatus("error");
      toast.error("Blog generation failed", err instanceof Error ? err.message : "Unknown error");
    }
  }

  async function handlePreview() {
    if (preview) { setShowPreview(v => !v); return; }
    setLoadingPreview(true);
    try {
      const data = await previewCrawlRecords(session.id);
      setPreview(data);
      setShowPreview(true);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this session and all collected records? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteCrawlSession(session.id);
      toast.success("Session deleted");
      onDelete();
    } catch {
      toast.error("Delete failed");
      setDeleting(false);
    }
  }

  // Build hints form rows from the collection_prompt keywords
  const promptFields = session.collection_prompt
    .split(/[,;\n]/)
    .map(s => s.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""))
    .filter(Boolean)
    .slice(0, 8);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 text-green-400 mb-2">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="font-medium text-sm">Crawl Complete</span>
          </div>
          <h2 className="font-heading font-bold text-2xl">{session.name}</h2>
          <p className="text-muted text-sm break-all">{session.target_url}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={onRefresh} className="text-sm rounded-theme border border-white/15 px-3 py-1.5 hover:bg-white/5">Refresh</button>
          <button
            onClick={handlePreview}
            disabled={loadingPreview || recordCount === 0}
            className="text-sm rounded-theme border border-white/15 px-3 py-1.5 hover:bg-white/5 disabled:opacity-40"
          >
            {loadingPreview ? "Loading…" : showPreview ? "Hide JSON" : "View JSON"}
          </button>
          <a
            href={exportCrawlRecordsUrl(session.id)}
            download
            className={`text-sm rounded-theme border border-white/15 px-3 py-1.5 hover:bg-white/5 ${recordCount === 0 ? "opacity-40 pointer-events-none" : ""}`}
          >
            Download JSON
          </a>
          <a
            href={`/hotel-reviews/analytics/${session.id}`}
            className={`text-sm rounded-theme bg-primary/20 text-primary border border-primary/30 px-3 py-1.5 hover:bg-primary/30 ${recordCount === 0 ? "opacity-40 pointer-events-none" : ""}`}
          >
            Full Analytics →
          </a>
          {blogStatus === "idle" && recordCount > 0 && (
            <button onClick={handleGenerateBlog} className="text-sm rounded-theme bg-primary text-white px-3 py-1.5 hover:bg-primary/90">
              Generate Blog
            </button>
          )}
          {blogStatus === "generating" && <span className="text-sm text-muted px-3 py-1.5">Generating…</span>}
          {blogStatus === "done" && blogResult && (
            <a href={`/blog/${blogResult.slug}`} className="text-sm rounded-theme bg-green-600 text-white px-3 py-1.5 hover:bg-green-500">View Post</a>
          )}
          {blogStatus === "error" && (
            <button onClick={handleGenerateBlog} className="text-sm text-red-400 border border-red-500/30 rounded-theme px-3 py-1.5 hover:bg-red-500/10">
              Retry Blog
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-sm rounded-theme border border-red-500/30 text-red-400 px-3 py-1.5 hover:bg-red-500/10 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Records", value: recordCount },
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

      {/* JSON preview drawer */}
      {showPreview && preview && (
        <div className="rounded-theme bg-surface border border-white/10 overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              JSON Preview — {preview.length} record{preview.length !== 1 ? "s" : ""}
            </span>
            <button onClick={() => setShowPreview(false)} className="text-muted text-xs hover:text-white">close ✕</button>
          </div>
          <div className="h-72 overflow-auto p-4">
            <pre className="text-xs font-mono text-muted/80 whitespace-pre-wrap">{JSON.stringify(preview, null, 2)}</pre>
          </div>
        </div>
      )}

      {/* Zero records banner */}
      {zeroRecords && (
        <div className="rounded-theme bg-yellow-500/10 border border-yellow-500/30 p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-300 mb-1">No records collected</h3>
            <p className="text-sm text-muted">
              The AI couldn&apos;t locate data automatically. You can help by specifying
              CSS selectors or pagination type so it knows exactly where to look.
            </p>
          </div>
          <button
            onClick={() => setShowHintsModal(true)}
            className="flex-shrink-0 rounded-theme bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 px-4 py-2 text-sm font-medium hover:bg-yellow-500/30 transition-colors"
          >
            Help the crawler →
          </button>
        </div>
      )}

      {/* Extraction hints modal */}
      {showHintsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-theme bg-surface border border-white/15 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="font-heading font-bold text-lg mb-1">Help the Crawler Find Your Data</h2>
            <p className="text-sm text-muted mb-5">
              The AI will re-run with your hints. You can paste CSS selectors (right-click an
              element in DevTools → Copy → Copy selector) or describe the location in plain text.
            </p>

            {/* Pagination type */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Pagination mode</label>
              <div className="flex gap-2 flex-wrap">
                {(["auto", "scroll", "click"] as const).map(opt => (
                  <label key={opt} className={`flex items-center gap-2 px-3 py-1.5 rounded-theme border cursor-pointer text-sm transition-colors ${
                    hintPagination === opt
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-white/10 hover:bg-white/5"
                  }`}>
                    <input type="radio" name="hint-pagination" value={opt} checked={hintPagination === opt}
                      onChange={() => setHintPagination(opt)} className="hidden" />
                    {opt === "auto" && "Auto"}
                    {opt === "scroll" && "Infinite scroll"}
                    {opt === "click" && "Next button"}
                  </label>
                ))}
              </div>
            </div>

            {/* Per-field selectors */}
            <div className="mb-5 space-y-2">
              <label className="block text-sm font-medium mb-1">Selector hints per field</label>
              {promptFields.map(field => (
                <div key={field} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-primary w-32 flex-shrink-0">{field}</span>
                  <input
                    value={hints[field] || ""}
                    onChange={e => setHints(h => ({ ...h, [field]: e.target.value }))}
                    placeholder={`selector or description for "${field.replace(/_/g, " ")}"`}
                    className="flex-1 rounded bg-bg border border-white/15 px-2 py-1.5 text-xs placeholder:text-muted/40 focus:outline-none focus:border-primary/60"
                  />
                </div>
              ))}
              {promptFields.length === 0 && (
                <p className="text-xs text-muted">Add your collection prompt first to see field hints.</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowHintsModal(false);
                  onRetryWithHints({ ...hints, _pagination_type: hintPagination });
                }}
                className="flex-1 rounded-theme bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Re-run with hints →
              </button>
              <button
                onClick={() => setShowHintsModal(false)}
                className="px-4 rounded-theme border border-white/15 text-sm hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Analytics error */}
      {analytics?.error && !zeroRecords && (
        <div className="rounded-theme bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 text-sm mb-6">
          {analytics.error}
        </div>
      )}

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

      {/* Inline charts (first 2) — full set on analytics page */}
      {(analytics?.charts || []).slice(0, 2).map(chart => (
        <ChartPanel key={chart.id} chart={chart} />
      ))}
      {(analytics?.charts?.length ?? 0) > 2 && (
        <div className="text-center py-4">
          <a href={`/hotel-reviews/analytics/${session.id}`} className="text-primary text-sm hover:underline">
            View all {analytics!.charts!.length} charts on the Analytics page →
          </a>
        </div>
      )}

      {(!analytics?.charts || analytics.charts.length === 0) && !analytics?.error && !zeroRecords && (
        <div className="rounded-theme bg-surface border border-white/10 p-8 text-center text-muted">
          <p className="text-lg mb-2">No charts generated</p>
          <p className="text-sm">The data was collected but no numeric fields (price, rating, etc.) were found to chart. Check the JSON preview to see what was captured.</p>
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
