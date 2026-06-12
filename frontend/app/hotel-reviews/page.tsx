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
  searchKaggleHotel,
  importKaggleHotel,
  generateHotelSummary,
  type CrawlSession,
  type ChartData,
  type KaggleDataset,
  type RunContactInfo,
  ApiError,
} from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import RunProjectDisclaimer from "@/components/RunProjectDisclaimer";

const DISCLAIMER_KEY = "run_disclaimer_ack_v1";

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
type InputMode = "crawler" | "kaggle";

export default function HotelReviewsPage() {
  const [step, setStep] = useState<Step>("configure");
  const [inputMode, setInputMode] = useState<InputMode>("crawler");
  const [sessions, setSessions] = useState<CrawlSession[]>([]);
  const [activeSession, setActiveSession] = useState<CrawlSession | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const toast = useToast();

  // Crawler form state
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
  const [showDisclaimer, setShowDisclaimer] = useState(false);

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

  async function handleCrawlerSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) { setFormError("Website URL is required"); return; }
    if (!prompt.trim()) { setFormError("Tell me what to collect"); return; }
    setFormError("");
    if (!sessionStorage.getItem(DISCLAIMER_KEY)) { setShowDisclaimer(true); return; }
    await doCrawlerSubmit();
  }

  async function doCrawlerSubmit(contact?: RunContactInfo) {
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
        session_contact: contact,
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
        setTokenError(err.message === "invalid_token" ? "Invalid or expired token." : err.message);
      } else {
        setTokenError(err instanceof Error ? err.message : "Failed to start crawl");
      }
    } finally {
      setTokenSubmitting(false);
    }
  }

  function resumeSession(s: CrawlSession) {
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
    setInputMode("crawler");
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      {showDisclaimer && (
        <RunProjectDisclaimer
          projectName="Hotel Review Analytics"
          onRun={(contact) => {
            setShowDisclaimer(false);
            sessionStorage.setItem(DISCLAIMER_KEY, "1");
            doCrawlerSubmit(contact);
          }}
          onClose={() => setShowDisclaimer(false)}
        />
      )}

      <header className="border-b border-white/10 bg-surface/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/#platform" className="text-muted hover:text-text text-sm">← Back</a>
            <span className="text-white/20">|</span>
            <h1 className="font-heading font-bold text-lg">Hotel Review Analytics</h1>
            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">AI-Powered</span>
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
        {showHistory && (
          <div className="mb-6 rounded-theme bg-surface border border-white/10 p-4">
            <h2 className="font-semibold mb-3 text-sm">Previous Sessions</h2>
            {sessions.length === 0 ? (
              <p className="text-muted text-sm">No sessions yet.</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <button key={s.id} onClick={() => resumeSession(s)}
                    className="w-full text-left rounded-theme bg-white/5 hover:bg-white/10 px-3 py-2 text-sm transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{s.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        s.status === "done" ? "bg-green-500/20 text-green-400"
                        : s.status === "running" ? "bg-yellow-500/20 text-yellow-400"
                        : s.status === "failed" ? "bg-red-500/20 text-red-400"
                        : "bg-white/10 text-muted"
                      }`}>{s.status}</span>
                    </div>
                    <p className="text-muted truncate text-xs mt-0.5">{s.target_url}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "configure" && (
          <ConfigureStep
            inputMode={inputMode} setInputMode={setInputMode}
            url={url} setUrl={setUrl} name={name} setName={setName}
            prompt={prompt} setPrompt={setPrompt} maxPages={maxPages} setMaxPages={setMaxPages}
            analyticsTypes={analyticsTypes} setAnalyticsTypes={setAnalyticsTypes}
            ratingThreshold={ratingThreshold} setRatingThreshold={setRatingThreshold}
            cookieHints={cookieHints} setCookieHints={setCookieHints}
            paginationType={paginationType} setPaginationType={setPaginationType}
            selectorHintsMap={selectorHintsMap} setSelectorHintsMap={setSelectorHintsMap}
            formError={formError} submitting={submitting}
            handleCrawlerSubmit={handleCrawlerSubmit}
            onKaggleImportStarted={(session) => {
              setActiveSession(session);
              setStep("running");
              startPolling(session.id);
            }}
          />
        )}
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
            onSessionUpdated={setActiveSession}
          />
        )}
      </main>

      {tokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-theme bg-surface border border-white/15 p-6 shadow-2xl">
            <h2 className="font-heading font-bold text-lg mb-2">Access Token Required</h2>
            <p className="text-sm text-muted mb-4">
              This app has already been run from your IP address. To run it again, please enter a valid access token.
            </p>
            <form onSubmit={handleTokenSubmit} className="space-y-3">
              {tokenError && (
                <div className="rounded bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 text-sm">{tokenError}</div>
              )}
              <input type="text" value={tokenInput} onChange={e => setTokenInput(e.target.value)}
                placeholder="Paste your access token here"
                className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/60" autoFocus />
              <div className="flex gap-2">
                <button type="submit" disabled={tokenSubmitting || !tokenInput.trim()}
                  className="flex-1 rounded-theme bg-primary text-white py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {tokenSubmitting ? "Verifying…" : "Submit Token"}
                </button>
                <button type="button" onClick={() => { setTokenModal(null); setTokenInput(""); setTokenError(""); setStep("configure"); setActiveSession(null); setSubmitting(false); }}
                  className="px-4 rounded-theme border border-white/15 text-sm hover:bg-white/5">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Configure Step ────────────────────────────────────────────────────────────

function ConfigureStep({
  inputMode, setInputMode,
  url, setUrl, name, setName, prompt, setPrompt, maxPages, setMaxPages,
  analyticsTypes, setAnalyticsTypes, ratingThreshold, setRatingThreshold,
  cookieHints, setCookieHints, paginationType, setPaginationType,
  selectorHintsMap, setSelectorHintsMap,
  formError, submitting, handleCrawlerSubmit, onKaggleImportStarted,
}: {
  inputMode: InputMode; setInputMode: (m: InputMode) => void;
  url: string; setUrl: (v: string) => void;
  name: string; setName: (v: string) => void;
  prompt: string; setPrompt: (v: string) => void;
  maxPages: number; setMaxPages: (v: number) => void;
  analyticsTypes: string[]; setAnalyticsTypes: React.Dispatch<React.SetStateAction<string[]>>;
  ratingThreshold: number; setRatingThreshold: (v: number) => void;
  cookieHints: string; setCookieHints: (v: string) => void;
  paginationType: "auto" | "scroll" | "click"; setPaginationType: (v: "auto" | "scroll" | "click") => void;
  selectorHintsMap: Record<string, string>; setSelectorHintsMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  formError: string; submitting: boolean;
  handleCrawlerSubmit: (e: React.FormEvent) => void;
  onKaggleImportStarted: (session: CrawlSession) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 text-center">
        <h2 className="font-heading font-bold text-2xl mb-2">Configure Your Analysis</h2>
        <p className="text-muted text-sm">Crawl a live website or import a ready dataset from Kaggle.</p>
      </div>

      {/* Input mode tabs */}
      <div className="flex rounded-theme border border-white/10 overflow-hidden mb-6">
        {(["crawler", "kaggle"] as InputMode[]).map((mode) => (
          <button key={mode} onClick={() => setInputMode(mode)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              inputMode === mode ? "bg-primary text-white" : "hover:bg-white/5 text-muted"
            }`}>
            {mode === "crawler" ? "🔍 Live Crawler" : "📦 Kaggle Dataset"}
          </button>
        ))}
      </div>

      {inputMode === "crawler" ? (
        <CrawlerForm
          url={url} setUrl={setUrl} name={name} setName={setName}
          prompt={prompt} setPrompt={setPrompt} maxPages={maxPages} setMaxPages={setMaxPages}
          analyticsTypes={analyticsTypes} setAnalyticsTypes={setAnalyticsTypes}
          ratingThreshold={ratingThreshold} setRatingThreshold={setRatingThreshold}
          cookieHints={cookieHints} setCookieHints={setCookieHints}
          paginationType={paginationType} setPaginationType={setPaginationType}
          selectorHintsMap={selectorHintsMap} setSelectorHintsMap={setSelectorHintsMap}
          formError={formError} submitting={submitting}
          handleCrawlerSubmit={handleCrawlerSubmit}
          showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced}
        />
      ) : (
        <KaggleSearch
          module="hotel-reviews"
          sessionName={name}
          analyticsSpec={{ types: analyticsTypes, rating_threshold: ratingThreshold }}
          onImportStarted={onKaggleImportStarted}
        />
      )}
    </div>
  );
}

