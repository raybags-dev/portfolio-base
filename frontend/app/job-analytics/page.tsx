"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell,
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
  searchKaggleJobs,
  importKaggleJobs,
  generateJobSummary,
  getBootstrap,
  listCrawlerProfiles,
  type JobSession,
  type AnalyticsResult,
  type ChartData,
  type KaggleDataset,
  type RunContactInfo,
  ApiError,
} from "@/lib/api";
import type { CrawlerProfile } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import RunProjectDisclaimer from "@/components/RunProjectDisclaimer";
import { Footer } from "@/components/sections";

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
type InputMode = "crawler" | "kaggle";

export default function JobAnalyticsPage() {
  const { data: bootstrap } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap, staleTime: Infinity });
  const { data: crawlerProfiles = [] } = useQuery({ queryKey: ["crawlerProfiles", "job_analytics"], queryFn: () => listCrawlerProfiles("job_analytics"), staleTime: Infinity });
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [step, setStep] = useState<Step>("configure");
  const [inputMode, setInputMode] = useState<InputMode>("crawler");
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
          profile_id: selectedProfileId ?? undefined,
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
    setInputMode("crawler");
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
                  <button key={s.id}
                    onClick={() => {
                      setActiveSession(s);
                      if (s.status === "done") setStep("results");
                      else if (s.status === "running") { setStep("running"); startPolling(s.id); }
                      else setStep("results");
                      setShowHistory(false);
                    }}
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
            cookieHints={cookieHints} setCookieHints={setCookieHints}
            paginationType={paginationType} setPaginationType={setPaginationType}
            selectorHintsMap={selectorHintsMap} setSelectorHintsMap={setSelectorHintsMap}
            formError={formError} submitting={submitting}
            handleSubmit={handleSubmit}
            crawlerProfiles={crawlerProfiles}
            selectedProfileId={selectedProfileId}
            setSelectedProfileId={setSelectedProfileId}
            onKaggleImportStarted={(session) => {
              setActiveSession(session);
              setStep("running");
              startPolling(session.id);
            }}
          />
        )}
        {step === "running" && activeSession && <RunningStep session={activeSession} />}
        {step === "configure" && <HowItWorksJobs />}
        {step === "results" && activeSession && (
          <ResultsStep
            session={activeSession}
            onRefresh={() => getJobSession(activeSession.id).then(setActiveSession)}
            onDelete={reset}
            onSessionUpdated={setActiveSession}
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-theme bg-surface border border-white/15 p-6 shadow-2xl">
            <h2 className="font-heading font-bold text-lg mb-2">Access Token Required</h2>
            <p className="text-sm text-muted mb-4">
              This app has already been run from your IP. Enter a valid access token to run it again.
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
                  className="flex-1 rounded-theme bg-primary text-white py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  {tokenSubmitting ? "Verifying…" : "Submit Token"}
                </button>
                <button type="button" onClick={() => { setTokenModal(null); setTokenInput(""); setTokenError(""); setSubmitting(false); }}
                  className="px-4 rounded-theme border border-white/15 text-sm hover:bg-white/5">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {bootstrap && <Footer data={bootstrap} />}
    </div>
  );
}

// ── Configure Step ────────────────────────────────────────────────────────────

function ConfigureStep({
  inputMode, setInputMode,
  url, setUrl, name, setName, prompt, setPrompt, maxPages, setMaxPages,
  analyticsTypes, setAnalyticsTypes,
  cookieHints, setCookieHints, paginationType, setPaginationType,
  selectorHintsMap, setSelectorHintsMap,
  formError, submitting, handleSubmit, onKaggleImportStarted,
  crawlerProfiles, selectedProfileId, setSelectedProfileId,
}: {
  inputMode: InputMode; setInputMode: (m: InputMode) => void;
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
  onKaggleImportStarted: (session: JobSession) => void;
  crawlerProfiles: CrawlerProfile[];
  selectedProfileId: number | null;
  setSelectedProfileId: (id: number | null) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 text-center">
        <h2 className="font-heading font-bold text-2xl mb-2">Configure Job Market Scan</h2>
        <p className="text-muted text-sm">Crawl a live job board or import a ready dataset from Kaggle.</p>
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
          cookieHints={cookieHints} setCookieHints={setCookieHints}
          paginationType={paginationType} setPaginationType={setPaginationType}
          selectorHintsMap={selectorHintsMap} setSelectorHintsMap={setSelectorHintsMap}
          formError={formError} submitting={submitting} handleSubmit={handleSubmit}
          showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced}
          crawlerProfiles={crawlerProfiles}
          selectedProfileId={selectedProfileId}
          setSelectedProfileId={setSelectedProfileId}
        />
      ) : (
        <KaggleSearch
          sessionName={name}
          analyticsSpec={{ types: analyticsTypes }}
          onImportStarted={onKaggleImportStarted}
        />
      )}
    </div>
  );
}

