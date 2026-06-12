"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  createJobSession,
  getJobSession,
  runJobSession,
  updateJobSession,
  deleteJobSession,
  generateJobBlog,
  listJobSessions,
  previewJobRecords,
  exportJobRecordsUrl,
  type JobSession,
  type AnalyticsResult,
  type ChartData,
  type RunContactInfo,
  ApiError,
} from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import RunProjectDisclaimer from "@/components/RunProjectDisclaimer";

const DISCLAIMER_KEY = "run_disclaimer_ack_v1";

const ANALYTICS_OPTIONS = [
  { id: "skill_demand", label: "Skill Demand" },
  { id: "salary_distribution", label: "Salary Distribution" },
  { id: "remote_breakdown", label: "Work Arrangement" },
  { id: "seniority_breakdown", label: "Seniority Levels" },
  { id: "top_companies", label: "Top Hiring Companies" },
  { id: "top_locations", label: "Top Locations" },
];

const CHART_COLORS = [
  "#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd",
  "#4f46e5", "#7c3aed", "#2563eb", "#0891b2",
];

const DEFAULT_PROMPT =
  "Collect all job listings — title, company, location, salary range, required skills, seniority level, remote/hybrid/on-site, and posted date";

type Step = "configure" | "running" | "results";

export default function JobAnalyticsPage() {
  const [step, setStep] = useState<Step>("configure");
  const [sessions, setSessions] = useState<JobSession[]>([]);
  const [activeSession, setActiveSession] = useState<JobSession | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const toast = useToast();

  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [maxPages, setMaxPages] = useState(5);
  const [analyticsTypes, setAnalyticsTypes] = useState<string[]>([]);
  const [cookieHints, setCookieHints] = useState("");
  const [paginationType, setPaginationType] = useState<"auto" | "scroll" | "click">("auto");
  const [selectorHintsMap, setSelectorHintsMap] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
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
        const s = await getJobSession(sessionId);
        setActiveSession(s);
        if (s.status === "done") { setStep("results"); stopPolling(); }
        if (s.status === "failed") stopPolling();
      } catch {}
    }, 2500);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function loadHistory() {
    try { setSessions(await listJobSessions()); } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) { setFormError("Job board URL is required"); return; }
    if (!prompt.trim()) { setFormError("Collection prompt is required"); return; }
    setFormError("");
    if (!sessionStorage.getItem(DISCLAIMER_KEY)) { setShowDisclaimer(true); return; }
    await doSubmit();
  }

  async function doSubmit(contact?: RunContactInfo) {
    setSubmitting(true);
    try {
      const cleanHints = Object.fromEntries(
        Object.entries(selectorHintsMap).filter(([, v]) => v.trim())
      );
      const session = await createJobSession({
        name: name.trim() || `Jobs – ${new Date().toLocaleString()}`,
        target_url: url.trim(),
        collection_prompt: prompt.trim(),
        analytics_spec: {
          types: analyticsTypes.length ? analyticsTypes : undefined,
          cookie_hints: cookieHints.trim() || undefined,
          pagination_type: paginationType,
          selector_hints: Object.keys(cleanHints).length ? cleanHints : undefined,
        },
        max_pages: maxPages,
        session_contact: contact,
      });
      setActiveSession(session);
      try {
        await runJobSession(session.id);
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
      toast.success("Analysis started", "The AI crawler is running — it will extract job data and compute analytics.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start analysis";
      setFormError(msg);
      toast.error("Failed to start", msg);
      setSubmitting(false);
    }
  }

  async function handleTokenSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenModal || !tokenInput.trim()) return;
    setTokenSubmitting(true);
    setTokenError("");
    try {
      await runJobSession(tokenModal.sessionId, tokenInput.trim());
      setTokenModal(null);
      setTokenInput("");
      setStep("running");
      startPolling(tokenModal.sessionId);
      toast.success("Analysis started", "The AI crawler is now running.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setTokenError(err.message === "invalid_token" ? "Invalid or expired token." : err.message);
      } else {
        setTokenError(err instanceof Error ? err.message : "Failed to start");
      }
    } finally {
      setTokenSubmitting(false);
    }
  }

  function reset() {
    stopPolling();
    setStep("configure");
    setActiveSession(null);
    setUrl(""); setName(""); setPrompt(DEFAULT_PROMPT); setSubmitting(false); setFormError("");
    setAnalyticsTypes([]); setMaxPages(5); setCookieHints("");
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      {showDisclaimer && (
        <RunProjectDisclaimer
          projectName="Job Market Analytics"
          onRun={(contact) => {
            setShowDisclaimer(false);
            sessionStorage.setItem(DISCLAIMER_KEY, "1");
            doSubmit(contact);
          }}
          onClose={() => setShowDisclaimer(false)}
        />
      )}

      <header className="border-b border-white/10 bg-surface/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/#projects" className="text-muted hover:text-text text-sm">← Back</a>
            <span className="text-white/20">|</span>
            <h1 className="font-heading font-bold text-lg">Job Market Analytics</h1>
            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">AI-Powered</span>
          </div>
          <div className="flex gap-2">
            {step !== "configure" && (
              <button onClick={reset} className="text-sm text-muted hover:text-text px-3 py-1.5 rounded-theme border border-white/10">
                New Analysis
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
                  <button
                    key={s.id}
                    onClick={() => {
                      setActiveSession(s);
                      if (s.status === "done") setStep("results");
                      else if (s.status === "running") { setStep("running"); startPolling(s.id); }
                      else setStep("results");
                      setShowHistory(false);
                    }}
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
                    <p className="text-muted truncate text-xs mt-0.5">{s.target_url}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "configure" && (
          <ConfigureStep {...{
            url, setUrl, name, setName, prompt, setPrompt,
            maxPages, setMaxPages, analyticsTypes, setAnalyticsTypes,
            cookieHints, setCookieHints, paginationType, setPaginationType,
            selectorHintsMap, setSelectorHintsMap,
            formError, submitting, handleSubmit,
          }} />
        )}
        {step === "running" && activeSession && <RunningStep session={activeSession} />}
        {step === "results" && activeSession && (
          <ResultsStep
            session={activeSession}
            onRefresh={() => getJobSession(activeSession.id).then(setActiveSession)}
            onDelete={reset}
            onRetryWithHints={async (hints) => {
              const { _pagination_type, ...selectorHints } = hints as Record<string, string>;
              const updated = await updateJobSession(activeSession.id, {
                analytics_spec: {
                  ...(activeSession.analytics_spec || {}),
                  selector_hints: Object.keys(selectorHints).length ? selectorHints : undefined,
                  pagination_type: (_pagination_type as string) || "auto",
                },
              });
              setActiveSession(updated);
              try {
                await runJobSession(activeSession.id);
              } catch (runErr) {
                if (runErr instanceof ApiError && runErr.status === 403 && runErr.message === "rate_limited") {
                  setTokenModal({ sessionId: activeSession.id });
                  return;
                }
                throw runErr;
              }
              setStep("running");
              startPolling(activeSession.id);
              toast.success("Re-crawling with hints", "Using your selector hints.");
            }}
          />
        )}
      </main>

      {tokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-theme bg-surface border border-white/15 p-6 shadow-2xl">
            <h2 className="font-heading font-bold text-lg mb-2">Access Token Required</h2>
            <p className="text-sm text-muted mb-4">
              This app has already been run from your IP. Enter a valid access token to run it again.
            </p>
            <form onSubmit={handleTokenSubmit} className="space-y-3">
              {tokenError && (
                <div className="rounded bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 text-sm">{tokenError}</div>
              )}
              <input
                type="text"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="Paste your access token here"
                className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/60"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={tokenSubmitting || !tokenInput.trim()}
                  className="flex-1 rounded-theme bg-primary text-white py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {tokenSubmitting ? "Verifying…" : "Submit Token"}
                </button>
                <button
                  type="button"
                  onClick={() => { setTokenModal(null); setTokenInput(""); setTokenError(""); setSubmitting(false); }}
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
function ConfigureStep({
  url, setUrl, name, setName, prompt, setPrompt,
  maxPages, setMaxPages, analyticsTypes, setAnalyticsTypes,
  cookieHints, setCookieHints, paginationType, setPaginationType,
  selectorHintsMap, setSelectorHintsMap,
  formError, submitting, handleSubmit,
}: {
  url: string; setUrl: (v: string) => void;
  name: string; setName: (v: string) => void;
  prompt: string; setPrompt: (v: string) => void;
  maxPages: number; setMaxPages: (v: number) => void;
  analyticsTypes: string[]; setAnalyticsTypes: React.Dispatch<React.SetStateAction<string[]>>;
  cookieHints: string; setCookieHints: (v: string) => void;
  paginationType: "auto" | "scroll" | "click"; setPaginationType: (v: "auto" | "scroll" | "click") => void;
  selectorHintsMap: Record<string, string>; setSelectorHintsMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  formError: string; submitting: boolean;
  handleSubmit: (e: React.FormEvent) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 text-center">
        <h2 className="font-heading font-bold text-2xl mb-2">Configure Job Market Scan</h2>
        <p className="text-muted text-sm max-w-lg mx-auto">
          Point the AI crawler at any job board — Indeed, RemoteOK, company careers pages. It
          extracts structured listings, parses skills and salary data, and generates interactive charts.
        </p>
      </div>

      <div className="mb-4 rounded-theme bg-amber-500/10 border border-amber-500/25 px-4 py-3 text-xs text-amber-300 leading-relaxed">
        <strong>Recommended sites:</strong> indeed.com/jobs, remoteok.com, weworkremotely.com, company careers pages.
        Sites requiring login (LinkedIn) may have limited results without authentication.
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {formError && (
          <div className="rounded-theme bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 text-sm">{formError}</div>
        )}

        <fieldset className="rounded-theme bg-surface border border-white/10 p-5 space-y-4">
          <legend className="px-2 text-xs font-semibold text-primary uppercase tracking-wider">
            1. Target Job Board
          </legend>
          <div>
            <label className="block text-sm font-medium mb-1">Job board URL <span className="text-red-400">*</span></label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://remoteok.com/remote-python-jobs"
              className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm placeholder:text-muted/50 focus:outline-none focus:border-primary/60"
              required
            />
            <p className="mt-1 text-xs text-muted">Search results page, category listing, or a company careers page.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Session name <span className="text-muted">(optional)</span></label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Python Engineers – RemoteOK June 2026"
              className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm placeholder:text-muted/50 focus:outline-none focus:border-primary/60"
            />
          </div>
        </fieldset>

        <fieldset className="rounded-theme bg-surface border border-white/10 p-5 space-y-4">
          <legend className="px-2 text-xs font-semibold text-primary uppercase tracking-wider">
            2. What to Extract
          </legend>
          <div>
            <label className="block text-sm font-medium mb-1">Collection prompt <span className="text-red-400">*</span></label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm placeholder:text-muted/50 focus:outline-none focus:border-primary/60 resize-none"
              required
            />
            <p className="mt-1 text-xs text-muted">
              The AI uses this to plan selectors. Include every field you need. The default covers all key job data.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Pages to crawl</label>
            <div className="flex items-center gap-4">
              <input
                type="range" min={1} max={20} value={maxPages}
                onChange={e => setMaxPages(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-sm font-medium w-8 text-right">{maxPages}</span>
            </div>
            <p className="mt-1 text-xs text-muted">Each page yields ~10–30 job listings depending on the site.</p>
          </div>
        </fieldset>

        <fieldset className="rounded-theme bg-surface border border-white/10 p-5 space-y-4">
          <legend className="px-2 text-xs font-semibold text-primary uppercase tracking-wider">
            3. Analytics to Run
          </legend>
          <p className="text-xs text-muted">Leave blank to run all applicable analyses.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {ANALYTICS_OPTIONS.map(opt => (
              <label
                key={opt.id}
                className={`flex items-center gap-2 rounded-theme border px-3 py-2 cursor-pointer text-sm transition-colors ${
                  analyticsTypes.includes(opt.id)
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <input
                  type="checkbox"
                  checked={analyticsTypes.includes(opt.id)}
                  onChange={() =>
                    setAnalyticsTypes(prev =>
                      prev.includes(opt.id) ? prev.filter(t => t !== opt.id) : [...prev, opt.id]
                    )
                  }
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
        </fieldset>

        {/* Advanced */}
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
              <div>
                <label className="block text-sm font-medium mb-2">Pagination mode</label>
                <div className="flex gap-2 flex-wrap">
                  {(["auto", "scroll", "click"] as const).map(opt => (
                    <label key={opt} className={`flex items-center gap-2 px-3 py-2 rounded-theme border cursor-pointer text-sm transition-colors ${
                      paginationType === opt ? "border-primary/60 bg-primary/10 text-primary" : "border-white/10 hover:bg-white/5"
                    }`}>
                      <input type="radio" name="pagination" value={opt} checked={paginationType === opt}
                        onChange={() => setPaginationType(opt)} className="hidden" />
                      {opt === "auto" && "Auto (try both)"}
                      {opt === "scroll" && "Infinite scroll"}
                      {opt === "click" && "Next button / link"}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cookie banner hint <span className="text-muted">(optional)</span></label>
                <input
                  value={cookieHints}
                  onChange={e => setCookieHints(e.target.value)}
                  placeholder={`"Accept all", "Agree", or a CSS selector`}
                  className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm focus:outline-none focus:border-primary/60"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Field selector hints <span className="text-muted">(optional)</span></label>
                <p className="text-xs text-muted mb-3">Override CSS selectors per field if the AI struggles.</p>
                <div className="space-y-2">
                  {["title", "company", "location", "salary", "skills", "seniority", "remote_type"].map(field => (
                    <div key={field} className="flex items-center gap-2">
                      <span className="text-xs font-mono w-24 text-muted flex-shrink-0">{field}</span>
                      <input
                        value={selectorHintsMap[field] || ""}
                        onChange={e =>
                          setSelectorHintsMap(prev =>
                            e.target.value.trim()
                              ? { ...prev, [field]: e.target.value }
                              : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
                          )
                        }
                        placeholder="e.g. [data-testid='job-title'], h2.title"
                        className="flex-1 rounded-theme bg-bg border border-white/15 px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-primary/60"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-theme bg-primary text-white font-medium py-3 hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {submitting ? "Starting analysis…" : "Start Job Market Analysis →"}
        </button>
      </form>
    </div>
  );
}

// ── Running Step ──────────────────────────────────────────────────────────────
function RunningStep({ session }: { session: JobSession }) {
  const log = session.progress?.log || [];
  const records = session.progress?.records_collected || 0;
  const lastMsg = session.progress?.last_message || "Initialising…";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-4" />
        <h2 className="font-heading font-bold text-xl mb-1">Analysing Job Market…</h2>
        <p className="text-muted text-sm">{lastMsg}</p>
        {records > 0 && (
          <p className="mt-2 text-primary font-medium">{records} job listings collected</p>
        )}
      </div>
      <div className="rounded-theme bg-surface border border-white/10 p-4">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Live Progress</h3>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {log.slice().reverse().map((msg, i) => (
            <p key={i} className="text-xs text-muted font-mono leading-relaxed">{msg}</p>
          ))}
          {log.length === 0 && <p className="text-xs text-muted">Connecting to the crawler…</p>}
        </div>
      </div>
    </div>
  );
}

// ── Results Step ──────────────────────────────────────────────────────────────
function ResultsStep({
  session, onRefresh, onDelete, onRetryWithHints,
}: {
  session: JobSession;
  onRefresh: () => void;
  onDelete: () => void;
  onRetryWithHints: (hints: Record<string, string>) => void;
}) {
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [generatingBlog, setGeneratingBlog] = useState(false);
  const [blogResult, setBlogResult] = useState<{ title: string; slug: string } | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [retryHints, setRetryHints] = useState<Record<string, string>>({});
  const toast = useToast();

  const analytics: AnalyticsResult | null = session.analytics_result;
  const charts: ChartData[] = analytics?.charts || [];
  const records = session.progress?.records_collected || 0;

  async function loadPreview() {
    setLoadingPreview(true);
    try { setPreview(await previewJobRecords(session.id)); } catch {}
    setLoadingPreview(false);
  }

  async function handleGenerateBlog() {
    setGeneratingBlog(true);
    try {
      const res = await generateJobBlog(session.id);
      setBlogResult({ title: res.title, slug: res.slug });
      toast.success("Blog draft saved", `"${res.title}" saved as a draft.`);
    } catch (err) {
      toast.error("Blog generation failed", err instanceof Error ? err.message : "Unknown error");
    }
    setGeneratingBlog(false);
  }

  const failed = session.status === "failed";

  return (
    <div className="space-y-6">
      {/* Header strip */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="font-heading font-bold text-xl truncate">{session.name}</h2>
          <p className="text-sm text-muted truncate">{session.target_url}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          failed ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
        }`}>{failed ? "failed" : "complete"}</span>
        <a href={exportJobRecordsUrl(session.id)} download className="text-xs px-3 py-1.5 rounded-theme border border-white/15 hover:border-primary hover:text-primary transition-colors">
          Export JSON
        </a>
        <button onClick={onRefresh} className="text-xs px-3 py-1.5 rounded-theme border border-white/15 hover:border-white/40 transition-colors">Refresh</button>
        <button onClick={onDelete} className="text-xs px-3 py-1.5 rounded-theme border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">New scan</button>
      </div>

      {failed && (
        <div className="rounded-theme bg-red-500/10 border border-red-500/30 p-4">
          <p className="text-sm text-red-400 font-medium mb-1">Crawl failed</p>
          <p className="text-xs text-muted">{session.error}</p>
          <button
            onClick={() => setShowHints(true)}
            className="mt-3 text-xs px-3 py-1.5 rounded-theme bg-surface border border-white/15 hover:border-primary transition-colors"
          >
            Retry with selector hints →
          </button>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Job listings" value={String(records)} />
        <Stat label="Charts generated" value={String(charts.length)} />
        {analytics?.unique_skills != null && (
          <Stat label="Unique skills" value={String(analytics.unique_skills)} />
        )}
        {analytics?.salary_stats?.avg != null && (
          <Stat
            label="Avg salary"
            value={`$${(analytics.salary_stats.avg / 1000).toFixed(0)}k`}
          />
        )}
      </div>

      {/* Charts */}
      {charts.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {charts.map((chart) => (
            <ChartCard key={chart.id} chart={chart} />
          ))}
        </div>
      )}

      {records === 0 && !failed && (
        <div className="rounded-theme bg-surface border border-white/10 p-6 text-center">
          <p className="text-muted mb-3">No listings were extracted. The site structure may require selector hints.</p>
          <button
            onClick={() => setShowHints(true)}
            className="text-sm px-4 py-2 rounded-theme bg-primary text-white hover:opacity-90 transition-opacity"
          >
            Retry with selector hints →
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {!preview && records > 0 && (
          <button
            onClick={loadPreview}
            disabled={loadingPreview}
            className="px-4 py-2 text-sm rounded-theme border border-white/15 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
          >
            {loadingPreview ? "Loading…" : "Preview extracted data"}
          </button>
        )}
        {records > 0 && !blogResult && (
          <button
            onClick={handleGenerateBlog}
            disabled={generatingBlog}
            className="px-4 py-2 text-sm rounded-theme bg-primary/15 border border-primary/40 text-primary hover:bg-primary/25 transition-colors disabled:opacity-50"
          >
            {generatingBlog ? "Generating blog post…" : "Generate market-trends blog post"}
          </button>
        )}
        {blogResult && (
          <a
            href={`/blog/${blogResult.slug}`}
            className="px-4 py-2 text-sm rounded-theme bg-green-500/15 border border-green-500/40 text-green-400 hover:bg-green-500/25 transition-colors"
          >
            View blog post: "{blogResult.title}"
          </a>
        )}
        {(failed || records === 0) && (
          <button
            onClick={() => setShowHints(!showHints)}
            className="px-4 py-2 text-sm rounded-theme border border-white/15 hover:border-white/40 transition-colors"
          >
            {showHints ? "Hide hints" : "Add selector hints & retry"}
          </button>
        )}
      </div>

      {/* Selector hints retry panel */}
      {showHints && (
        <div className="rounded-theme bg-surface border border-white/10 p-5 space-y-4">
          <h3 className="font-semibold text-sm">Retry with CSS Selector Hints</h3>
          <p className="text-xs text-muted">
            Open DevTools on the job board, inspect the elements, and paste their CSS selectors below.
          </p>
          <div className="space-y-2">
            {["title", "company", "location", "salary", "skills", "seniority", "remote_type", "_pagination_type"].map(field => (
              <div key={field} className="flex items-center gap-2">
                <span className="text-xs font-mono w-28 text-muted flex-shrink-0">{field}</span>
                <input
                  value={retryHints[field] || ""}
                  onChange={e => setRetryHints(prev => e.target.value.trim()
                    ? { ...prev, [field]: e.target.value }
                    : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
                  )}
                  placeholder={field === "_pagination_type" ? "scroll | click | auto" : "[data-testid='...']"}
                  className="flex-1 rounded-theme bg-bg border border-white/15 px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-primary/60"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => { setShowHints(false); onRetryWithHints(retryHints); }}
            className="px-4 py-2 text-sm rounded-theme bg-primary text-white hover:opacity-90 transition-opacity"
          >
            Retry crawl with these hints →
          </button>
        </div>
      )}

      {/* Data preview */}
      {preview && (
        <div className="rounded-theme bg-surface border border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Extracted Data Preview ({preview.length} of first 20)</h3>
            <button onClick={() => setPreview(null)} className="text-xs text-muted hover:text-text">✕ close</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  {preview[0] && Object.keys(preview[0]).filter(k => k !== "source_url").map(k => (
                    <th key={k} className="px-3 py-2 text-left font-medium text-muted whitespace-nowrap">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {preview.map((row, i) => (
                  <tr key={i} className="hover:bg-white/5">
                    {Object.entries(row).filter(([k]) => k !== "source_url").map(([k, v]) => (
                      <td key={k} className="px-3 py-2 text-muted max-w-[200px] truncate">
                        {Array.isArray(v) ? v.join(", ") : String(v ?? "–")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-theme bg-surface border border-white/10 px-4 py-3 text-center">
      <p className="text-2xl font-bold font-heading">{value}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </div>
  );
}

function ChartCard({ chart }: { chart: ChartData }) {
  return (
    <div className="rounded-theme bg-surface border border-white/10 p-4">
      <h3 className="font-semibold text-sm mb-4">{chart.title}</h3>
      {chart.type === "bar" && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chart.data} margin={{ left: -10, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey={Object.keys(chart.data[0] || {})[0]}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              angle={-35}
              textAnchor="end"
              interval={0}
            />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <Tooltip
              contentStyle={{ background: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey={Object.keys(chart.data[0] || {})[1]} fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
      {chart.type === "pie" && (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={chart.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
              {chart.data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