// ── Crawler Form ──────────────────────────────────────────────────────────────

function CrawlerForm({
  url, setUrl, name, setName, prompt, setPrompt, maxPages, setMaxPages,
  analyticsTypes, setAnalyticsTypes, ratingThreshold, setRatingThreshold,
  cookieHints, setCookieHints, paginationType, setPaginationType,
  selectorHintsMap, setSelectorHintsMap,
  formError, submitting, handleCrawlerSubmit, showAdvanced, setShowAdvanced,
}: {
  url: string; setUrl: (v: string) => void;
  name: string; setName: (v: string) => void;
  prompt: string; setPrompt: (v: string) => void;
  maxPages: number; setMaxPages: (v: number) => void;
  analyticsTypes: string[]; setAnalyticsTypes: React.Dispatch<React.SetStateAction<string[]>>;
  ratingThreshold: number; setRatingThreshold: (v: number) => void;
  cookieHints: string; setCookieHints: (v: string) => void;
  paginationType: "auto" | "scroll" | "click"; setPaginationType: (v: "auto" | "scroll" | "click") => void;
  selectorHintsMap: Record<string, string>; setSelectorHintsMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  formError: string; submitting: boolean;
  handleCrawlerSubmit: (e: React.FormEvent) => void;
  showAdvanced: boolean; setShowAdvanced: (v: boolean) => void;
}) {
  const promptFields = prompt.split(/[,;\n]/)
    .map(s => s.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""))
    .filter(Boolean).slice(0, 8);

  return (
    <form onSubmit={handleCrawlerSubmit} className="space-y-6">
      {formError && (
        <div className="rounded-theme bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 text-sm">{formError}</div>
      )}

      <fieldset className="rounded-theme bg-surface border border-white/10 p-5 space-y-4">
        <legend className="px-2 text-xs font-semibold text-primary uppercase tracking-wider">1. Target Website</legend>
        <div>
          <label className="block text-sm font-medium mb-1">Website URL <span className="text-red-400">*</span></label>
          <input type="url" value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://www.booking.com/searchresults.html?dest_id=-1456928"
            className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm placeholder:text-muted/50 focus:outline-none focus:border-primary/60" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Session name <span className="text-muted">(optional)</span></label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Booking.com – California Hotels"
            className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm placeholder:text-muted/50 focus:outline-none focus:border-primary/60" />
        </div>
      </fieldset>

      <fieldset className="rounded-theme bg-surface border border-white/10 p-5 space-y-4">
        <legend className="px-2 text-xs font-semibold text-primary uppercase tracking-wider">2. What to Collect</legend>
        <div>
          <label className="block text-sm font-medium mb-1">Describe what you want <span className="text-red-400">*</span></label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
            placeholder={`Examples:\n• "Collect all hotel listings — name, price, rating, location"\n• "Find all reviews with a score above 7 for property XYZ"`}
            className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm placeholder:text-muted/50 focus:outline-none focus:border-primary/60 resize-none" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Pages to crawl</label>
          <div className="flex items-center gap-4">
            <input type="range" min={1} max={20} value={maxPages} onChange={e => setMaxPages(Number(e.target.value))} className="flex-1 accent-primary" />
            <span className="text-sm font-medium w-8 text-right">{maxPages}</span>
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-theme bg-surface border border-white/10 p-5 space-y-4">
        <legend className="px-2 text-xs font-semibold text-primary uppercase tracking-wider">3. Analytics to Run</legend>
        <p className="text-xs text-muted">Leave blank to run all applicable analyses.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {ANALYTICS_OPTIONS.map(opt => (
            <label key={opt.id} className={`flex items-center gap-2 rounded-theme border px-3 py-2 cursor-pointer text-sm transition-colors ${
              analyticsTypes.includes(opt.id) ? "border-primary/60 bg-primary/10 text-primary" : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}>
              <input type="checkbox" checked={analyticsTypes.includes(opt.id)}
                onChange={() => setAnalyticsTypes(prev => prev.includes(opt.id) ? prev.filter(t => t !== opt.id) : [...prev, opt.id])} className="hidden" />
              <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${analyticsTypes.includes(opt.id) ? "bg-primary border-primary" : "border-white/30"}`}>
                {analyticsTypes.includes(opt.id) && <span className="text-white text-xs">✓</span>}
              </span>
              {opt.label}
            </label>
          ))}
        </div>
        {(analyticsTypes.includes("top_rated") || analyticsTypes.length === 0) && (
          <div>
            <label className="block text-sm font-medium mb-1">Rating threshold: <span className="text-primary">{ratingThreshold}</span></label>
            <input type="range" min={1} max={10} step={0.5} value={ratingThreshold} onChange={e => setRatingThreshold(Number(e.target.value))} className="w-full accent-primary" />
          </div>
        )}
      </fieldset>

      <div className="rounded-theme border border-white/10 overflow-hidden">
        <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium hover:bg-white/5 transition-colors">
          <span className="text-muted">Advanced Settings</span>
          <span className="text-muted text-xs">{showAdvanced ? "▲ hide" : "▼ show"}</span>
        </button>
        {showAdvanced && (
          <div className="px-5 pb-5 space-y-5 border-t border-white/10 pt-4">
            <div>
              <label className="block text-sm font-medium mb-2">Pagination mode</label>
              <div className="flex gap-2 flex-wrap">
                {(["auto", "scroll", "click"] as const).map(opt => (
                  <label key={opt} className={`flex items-center gap-2 px-3 py-2 rounded-theme border cursor-pointer text-sm transition-colors ${
                    paginationType === opt ? "border-primary/60 bg-primary/10 text-primary" : "border-white/10 hover:bg-white/5"
                  }`}>
                    <input type="radio" name="pagination" value={opt} checked={paginationType === opt} onChange={() => setPaginationType(opt)} className="hidden" />
                    {opt === "auto" && "Auto (try both)"}{opt === "scroll" && "Infinite scroll"}{opt === "click" && "Next button / link"}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Cookie banner hint <span className="text-muted">(optional)</span></label>
              <input value={cookieHints} onChange={e => setCookieHints(e.target.value)}
                placeholder={`e.g. "Alle cookies accepteren" or a CSS selector`}
                className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm focus:outline-none focus:border-primary/60" />
            </div>
            {promptFields.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-1">CSS selector hints per field <span className="text-muted">(optional)</span></label>
                <div className="space-y-2">
                  {promptFields.map(field => (
                    <div key={field} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-primary w-36 flex-shrink-0">{field}</span>
                      <input value={selectorHintsMap[field] || ""} onChange={e => setSelectorHintsMap(m => ({ ...m, [field]: e.target.value }))}
                        placeholder={`CSS selector for "${field.replace(/_/g, " ")}"`}
                        className="flex-1 rounded bg-bg border border-white/15 px-2 py-1.5 text-xs focus:outline-none focus:border-primary/60" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <button type="submit" disabled={submitting}
        className="w-full rounded-theme bg-primary text-white font-medium py-3 text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
        {submitting ? "Starting crawl…" : "Launch AI Crawler →"}
      </button>
    </form>
  );
}

// ── Kaggle Search ─────────────────────────────────────────────────────────────

function KaggleSearch({
  module, sessionName, analyticsSpec, onImportStarted,
}: {
  module: "hotel-reviews" | "job-analytics";
  sessionName: string;
  analyticsSpec: Record<string, unknown>;
  onImportStarted: (session: CrawlSession) => void;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<KaggleDataset[] | null>(null);
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState<KaggleDataset | null>(null);
  const [importName, setImportName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const toast = useToast();

  async function doSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true); setSearchError(""); setResults(null); setSelected(null);
    try {
      const fn = module === "hotel-reviews" ? searchKaggleHotel : (await import("@/lib/api")).searchKaggleJobs;
      const data = await fn(query.trim());
      setResults(data);
      if (data.length === 0) setSearchError("No datasets found. Try different keywords like 'hotel reviews' or 'booking ratings'.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Search failed";
      if (msg.includes("KAGGLE_USERNAME")) {
        setSearchError("Kaggle credentials not configured on this server. Add KAGGLE_USERNAME and KAGGLE_KEY environment variables.");
      } else {
        setSearchError(msg);
      }
    }
    setSearching(false);
  }

  async function doImport() {
    if (!selected) return;
    setImporting(true); setImportError("");
    try {
      const sessionBody = {
        name: importName.trim() || selected.title,
        target_url: `kaggle://${selected.ref}`,
        collection_prompt: "Dataset imported from Kaggle",
        analytics_spec: analyticsSpec,
        max_pages: 1,
      };
      const createFn = (await import("@/lib/api")).createCrawlSession;
      const session = await createFn(sessionBody);

      const importFn = module === "hotel-reviews" ? importKaggleHotel : (await import("@/lib/api")).importKaggleJobs;
      await importFn(session.id, selected.ref, importName.trim() || undefined);

      toast.success("Import started", `Downloading "${selected.title}" from Kaggle…`);
      onImportStarted(session);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    }
    setImporting(false);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-theme bg-surface border border-white/10 p-4">
        <p className="text-sm text-muted mb-3">
          Search Kaggle&apos;s public dataset library. The engine will download the CSV, parse it into records, and run the full analytics pipeline automatically.
        </p>
        <form onSubmit={doSearch} className="flex gap-2">
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="e.g. hotel reviews, booking ratings, airbnb listings…"
            className="flex-1 rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm focus:outline-none focus:border-primary/60" />
          <button type="submit" disabled={searching || !query.trim()}
            className="px-4 rounded-theme bg-primary text-white text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity">
            {searching ? "…" : "Search"}
          </button>
        </form>
        {searchError && <p className="mt-2 text-sm text-red-400">{searchError}</p>}
      </div>

      {results !== null && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted">{results.length} datasets found — click one to select it.</p>
          {results.map((ds) => (
            <button key={ds.ref} onClick={() => setSelected(selected?.ref === ds.ref ? null : ds)}
              className={`w-full text-left rounded-theme border px-4 py-3 transition-colors ${
                selected?.ref === ds.ref
                  ? "border-primary/60 bg-primary/10"
                  : "border-white/10 bg-surface hover:border-white/30"
              }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{ds.title}</p>
                  {ds.subtitle && <p className="text-xs text-muted mt-0.5 line-clamp-2">{ds.subtitle}</p>}
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {ds.tags.slice(0, 4).map(t => (
                      <span key={t} className="text-xs bg-white/10 px-1.5 py-0.5 rounded">{t}</span>
                    ))}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 text-xs text-muted space-y-0.5">
                  <p>{ds.downloads.toLocaleString()} DL</p>
                  <p>{ds.votes} votes</p>
                  {ds.size > 0 && <p>{(ds.size / 1024 / 1024).toFixed(1)} MB</p>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="rounded-theme border border-primary/40 bg-primary/5 p-4 space-y-3">
          <p className="text-sm font-medium text-primary">Selected: {selected.title}</p>
          <p className="text-xs text-muted font-mono">{selected.ref}</p>
          <div>
            <label className="block text-sm font-medium mb-1">Session name <span className="text-muted">(optional)</span></label>
            <input value={importName} onChange={e => setImportName(e.target.value)}
              placeholder={selected.title}
              className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm focus:outline-none focus:border-primary/60" />
          </div>
          {importError && <p className="text-sm text-red-400">{importError}</p>}
          <button onClick={doImport} disabled={importing}
            className="w-full rounded-theme bg-primary text-white font-medium py-2.5 text-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
            {importing ? "Starting import…" : "Import & Analyse →"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Running Step ─────────────────────────────────────────────────────────────

function RunningStep({ session }: { session: CrawlSession }) {
  const progress = session.progress || {};
  const log = progress.log || [];
  const logRef = useRef<HTMLDivElement>(null);
  const isKaggle = session.target_url?.startsWith("kaggle://");

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log.length]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 text-yellow-400 mb-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <span className="font-medium">{isKaggle ? "Importing Kaggle Dataset…" : "Crawling in Progress"}</span>
        </div>
        <h2 className="font-heading font-bold text-2xl">{session.name}</h2>
        <p className="text-muted text-sm mt-1 break-all">{session.target_url}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {[
          { label: "Records", value: progress.records_collected ?? 0 },
          { label: "Max Pages", value: isKaggle ? "–" : session.max_pages },
          { label: "Status", value: session.status },
        ].map(stat => (
          <div key={stat.label} className="rounded-theme bg-surface border border-white/10 p-3 text-center">
            <div className="text-2xl font-bold text-primary">{stat.value}</div>
            <div className="text-xs text-muted mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {progress.last_message && (
        <div className="rounded-theme bg-surface border border-white/10 p-3 mb-4 text-sm text-muted">
          <span className="text-primary font-medium">→ </span>{progress.last_message}
        </div>
      )}

      <div className="rounded-theme bg-surface border border-white/10 overflow-hidden">
        <div className="px-4 py-2 border-b border-white/10 text-xs font-semibold text-muted uppercase tracking-wider">Live Log</div>
        <div ref={logRef} className="h-64 overflow-auto p-3 space-y-1 font-mono text-xs">
          {log.length === 0 ? <p className="text-muted">Initialising…</p> : log.map((line, i) => (
            <div key={i} className="text-muted/80">
              <span className="text-primary/60 select-none">{String(i + 1).padStart(3, " ")} </span>{line}
            </div>
          ))}
        </div>
      </div>

      {session.status === "failed" && (
        <div className="mt-4 rounded-theme bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 text-sm">
          <strong>Failed:</strong> {session.error || "Unknown error"}
        </div>
      )}
    </div>
  );
}

// ── Results Step ─────────────────────────────────────────────────────────────

function ResultsStep({
  session, onRefresh, onDelete, onRetryWithHints, onSessionUpdated,
}: {
  session: CrawlSession;
  onRefresh: () => void;
  onDelete: () => void;
  onRetryWithHints: (hints: Record<string, string>) => void;
  onSessionUpdated: (s: CrawlSession) => void;
}) {
  const toast = useToast();
  const [blogStatus, setBlogStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [blogResult, setBlogResult] = useState<{ title: string; slug: string } | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [hintPagination, setHintPagination] = useState<"auto" | "scroll" | "click">("auto");
  const [showHintsModal, setShowHintsModal] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const analytics = session.analytics_result;
  const progress = session.progress || {};
  const recordCount = analytics?.total_records ?? progress.records_collected ?? 0;
  const zeroRecords = session.status === "done" && recordCount === 0;
  const isKaggle = session.target_url?.startsWith("kaggle://");

  const promptFields = session.collection_prompt
    .split(/[,;\n]/)
    .map(s => s.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""))
    .filter(Boolean).slice(0, 8);

  async function handleGenerateBlog() {
    setBlogStatus("generating");
    toast.info("Generating blog post…", "Groq AI is writing an article based on your data.");
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
    try { const data = await previewCrawlRecords(session.id); setPreview(data); setShowPreview(true); }
    finally { setLoadingPreview(false); }
  }

  async function handleDelete() {
    if (!confirm("Delete this session and all collected records? This cannot be undone.")) return;
    setDeleting(true);
    try { await deleteCrawlSession(session.id); toast.success("Session deleted"); onDelete(); }
    catch { toast.error("Delete failed"); setDeleting(false); }
  }

  async function handleGenerateSummary() {
    setSummaryLoading(true);
    try {
      const res = await generateHotelSummary(session.id);
      onSessionUpdated({ ...session, analytics_result: { ...(session.analytics_result || {}), summary: res.summary } });
      setSummaryOpen(true);
      toast.success("Summary ready", "AI has analysed your data and generated insights.");
    } catch (err) {
      toast.error("Summary failed", err instanceof Error ? err.message : "Unknown error");
    }
    setSummaryLoading(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 text-green-400 mb-2">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="font-medium text-sm">{isKaggle ? "Kaggle Import Complete" : "Crawl Complete"}</span>
          </div>
          <h2 className="font-heading font-bold text-2xl">{session.name}</h2>
          <p className="text-muted text-sm break-all">{session.target_url}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={onRefresh} className="text-sm rounded-theme border border-white/15 px-3 py-1.5 hover:bg-white/5">Refresh</button>
          <button onClick={handlePreview} disabled={loadingPreview || recordCount === 0}
            className="text-sm rounded-theme border border-white/15 px-3 py-1.5 hover:bg-white/5 disabled:opacity-40">
            {loadingPreview ? "Loading…" : showPreview ? "Hide JSON" : "View JSON"}
          </button>
          <a href={exportCrawlRecordsUrl(session.id)} download
            className={`text-sm rounded-theme border border-white/15 px-3 py-1.5 hover:bg-white/5 ${recordCount === 0 ? "opacity-40 pointer-events-none" : ""}`}>
            Download JSON
          </a>
          {!isKaggle && (
            <a href={`/hotel-reviews/analytics/${session.id}`}
              className={`text-sm rounded-theme bg-primary/20 text-primary border border-primary/30 px-3 py-1.5 hover:bg-primary/30 ${recordCount === 0 ? "opacity-40 pointer-events-none" : ""}`}>
              Full Analytics →
            </a>
          )}
          {blogStatus === "idle" && recordCount > 0 && (
            <button onClick={handleGenerateBlog} className="text-sm rounded-theme bg-primary text-white px-3 py-1.5 hover:bg-primary/90">Generate Blog</button>
          )}
          {blogStatus === "generating" && <span className="text-sm text-muted px-3 py-1.5">Generating…</span>}
          {blogStatus === "done" && blogResult && (
            <a href={`/blog/${blogResult.slug}`} className="text-sm rounded-theme bg-green-600 text-white px-3 py-1.5 hover:bg-green-500">View Post</a>
          )}
          <button onClick={handleDelete} disabled={deleting}
            className="text-sm rounded-theme border border-red-500/30 text-red-400 px-3 py-1.5 hover:bg-red-500/10 disabled:opacity-50">
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Records", value: recordCount },
          { label: "Charts", value: analytics?.charts?.length ?? 0 },
          { label: "Fields Found", value: analytics?.fields_found?.length ?? 0 },
          { label: isKaggle ? "Dataset" : "Pages Crawled", value: isKaggle ? "Kaggle" : session.max_pages },
        ].map(s => (
          <div key={s.label} className="rounded-theme bg-surface border border-white/10 p-4 text-center">
            <div className="text-3xl font-bold text-primary">{s.value}</div>
            <div className="text-xs text-muted mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {showPreview && preview && (
        <div className="rounded-theme bg-surface border border-white/10 overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">JSON Preview — {preview.length} records</span>
            <button onClick={() => setShowPreview(false)} className="text-muted text-xs hover:text-white">close ✕</button>
          </div>
          <div className="h-72 overflow-auto p-4">
            <pre className="text-xs font-mono text-muted/80 whitespace-pre-wrap">{JSON.stringify(preview, null, 2)}</pre>
          </div>
        </div>
      )}

      {zeroRecords && !isKaggle && (
        <div className="rounded-theme bg-yellow-500/10 border border-yellow-500/30 p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-300 mb-1">No records collected</h3>
            <p className="text-sm text-muted">The AI couldn&apos;t locate data automatically. Provide CSS selectors to help.</p>
          </div>
          <button onClick={() => setShowHintsModal(true)}
            className="flex-shrink-0 rounded-theme bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 px-4 py-2 text-sm font-medium hover:bg-yellow-500/30 transition-colors">
            Help the crawler →
          </button>
        </div>
      )}

      {showHintsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-theme bg-surface border border-white/15 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="font-heading font-bold text-lg mb-1">Help the Crawler Find Your Data</h2>
            <p className="text-sm text-muted mb-5">Paste CSS selectors (right-click in DevTools → Copy selector) to guide the AI.</p>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Pagination mode</label>
              <div className="flex gap-2 flex-wrap">
                {(["auto", "scroll", "click"] as const).map(opt => (
                  <label key={opt} className={`flex items-center gap-2 px-3 py-1.5 rounded-theme border cursor-pointer text-sm transition-colors ${
                    hintPagination === opt ? "border-primary/60 bg-primary/10 text-primary" : "border-white/10 hover:bg-white/5"
                  }`}>
                    <input type="radio" name="hint-pagination" value={opt} checked={hintPagination === opt} onChange={() => setHintPagination(opt)} className="hidden" />
                    {opt === "auto" && "Auto"}{opt === "scroll" && "Infinite scroll"}{opt === "click" && "Next button"}
                  </label>
                ))}
              </div>
            </div>
            <div className="mb-5 space-y-2">
              <label className="block text-sm font-medium mb-1">Selector hints per field</label>
              {promptFields.map(field => (
                <div key={field} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-primary w-32 flex-shrink-0">{field}</span>
                  <input value={hints[field] || ""} onChange={e => setHints(h => ({ ...h, [field]: e.target.value }))}
                    placeholder={`selector for "${field.replace(/_/g, " ")}"`}
                    className="flex-1 rounded bg-bg border border-white/15 px-2 py-1.5 text-xs focus:outline-none focus:border-primary/60" />
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowHintsModal(false); onRetryWithHints({ ...hints, _pagination_type: hintPagination }); }}
                className="flex-1 rounded-theme bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors">
                Re-run with hints →
              </button>
              <button onClick={() => setShowHintsModal(false)} className="px-4 rounded-theme border border-white/15 text-sm hover:bg-white/5">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {analytics?.error && !zeroRecords && (
        <div className="rounded-theme bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 text-sm mb-6">{analytics.error}</div>
      )}

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

      {(analytics?.charts || []).slice(0, 2).map(chart => <ChartPanel key={chart.id} chart={chart} />)}
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
          <p className="text-sm">No numeric fields found. Check the JSON preview to see what was captured.</p>
        </div>
      )}

      {/* AI Insights Summary */}
      {recordCount > 0 && (
        <InsightsSummary
          summary={analytics?.summary}
          loading={summaryLoading}
          open={summaryOpen}
          setOpen={setSummaryOpen}
          onGenerate={handleGenerateSummary}
        />
      )}
    </div>
  );
}

// ── Insights Summary Section ──────────────────────────────────────────────────

function InsightsSummary({
  summary, loading, open, setOpen, onGenerate,
}: {
  summary?: string;
  loading: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  onGenerate: () => void;
}) {
  return (
    <div className="mt-6 rounded-theme border border-white/10 overflow-hidden">
      <button
        onClick={() => { if (summary) setOpen(!open); else if (!loading) onGenerate(); }}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">✨</span>
          <div className="text-left">
            <p className="font-semibold text-sm">AI Insights Summary</p>
            <p className="text-xs text-muted mt-0.5">
              {summary
                ? (open ? "Click to collapse" : "Click to read the AI analysis")
                : loading
                ? "Generating narrative summary…"
                : "Let AI explain what the data means in plain language"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {loading && <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
          {!summary && !loading && (
            <span className="text-xs bg-primary text-white px-2 py-1 rounded-full font-medium">Generate</span>
          )}
          {summary && <span className="text-muted text-sm">{open ? "▲" : "▼"}</span>}
        </div>
      </button>

      {open && summary && (
        <div className="border-t border-white/10 px-5 py-5 bg-white/[0.02]">
          <div className="prose prose-invert prose-sm max-w-none">
            {summary.split(/\n\n+/).filter(Boolean).map((para, i) => (
              <p key={i} className="text-sm leading-relaxed text-text/90 mb-4 last:mb-0">{para}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Chart Panel ───────────────────────────────────────────────────────────────

function ChartPanel({ chart }: { chart: ChartData }) {
  if (!chart.data || chart.data.length === 0) return null;
  return (
    <div className="rounded-theme bg-surface border border-white/10 p-5 mb-4">
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
        <Pie data={data} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name"
          label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} (${((percent ?? 0) * 100).toFixed(0)}%)`}
          labelLine={{ stroke: "rgba(255,255,255,0.2)" }}>
          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
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