// ── Crawler Form ──────────────────────────────────────────────────────────────

function CrawlerForm({
  url, setUrl, name, setName, prompt, setPrompt, maxPages, setMaxPages,
  analyticsTypes, setAnalyticsTypes,
  cookieHints, setCookieHints, paginationType, setPaginationType,
  selectorHintsMap, setSelectorHintsMap,
  formError, submitting, handleSubmit, showAdvanced, setShowAdvanced,
  crawlerProfiles, selectedProfileId, setSelectedProfileId,
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
  showAdvanced: boolean; setShowAdvanced: (v: boolean) => void;
  crawlerProfiles: CrawlerProfile[];
  selectedProfileId: number | null;
  setSelectedProfileId: (id: number | null) => void;
}) {
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {formError && (
        <div className="rounded-theme bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 text-sm">{formError}</div>
      )}

      <div className="mb-4 rounded-theme bg-amber-500/10 border border-amber-500/25 px-4 py-3 text-xs text-amber-300 leading-relaxed">
        <strong>Recommended:</strong> indeed.com/jobs, remoteok.com, weworkremotely.com, company careers pages.
      </div>

      <fieldset className="rounded-theme bg-surface border border-white/10 p-5 space-y-4">
        <legend className="px-2 text-xs font-semibold text-primary uppercase tracking-wider">1. Target Job Board</legend>
        <div>
          <label className="block text-sm font-medium mb-1">Job board URL <span className="text-red-400">*</span></label>
          <input type="url" value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://remoteok.com/remote-python-jobs"
            className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm placeholder:text-muted/50 focus:outline-none focus:border-primary/60" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Session name <span className="text-muted">(optional)</span></label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Python Engineers – RemoteOK June 2026"
            className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm placeholder:text-muted/50 focus:outline-none focus:border-primary/60" />
        </div>
      </fieldset>

      <fieldset className="rounded-theme bg-surface border border-white/10 p-5 space-y-4">
        <legend className="px-2 text-xs font-semibold text-primary uppercase tracking-wider">2. What to Extract</legend>
        <div>
          <label className="block text-sm font-medium mb-1">Collection prompt <span className="text-red-400">*</span></label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
            className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm focus:outline-none focus:border-primary/60 resize-none" required />
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
      </fieldset>

      <div className="rounded-theme border border-white/10 overflow-hidden">
        <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium hover:bg-white/5 transition-colors">
          <span className="text-muted">Advanced Settings</span>
          <span className="text-muted text-xs">{showAdvanced ? "▲ hide" : "▼ show"}</span>
        </button>
        {showAdvanced && (
          <div className="px-5 pb-5 space-y-5 border-t border-white/10 pt-4">
            {crawlerProfiles.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-1">Crawler profile <span className="text-muted">(optional)</span></label>
                <select value={selectedProfileId ?? ""} onChange={e => setSelectedProfileId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm focus:outline-none focus:border-primary/60">
                  <option value="">None — use AI-generated selectors</option>
                  {crawlerProfiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.description ? ` — ${p.description}` : ""}</option>
                  ))}
                </select>
                <p className="text-xs text-muted/60 mt-1">A saved profile pre-fills selectors and field mappings for this crawler.</p>
              </div>
            )}
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
                placeholder={`"Accept all", "Agree", or a CSS selector`}
                className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm focus:outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Field selector hints <span className="text-muted">(optional)</span></label>
              <div className="space-y-2">
                {["title", "company", "location", "salary", "skills", "seniority", "remote_type"].map(field => (
                  <div key={field} className="flex items-center gap-2">
                    <span className="text-xs font-mono w-24 text-muted flex-shrink-0">{field}</span>
                    <input value={selectorHintsMap[field] || ""}
                      onChange={e => setSelectorHintsMap(prev =>
                        e.target.value.trim()
                          ? { ...prev, [field]: e.target.value }
                          : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
                      )}
                      placeholder="e.g. [data-testid='job-title']"
                      className="flex-1 rounded-theme bg-bg border border-white/15 px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-primary/60" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <button type="submit" disabled={submitting}
        className="w-full rounded-theme bg-primary text-white font-medium py-3 hover:opacity-90 disabled:opacity-50 transition-opacity">
        {submitting ? "Starting analysis…" : "Start Job Market Analysis →"}
      </button>
    </form>
  );
}

// ── Kaggle Search ─────────────────────────────────────────────────────────────

function KaggleSearch({
  sessionName, analyticsSpec, onImportStarted,
}: {
  sessionName: string;
  analyticsSpec: Record<string, unknown>;
  onImportStarted: (session: JobSession) => void;
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
      const data = await searchKaggleJobs(query.trim());
      setResults(data);
      if (data.length === 0) setSearchError("No datasets found. Try 'job listings', 'jobs dataset', 'linkedin jobs', etc.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Search failed";
      setSearchError(msg.includes("KAGGLE_USERNAME")
        ? "Kaggle credentials not configured on this server. Add KAGGLE_USERNAME and KAGGLE_KEY environment variables."
        : msg);
    }
    setSearching(false);
  }

  async function doImport() {
    if (!selected) return;
    setImporting(true); setImportError("");
    try {
      const session = await createJobSession({
        name: importName.trim() || selected.title,
        target_url: `kaggle://${selected.ref}`,
        collection_prompt: "Job dataset imported from Kaggle",
        analytics_spec: analyticsSpec,
        max_pages: 1,
      });
      await importKaggleJobs(session.id, selected.ref, importName.trim() || undefined);
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
          Search Kaggle&apos;s public library for job market datasets. The engine downloads the CSV, parses listings, and runs the full analytics pipeline automatically.
        </p>
        <form onSubmit={doSearch} className="flex gap-2">
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="e.g. job listings, linkedin jobs, software engineer salaries…"
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
                selected?.ref === ds.ref ? "border-primary/60 bg-primary/10" : "border-white/10 bg-surface hover:border-white/30"
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
            <input value={importName} onChange={e => setImportName(e.target.value)} placeholder={selected.title}
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

// ── Running Step ──────────────────────────────────────────────────────────────

function RunningStep({ session }: { session: JobSession }) {
  const log = session.progress?.log || [];
  const records = session.progress?.records_collected || 0;
  const lastMsg = session.progress?.last_message || "Initialising…";
  const isKaggle = session.target_url?.startsWith("kaggle://");

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-4" />
        <h2 className="font-heading font-bold text-xl mb-1">
          {isKaggle ? "Importing Kaggle Dataset…" : "Analysing Job Market…"}
        </h2>
        <p className="text-muted text-sm">{lastMsg}</p>
        {records > 0 && <p className="mt-2 text-primary font-medium">{records} records collected</p>}
      </div>
      <div className="rounded-theme bg-surface border border-white/10 p-4">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Live Progress</h3>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {log.slice().reverse().map((msg, i) => (
            <p key={i} className="text-xs text-muted font-mono leading-relaxed">{msg}</p>
          ))}
          {log.length === 0 && <p className="text-xs text-muted">Connecting…</p>}
        </div>
      </div>
    </div>
  );
}

// ── Results Step ──────────────────────────────────────────────────────────────

function ResultsStep({
  session, onRefresh, onDelete, onSessionUpdated, onRetryWithHints,
}: {
  session: JobSession;
  onRefresh: () => void;
  onDelete: () => void;
  onSessionUpdated: (s: JobSession) => void;
  onRetryWithHints: (hints: Record<string, string>) => void;
}) {
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [generatingBlog, setGeneratingBlog] = useState(false);
  const [blogResult, setBlogResult] = useState<{ title: string; slug: string } | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [retryHints, setRetryHints] = useState<Record<string, string>>({});
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const toast = useToast();

  const analytics: AnalyticsResult | null = session.analytics_result;
  const charts: ChartData[] = analytics?.charts || [];
  const records = session.progress?.records_collected || analytics?.total_records || 0;
  const failed = session.status === "failed";
  const isKaggle = session.target_url?.startsWith("kaggle://");

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

  async function handleDelete() {
    if (!confirm("Delete this session and all collected records?")) return;
    try { await deleteJobSession(session.id); onDelete(); }
    catch { toast.error("Delete failed"); }
  }

  async function handleGenerateSummary() {
    setSummaryLoading(true);
    try {
      const res = await generateJobSummary(session.id);
      onSessionUpdated({ ...session, analytics_result: { ...(session.analytics_result || {}), summary: res.summary } });
      setSummaryOpen(true);
      toast.success("Summary ready", "AI has analysed your data and generated insights.");
    } catch (err) {
      toast.error("Summary failed", err instanceof Error ? err.message : "Unknown error");
    }
    setSummaryLoading(false);
  }

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
        }`}>{failed ? "failed" : isKaggle ? "imported" : "complete"}</span>
        <a href={exportJobRecordsUrl(session.id)} download className="text-xs px-3 py-1.5 rounded-theme border border-white/15 hover:border-primary hover:text-primary transition-colors">
          Export JSON
        </a>
        <button onClick={onRefresh} className="text-xs px-3 py-1.5 rounded-theme border border-white/15 hover:border-white/40 transition-colors">Refresh</button>
        <button onClick={handleDelete} className="text-xs px-3 py-1.5 rounded-theme border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">Delete</button>
        <button onClick={onDelete} className="text-xs px-3 py-1.5 rounded-theme border border-white/15 hover:border-white/40 transition-colors">New scan</button>
      </div>

      {failed && (
        <div className="rounded-theme bg-red-500/10 border border-red-500/30 p-4">
          <p className="text-sm text-red-400 font-medium mb-1">Analysis failed</p>
          <p className="text-xs text-muted">{session.error}</p>
          {!isKaggle && (
            <button onClick={() => setShowHints(true)}
              className="mt-3 text-xs px-3 py-1.5 rounded-theme bg-surface border border-white/15 hover:border-primary transition-colors">
              Retry with selector hints →
            </button>
          )}
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Records" value={String(records)} />
        <Stat label="Charts generated" value={String(charts.length)} />
        {analytics?.unique_skills != null && <Stat label="Unique skills" value={String(analytics.unique_skills)} />}
        {analytics?.salary_stats?.avg != null && (
          <Stat label="Avg salary" value={`$${(analytics.salary_stats.avg / 1000).toFixed(0)}k`} />
        )}
      </div>

      {charts.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {charts.map((chart) => <ChartCard key={chart.id} chart={chart} />)}
        </div>
      )}

      {records === 0 && !failed && (
        <div className="rounded-theme bg-surface border border-white/10 p-6 text-center">
          <p className="text-muted mb-3">No listings were extracted. {isKaggle ? "The dataset may be in an unsupported format." : "The site structure may require selector hints."}</p>
          {!isKaggle && (
            <button onClick={() => setShowHints(true)}
              className="text-sm px-4 py-2 rounded-theme bg-primary text-white hover:opacity-90 transition-opacity">
              Retry with selector hints →
            </button>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {!preview && records > 0 && (
          <button onClick={loadPreview} disabled={loadingPreview}
            className="px-4 py-2 text-sm rounded-theme border border-white/15 hover:border-primary hover:text-primary transition-colors disabled:opacity-50">
            {loadingPreview ? "Loading…" : "Preview extracted data"}
          </button>
        )}
        {records > 0 && !blogResult && (
          <button onClick={handleGenerateBlog} disabled={generatingBlog}
            className="px-4 py-2 text-sm rounded-theme bg-primary/15 border border-primary/40 text-primary hover:bg-primary/25 transition-colors disabled:opacity-50">
            {generatingBlog ? "Generating…" : "Generate market-trends blog post"}
          </button>
        )}
        {blogResult && (
          <a href={`/blog/${blogResult.slug}`}
            className="px-4 py-2 text-sm rounded-theme bg-green-500/15 border border-green-500/40 text-green-400 hover:bg-green-500/25 transition-colors">
            View blog post →
          </a>
        )}
        {!isKaggle && (failed || records === 0) && (
          <button onClick={() => setShowHints(!showHints)}
            className="px-4 py-2 text-sm rounded-theme border border-white/15 hover:border-white/40 transition-colors">
            {showHints ? "Hide hints" : "Add selector hints & retry"}
          </button>
        )}
      </div>

      {/* Selector hints retry panel */}
      {showHints && !isKaggle && (
        <div className="rounded-theme bg-surface border border-white/10 p-5 space-y-4">
          <h3 className="font-semibold text-sm">Retry with CSS Selector Hints</h3>
          <div className="space-y-2">
            {["title", "company", "location", "salary", "skills", "seniority", "remote_type", "_pagination_type"].map(field => (
              <div key={field} className="flex items-center gap-2">
                <span className="text-xs font-mono w-28 text-muted flex-shrink-0">{field}</span>
                <input value={retryHints[field] || ""}
                  onChange={e => setRetryHints(prev => e.target.value.trim()
                    ? { ...prev, [field]: e.target.value }
                    : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
                  )}
                  placeholder={field === "_pagination_type" ? "scroll | click | auto" : "[data-testid='...']"}
                  className="flex-1 rounded-theme bg-bg border border-white/15 px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-primary/60" />
              </div>
            ))}
          </div>
          <button onClick={() => { setShowHints(false); onRetryWithHints(retryHints); }}
            className="px-4 py-2 text-sm rounded-theme bg-primary text-white hover:opacity-90 transition-opacity">
            Retry crawl with these hints →
          </button>
        </div>
      )}

      {/* Data preview */}
      {preview && (
        <div className="rounded-theme bg-surface border border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Extracted Data Preview ({preview.length} rows)</h3>
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

      {/* AI Insights Summary */}
      {records > 0 && (
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
    <div className="rounded-theme border border-white/10 overflow-hidden">
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
                : "Let AI explain what this job market data reveals in plain language"}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-theme bg-surface border border-white/10 px-4 py-3 text-center">
      <p className="text-2xl font-bold font-heading">{value}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </div>
  );
}

function ChartCard({ chart }: { chart: ChartData }) {
  const labelKey0 = Object.keys(chart.data[0] || {})[0];
  const valueKey0 = Object.keys(chart.data[0] || {})[1];
  const needsScroll = chart.type === "bar" && chart.data.length > 10;
  const dynamicWidth = Math.max(chart.data.length * 52, 280);
  return (
    <div className="rounded-theme bg-surface border border-white/10 p-4">
      <h3 className="font-semibold text-sm mb-4">{chart.title}</h3>
      {chart.type === "bar" && (
        <div className={needsScroll ? "overflow-x-auto chart-scroll" : ""}>
          <div style={{ width: needsScroll ? dynamicWidth : "100%", minWidth: "100%" }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chart.data} margin={{ left: 0, bottom: 48, top: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey={labelKey0} tick={{ fontSize: 10, fill: "var(--color-muted)" }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} width={36} />
                <Tooltip
                  contentStyle={{ background: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "var(--color-fg)" }}
                  itemStyle={{ color: "var(--color-primary)" }}
                />
                <Bar dataKey={valueKey0} fill="var(--color-primary)" radius={[3, 3, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {chart.type === "pie" && (
        <div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={chart.data}
                dataKey="value"
                nameKey="name"
                cx="50%" cy="50%"
                outerRadius={82}
                innerRadius={36}
                paddingAngle={2}
                labelLine={false}
              >
                {chart.data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "var(--color-fg)" }}
                itemStyle={{ color: "var(--color-primary)" }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center mt-2 px-1">
            {chart.data.map((entry, i) => (
              <div key={i} className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="text-xs truncate" style={{ color: "var(--color-muted)" }}>{String((entry as Record<string, unknown>).name ?? "")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── How It Works ──────────────────────────────────────────────────────────────

function HowItWorksJobs() {
  const [open, setOpen] = useState(false);

  const steps = [
    { num: "01", title: "Enter a URL or import Kaggle", body: "Paste any job board URL (LinkedIn, Indeed, Glassdoor, etc.) or a Kaggle job dataset slug. You can customise the extraction prompt to focus on specific fields." },
    { num: "02", title: "Playwright + LLM Crawl", body: "A headless Chromium browser (Playwright) renders the page and follows pagination. An LLM (Groq AI) reads each listing and extracts: title, company, location, salary, skills, seniority, remote/hybrid status." },
    { num: "03", title: "Schema Normalisation", body: "Field names vary wildly across job boards. The LLM proposes a unified snake_case schema so all records are comparable regardless of source." },
    { num: "04", title: "Analytics + Charts", body: "Top skills are ranked by frequency, salary ranges are charted, work arrangement (remote/hybrid/onsite) and seniority breakdowns are visualised as clean charts." },
    { num: "05", title: "AI Market Insights", body: "Groq AI generates a written market analysis — in-demand skills, salary benchmarks, hiring trends — and saves it as a draft blog post you can publish." },
    { num: "06", title: "Export", body: "Download the full structured dataset as JSON or CSV for use in your own analysis pipelines or spreadsheet tools." },
  ];

  const tech = ["Python / FastAPI", "Playwright (Chromium)", "Groq AI (llama-3.3-70b)", "BeautifulSoup4", "PostgreSQL", "Next.js / Recharts"];

  return (
    <div className="mt-10 rounded-theme bg-surface border border-white/10 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <div>
          <h2 className="font-semibold text-base">How It Works</h2>
          <p className="text-xs text-muted mt-0.5">Architecture, crawl pipeline, and tech stack</p>
        </div>
        <span className="text-muted text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-white/8 px-5 pb-6 pt-5">
          <div className="grid sm:grid-cols-2 gap-4 mb-5">
            {steps.map(s => (
              <div key={s.num} className="flex gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">{s.num}</div>
                <div>
                  <h3 className="text-sm font-semibold">{s.title}</h3>
                  <p className="text-xs text-muted mt-1 leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-theme bg-bg border border-white/8 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-2">Tech Stack</p>
            <div className="flex flex-wrap gap-2">
              {tech.map(t => (
                <span key={t} className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded font-mono">{t}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
