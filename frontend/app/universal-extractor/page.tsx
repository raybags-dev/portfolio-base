"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line,
} from "recharts";
import {
  createUDESession,
  getUDESession,
  runUDESession,
  cancelUDESession,
  deleteUDESession,
  listUDESessions,
  generateUDESummary,
  generateUDEBlog,
  getUDEStorageStats,
  exportUDERecordsUrl,
  getUDEReportPdfUrl,
  getUDERecords,
  type UDESession,
  type AnalyticsResult,
  type ChartData,
  type RunContactInfo,
  ApiError,
} from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import RunProjectDisclaimer from "@/components/RunProjectDisclaimer";

const DISCLAIMER_KEY = "run_disclaimer_ude_v1";

const CHART_COLORS = [
  "#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd",
  "#4f46e5", "#7c3aed", "#2563eb", "#0891b2",
];

const SOURCE_TYPES = [
  { id: "auto",   label: "Auto-detect", icon: "🔍", hint: "Let the engine figure it out from the URL" },
  { id: "html",   label: "Web Page",    icon: "🌐", hint: "Any HTML page — static or JS-rendered" },
  { id: "api",    label: "JSON API",    icon: "⚙️", hint: "REST or GraphQL endpoint returning JSON" },
  { id: "csv",    label: "CSV URL",     icon: "📊", hint: "Direct link to a CSV file" },
  { id: "kaggle", label: "Kaggle",      icon: "🏆", hint: "kaggle://owner/dataset-slug format" },
  { id: "text",   label: "Paste Data",  icon: "📋", hint: "Paste raw CSV or JSON directly" },
];

const INPUT_CLS = "w-full bg-bg border border-white/15 rounded-theme px-3 py-2.5 text-sm text-fg placeholder:text-muted focus:outline-none focus:border-primary/60 transition-colors";

type Step = "configure" | "running" | "results";

export default function UniversalExtractorPage() {
  const [step, setStep] = useState<Step>("configure");
  const [sessions, setSessions] = useState<UDESession[]>([]);
  const [activeSession, setActiveSession] = useState<UDESession | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const toast = useToast();

  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceType, setSourceType] = useState("auto");
  const [prompt, setPrompt] = useState("Extract all structured data fields from this source.");
  const [maxRecords, setMaxRecords] = useState(500);
  const [customHeaders, setCustomHeaders] = useState("");
  const [maxPages, setMaxPages] = useState(3);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pasteStats, setPasteStats] = useState<{ count: number; kb: number; parsed: boolean } | null>(null);

  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [tokenModal, setTokenModal] = useState<{ sessionId: number } | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenError, setTokenError] = useState("");
  const [tokenSubmitting, setTokenSubmitting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingUrlRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPolling = useCallback((sessionId: number) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const s = await getUDESession(sessionId);
        setActiveSession(s);
        if (s.status === "done") { setStep("results"); stopPolling(); }
        if (s.status === "failed" || s.status === "cancelled") { stopPolling(); }
      } catch { stopPolling(); }
    }, 2500);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function loadHistory() {
    try { setSessions(await listUDESessions()); } catch { /* ignore */ }
  }

  const MAX_PASTE_BYTES = 2 * 1024 * 1024; // 2 MB — matches backend cap

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!sourceUrl.trim()) { setFormError("Source URL or data is required."); return; }

    // Auto-truncate text paste to maxRecords if it looks like a JSON array
    let finalUrl = sourceUrl;
    if (sourceType === "text") {
      const raw = sourceUrl.trim();
      if (raw.startsWith("[")) {
        try {
          const parsed: unknown[] = JSON.parse(raw);
          if (parsed.length > maxRecords) {
            const truncated = parsed.slice(0, maxRecords);
            finalUrl = JSON.stringify(truncated);
          }
        } catch { /* not valid JSON — pass as-is, backend will handle it */ }
      }
      if (new TextEncoder().encode(finalUrl).length > MAX_PASTE_BYTES) {
        setFormError(`Dataset is too large even after truncation (>${MAX_PASTE_BYTES / 1024 / 1024} MB). Reduce the data or lower Max Records.`);
        return;
      }
    }

    const ack = typeof window !== "undefined" && localStorage.getItem(DISCLAIMER_KEY);
    if (!ack) {
      pendingUrlRef.current = finalUrl;
      setShowDisclaimer(true);
      return;
    }
    await doSubmit(undefined, finalUrl);
  }

  async function doSubmit(contact?: RunContactInfo, overrideUrl?: string) {
    setShowDisclaimer(false);
    setSubmitting(true);
    try {
      let headers: Record<string, string> = {};
      if (customHeaders.trim()) {
        try { headers = JSON.parse(customHeaders); }
        catch { setFormError("Custom headers must be valid JSON."); setSubmitting(false); return; }
      }

      const session = await createUDESession({
        name: name.trim() || `Extraction — ${new Date().toLocaleString()}`,
        source_url: (overrideUrl ?? sourceUrl).trim(),
        source_type: sourceType,
        extraction_prompt: prompt.trim(),
        source_config: { headers, max_pages: maxPages },
        max_records: maxRecords,
        session_contact: contact,
      });
      setActiveSession(session);

      try {
        await runUDESession(session.id);
        setStep("running");
        startPolling(session.id);
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          setTokenModal({ sessionId: session.id });
        } else {
          throw err;
        }
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to start extraction.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTokenSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenModal) return;
    setTokenError(""); setTokenSubmitting(true);
    try {
      await runUDESession(tokenModal.sessionId, tokenInput.trim());
      setTokenModal(null); setTokenInput("");
      setStep("running");
      startPolling(tokenModal.sessionId);
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : "Invalid token.");
    } finally {
      setTokenSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!activeSession) return;
    try {
      await cancelUDESession(activeSession.id);
      stopPolling();
      setActiveSession(s => s ? { ...s, status: "cancelled", error: "Cancelled by user" } : s);
      toast.info("Cancelled", "The extraction has been cancelled.");
    } catch (err) {
      toast.error("Could not cancel", err);
    }
  }

  function reset() {
    stopPolling();
    setStep("configure");
    setActiveSession(null);
    setSourceUrl(""); setName(""); setFormError(""); setSubmitting(false);
    setCustomHeaders(""); setSourceType("auto");
  }

  return (
    <main className="min-h-screen" style={{ background: "var(--color-bg)", color: "var(--color-fg)" }}>
      <div className="max-w-5xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight">Universal Data Extractor</h1>
            <p className="text-muted mt-1 text-sm max-w-xl">
              Point it at any URL, API, CSV, or Kaggle dataset — auto-detect, extract, normalise, and analyse without writing a single line of code.
            </p>
          </div>
          <button
            onClick={() => { setShowHistory(h => !h); loadHistory(); }}
            className="shrink-0 text-sm text-muted hover:text-fg border border-white/15 rounded-theme px-3 py-1.5 transition-colors hover:border-white/30"
          >
            {showHistory ? "Hide History" : "History"}
          </button>
        </div>

        {/* Session history */}
        {showHistory && sessions.length > 0 && (
          <div className="mb-6 rounded-theme border border-white/10 bg-surface overflow-hidden">
            <div className="px-4 py-2 border-b border-white/8 text-xs text-muted font-medium uppercase tracking-widest">Recent sessions</div>
            <div className="divide-y divide-white/5">
              {sessions.slice(0, 10).map(s => (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveSession(s);
                    setStep(s.status === "done" || s.status === "failed" || s.status === "cancelled" ? "results" : "running");
                    setShowHistory(false);
                    if (s.status === "running") startPolling(s.id);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-white/5 flex items-center justify-between text-sm transition-colors"
                >
                  <span className="font-medium truncate max-w-xs text-fg">{s.name}</span>
                  <StatusBadge status={s.status} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Storage stats */}
        {step === "configure" && <StorageStats />}

        {/* Token modal */}
        {tokenModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <form onSubmit={handleTokenSubmit} className="bg-surface border border-white/15 rounded-theme p-6 w-full max-w-sm shadow-2xl">
              <h2 className="font-semibold text-fg mb-1">Access Token Required</h2>
              <p className="text-sm text-muted mb-4">Enter your one-time token to run this extraction.</p>
              <input
                type="text"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="Paste token…"
                className={`${INPUT_CLS} font-mono mb-3`}
              />
              {tokenError && <p className="text-sm text-red-400 mb-3">{tokenError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={tokenSubmitting || !tokenInput.trim()}
                  className="flex-1 bg-primary text-white rounded-theme py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {tokenSubmitting ? "Verifying…" : "Run Extraction"}
                </button>
                <button
                  type="button"
                  onClick={() => { setTokenModal(null); setTokenInput(""); setSubmitting(false); }}
                  className="px-4 py-2 rounded-theme border border-white/15 text-sm hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Disclaimer */}
        {showDisclaimer && (
          <RunProjectDisclaimer
            projectName="Universal Data Extractor"
            onRun={(c) => { if (typeof window !== "undefined") localStorage.setItem(DISCLAIMER_KEY, "1"); doSubmit(c, pendingUrlRef.current ?? undefined); }}
            onClose={() => setShowDisclaimer(false)}
          />
        )}

        {/* Steps */}
        {step === "configure" && (
          <ConfigureStep
            name={name} setName={setName}
            sourceUrl={sourceUrl} setSourceUrl={setSourceUrl}
            sourceType={sourceType} setSourceType={setSourceType}
            prompt={prompt} setPrompt={setPrompt}
            maxRecords={maxRecords} setMaxRecords={setMaxRecords}
            maxPages={maxPages} setMaxPages={setMaxPages}
            customHeaders={customHeaders} setCustomHeaders={setCustomHeaders}
            showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced}
            formError={formError}
            submitting={submitting}
            onSubmit={handleSubmit}
            pasteStats={pasteStats}
            setPasteStats={setPasteStats}
          />
        )}

        {step === "running" && activeSession && (
          <RunningStep session={activeSession} onCancel={handleCancel} onReset={reset} />
        )}

        {step === "results" && activeSession && (
          <ResultsStep
            session={activeSession}
            onReset={reset}
            onDelete={async () => {
              await deleteUDESession(activeSession.id);
              toast.success("Session deleted");
              reset();
            }}
            toast={toast}
          />
        )}

        {/* How It Works */}
        {step === "configure" && <HowItWorks />}
      </div>
    </main>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    done:      "bg-green-500/20 text-green-400",
    failed:    "bg-red-500/20 text-red-400",
    running:   "bg-blue-500/20 text-blue-400",
    cancelled: "bg-amber-500/20 text-amber-400",
    pending:   "bg-white/8 text-muted",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? map.pending} ${status === "running" ? "animate-pulse" : ""}`}>
      {status}
    </span>
  );
}

// ── Configure step ────────────────────────────────────────────────────────────

function ConfigureStep({
  name, setName, sourceUrl, setSourceUrl, sourceType, setSourceType,
  prompt, setPrompt, maxRecords, setMaxRecords, maxPages, setMaxPages,
  customHeaders, setCustomHeaders,
  showAdvanced, setShowAdvanced,
  formError, submitting, onSubmit,
  pasteStats, setPasteStats,
}: {
  name: string; setName: (v: string) => void;
  sourceUrl: string; setSourceUrl: (v: string) => void;
  sourceType: string; setSourceType: (v: string) => void;
  prompt: string; setPrompt: (v: string) => void;
  maxRecords: number; setMaxRecords: (v: number) => void;
  maxPages: number; setMaxPages: (v: number) => void;
  customHeaders: string; setCustomHeaders: (v: string) => void;
  showAdvanced: boolean; setShowAdvanced: (v: boolean) => void;
  formError: string; submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  pasteStats: { count: number; kb: number; parsed: boolean } | null;
  setPasteStats: (v: { count: number; kb: number; parsed: boolean } | null) => void;
}) {
  const selectedType = SOURCE_TYPES.find(t => t.id === sourceType)!;

  function handlePasteChange(raw: string) {
    setSourceUrl(raw);
    if (!raw.trim()) { setPasteStats(null); return; }
    const kb = Math.round(new TextEncoder().encode(raw).length / 1024);
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      try {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr)) { setPasteStats({ count: arr.length, kb, parsed: true }); return; }
      } catch { /* partial paste — don't throw */ }
    }
    setPasteStats({ count: 0, kb, parsed: false });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">

      {/* Source type */}
      <div className="rounded-theme bg-surface border border-white/10 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">Source Type</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {SOURCE_TYPES.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSourceType(t.id)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-theme border text-sm transition-all ${
                sourceType === t.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-white/10 hover:border-white/25 text-muted hover:text-fg"
              }`}
            >
              <span className="text-xl">{t.icon}</span>
              <span className="font-medium text-xs">{t.label}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted mt-2.5">{selectedType.hint}</p>
      </div>

      {/* Source URL / data */}
      <div className="rounded-theme bg-surface border border-white/10 p-5">
        <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-3">
          {sourceType === "text"   ? "Paste Raw Data (CSV or JSON)"
          : sourceType === "kaggle" ? "Kaggle Dataset Reference"
          : "Source URL"}
        </label>
        {sourceType === "text" ? (
          <>
            <textarea
              value={sourceUrl}
              onChange={e => handlePasteChange(e.target.value)}
              rows={6}
              placeholder={'[{"name":"Alice","age":30},{"name":"Bob","age":25}]'}
              className={`${INPUT_CLS} font-mono resize-y`}
            />
            {pasteStats && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {pasteStats.parsed && (
                  <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded font-mono">
                    {pasteStats.count.toLocaleString()} records
                  </span>
                )}
                <span className={`text-xs px-2.5 py-1 rounded font-mono ${pasteStats.kb > 1800 ? "bg-red-500/20 text-red-400" : pasteStats.kb > 800 ? "bg-amber-500/20 text-amber-400" : "bg-white/8 text-muted"}`}>
                  {pasteStats.kb.toLocaleString()} KB
                </span>
                {pasteStats.parsed && pasteStats.count > maxRecords && (
                  <span className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded">
                    Will be auto-truncated to first {maxRecords.toLocaleString()} records before sending
                  </span>
                )}
                {pasteStats.kb > 1800 && (
                  <span className="text-xs bg-red-500/15 text-red-400 border border-red-500/30 px-2.5 py-1 rounded">
                    Approaching 2 MB limit — reduce data or lower Max Records
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <input
            type={sourceType === "kaggle" ? "text" : "url"}
            value={sourceUrl}
            onChange={e => setSourceUrl(e.target.value)}
            placeholder={sourceType === "kaggle" ? "kaggle://owner/dataset-slug" : "https://example.com/data"}
            className={INPUT_CLS}
          />
        )}
      </div>

      {/* Extraction goal + name */}
      <div className="rounded-theme bg-surface border border-white/10 p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">Extraction Goal</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={2}
            placeholder="Describe what data to extract and which fields matter most…"
            className={`${INPUT_CLS} resize-none`}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">Session Name <span className="font-normal normal-case text-muted/70">(optional)</span></label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My extraction session"
            className={INPUT_CLS}
          />
        </div>
      </div>

      {/* Max records */}
      <div className="rounded-theme bg-surface border border-white/10 p-5">
        <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-3">
          Max Records: <span className="text-primary normal-case font-bold">{maxRecords.toLocaleString()}</span>
        </label>
        <input
          type="range" min={50} max={5000} step={50} value={maxRecords}
          onChange={e => setMaxRecords(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-muted mt-1.5">
          <span>50</span><span>5,000</span>
        </div>
      </div>

      {/* Advanced */}
      <div className="rounded-theme bg-surface border border-white/10 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm text-muted hover:text-fg hover:bg-white/5 transition-colors"
        >
          <span className="font-medium">Advanced options</span>
          <span className="text-xs">{showAdvanced ? "▲" : "▼"}</span>
        </button>
        {showAdvanced && (
          <div className="border-t border-white/8 px-5 pb-5 pt-4 space-y-4">
            {(sourceType === "html" || sourceType === "auto") && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">
                  Max Pages for HTML crawl: <span className="text-primary normal-case font-bold">{maxPages}</span>
                </label>
                <input
                  type="range" min={1} max={20} value={maxPages}
                  onChange={e => setMaxPages(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">Custom Request Headers (JSON)</label>
              <textarea
                value={customHeaders}
                onChange={e => setCustomHeaders(e.target.value)}
                rows={3}
                placeholder={'{"Authorization": "Bearer token", "Accept": "application/json"}'}
                className={`${INPUT_CLS} font-mono resize-none`}
              />
            </div>
          </div>
        )}
      </div>

      {formError && (
        <div className="rounded-theme bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          {formError}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-primary text-white font-semibold py-3.5 rounded-theme hover:opacity-90 disabled:opacity-50 transition-opacity text-sm"
      >
        {submitting ? "Starting extraction…" : "Extract & Analyse →"}
      </button>
    </form>
  );
}

// ── Running step ──────────────────────────────────────────────────────────────

function RunningStep({ session, onCancel, onReset }: { session: UDESession; onCancel: () => void; onReset: () => void }) {
  const progress = session.progress || {};
  const log: string[] = progress.log || [];
  const isFailed    = session.status === "failed";
  const isCancelled = session.status === "cancelled";
  const isDone      = session.status === "done";
  const isRunning   = !isFailed && !isCancelled && !isDone;

  return (
    <div className="rounded-theme bg-surface border border-white/10 p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {isRunning && <span className="h-3 w-3 rounded-full bg-blue-400 animate-pulse shrink-0" />}
          {isFailed   && <span className="h-3 w-3 rounded-full bg-red-400 shrink-0" />}
          {isCancelled && <span className="h-3 w-3 rounded-full bg-amber-400 shrink-0" />}
          <h2 className="font-semibold">
            {isFailed    ? "Extraction Failed"
            : isCancelled ? "Extraction Cancelled"
            : "Extracting…"}
          </h2>
          {progress.records_collected != null && (
            <span className="text-sm text-muted">{progress.records_collected.toLocaleString()} records</span>
          )}
        </div>
        <div className="flex gap-2">
          {isRunning && (
            <button
              onClick={onCancel}
              className="text-xs px-3 py-1.5 rounded-theme border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Cancel
            </button>
          )}
          {(isFailed || isCancelled) && (
            <button
              onClick={onReset}
              className="text-xs px-3 py-1.5 rounded-theme border border-white/15 text-muted hover:text-fg hover:border-white/30 transition-colors"
            >
              ← Start over
            </button>
          )}
        </div>
      </div>

      {progress.source_type_detected && (
        <div className="text-xs text-muted">
          Detected: <span className="text-fg font-mono">{progress.source_type_detected}</span>
        </div>
      )}

      {(isFailed || isCancelled) && session.error && (
        <div className={`rounded-theme p-3 text-sm border ${isCancelled ? "bg-amber-500/10 border-amber-500/30 text-amber-300" : "bg-red-500/10 border-red-500/30 text-red-300"}`}>
          {session.error}
        </div>
      )}

      <div className="bg-black/30 rounded-theme p-4 max-h-64 overflow-y-auto font-mono text-xs space-y-1 border border-white/6">
        {log.length === 0 && <span className="text-muted">Initialising…</span>}
        {log.map((line, i) => (
          <div key={i} className="text-muted leading-relaxed">{line}</div>
        ))}
        {isRunning && log.length > 0 && (
          <div className="text-primary animate-pulse">▌</div>
        )}
      </div>

      {isRunning && (
        <div className="h-1 rounded-full bg-white/8 overflow-hidden">
          <div className="h-full bg-primary/60 rounded-full animate-pulse" style={{ width: "60%" }} />
        </div>
      )}
    </div>
  );
}

// ── Results step ──────────────────────────────────────────────────────────────

function ResultsStep({
  session, onReset, onDelete, toast,
}: {
  session: UDESession;
  onReset: () => void;
  onDelete: () => Promise<void>;
  toast: ReturnType<typeof useToast>;
}) {
  const analytics: AnalyticsResult = session.analytics_result || { charts: [], total_records: 0 };
  const progress = session.progress || {};
  const isFailed    = session.status === "failed";
  const isCancelled = session.status === "cancelled";
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState(
    (session.analytics_result as Record<string, unknown> & { summary?: string } | null)?.summary || ""
  );
  const [deleting, setDeleting] = useState(false);
  const [recordPreview, setRecordPreview] = useState<Record<string, unknown>[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogResult, setBlogResult] = useState<{ title: string; slug: string } | null>(null);

  async function loadPreview() {
    try {
      const rows = await getUDERecords(session.id, 10);
      const clean = rows.map((r: Record<string, unknown>) => {
        const item = r as { normalised_data?: Record<string, unknown>; data?: Record<string, unknown> };
        return item.normalised_data || item.data || {};
      });
      setRecordPreview(clean);
      setShowPreview(true);
    } catch { /* ignore */ }
  }

  async function handleSummary() {
    setSummaryLoading(true);
    try {
      const res = await generateUDESummary(session.id);
      setSummary(res.summary);
      toast.success("Summary generated");
    } catch { toast.error("Summary generation failed"); }
    finally { setSummaryLoading(false); }
  }

  async function handleGenerateBlog() {
    setBlogLoading(true);
    try {
      const res = await generateUDEBlog(session.id);
      setBlogResult({ title: res.title, slug: res.slug });
      toast.success(`Blog post "${res.title}" saved as draft`);
    } catch { toast.error("Blog generation failed"); }
    finally { setBlogLoading(false); }
  }

  const successfulSession = !isFailed && !isCancelled;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-heading">{session.name}</h2>
          <p className="text-sm text-muted mt-1 flex items-center gap-2">
            <StatusBadge status={session.status} />
            <span>{(progress.records_collected ?? analytics.total_records ?? 0).toLocaleString()} records</span>
            {session.source_type_detected && <span className="font-mono">· {session.source_type_detected}</span>}
          </p>
        </div>
        <button
          onClick={onReset}
          className="shrink-0 text-sm text-muted hover:text-fg border border-white/15 rounded-theme px-3 py-1.5 transition-colors hover:border-white/30"
        >
          ← New Extraction
        </button>
      </div>

      {(isFailed || isCancelled) && session.error && (
        <div className={`rounded-theme p-4 text-sm border ${isCancelled ? "bg-amber-500/10 border-amber-500/30 text-amber-300" : "bg-red-500/10 border-red-500/30 text-red-300"}`}>
          {session.error}
        </div>
      )}

      {/* Schema tags */}
      {session.schema_detected && Object.keys(session.schema_detected).length > 0 && (
        <div className="rounded-theme bg-surface border border-white/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">Detected Schema</p>
          <div className="flex flex-wrap gap-2">
            {Object.keys(session.schema_detected).map(k => (
              <span key={k} className="bg-primary/10 text-primary text-xs px-2.5 py-1 rounded font-mono">{k}</span>
            ))}
          </div>
        </div>
      )}

      {/* AI summary */}
      {successfulSession && (
        <div className="rounded-theme bg-surface border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">AI Insights</p>
            {!summary && (
              <button
                onClick={handleSummary}
                disabled={summaryLoading}
                className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-theme hover:bg-primary/20 disabled:opacity-50 transition-colors"
              >
                {summaryLoading ? "Generating…" : "Generate →"}
              </button>
            )}
          </div>
          {summary
            ? <p className="text-sm text-muted leading-relaxed whitespace-pre-wrap">{summary}</p>
            : <p className="text-sm text-muted">Click Generate to produce an AI-written summary of this dataset.</p>
          }
        </div>
      )}

      {/* Charts */}
      {analytics.charts && analytics.charts.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Analytics</p>
          {analytics.charts.map((chart: ChartData) => (
            <ChartBlock key={chart.id} chart={chart} />
          ))}
        </div>
      )}

      {/* Data preview */}
      <div className="rounded-theme bg-surface border border-white/10 p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Data Preview</p>
          <button
            onClick={loadPreview}
            className="text-xs text-primary hover:underline"
          >
            {showPreview ? "Refresh" : "Load 10 rows"}
          </button>
        </div>
        {showPreview && recordPreview.length > 0 && (
          <div className="overflow-x-auto chart-scroll">
            <table className="w-full text-xs min-w-max">
              <thead>
                <tr className="border-b border-white/8">
                  {Object.keys(recordPreview[0]).slice(0, 8).map(k => (
                    <th key={k} className="text-left py-2 px-3 text-muted font-mono font-normal">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recordPreview.map((row, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/4">
                    {Object.values(row).slice(0, 8).map((v, j) => (
                      <td key={j} className="py-2 px-3 text-muted truncate max-w-[180px]">
                        {String(v ?? "").slice(0, 60)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {showPreview && recordPreview.length === 0 && (
          <p className="text-sm text-muted">No records found.</p>
        )}
      </div>

      {/* Export + actions */}
      <div className="flex flex-wrap gap-3 items-center">
        {successfulSession && (
          <>
            <a
              href={exportUDERecordsUrl(session.id, "json")}
              target="_blank" rel="noreferrer"
              className="px-4 py-2 rounded-theme border border-white/15 text-sm hover:bg-white/5 transition-colors"
            >
              ↓ Export JSON
            </a>
            <a
              href={exportUDERecordsUrl(session.id, "csv")}
              target="_blank" rel="noreferrer"
              className="px-4 py-2 rounded-theme border border-white/15 text-sm hover:bg-white/5 transition-colors"
            >
              ↓ Export CSV
            </a>
            <a
              href={getUDEReportPdfUrl(session.id)}
              target="_blank" rel="noreferrer"
              className="px-4 py-2 rounded-theme border border-white/15 text-sm hover:bg-white/5 transition-colors flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              PDF Report
            </a>
            {!blogResult ? (
              <button
                onClick={handleGenerateBlog}
                disabled={blogLoading}
                className="px-4 py-2 rounded-theme border border-primary/40 text-primary text-sm hover:bg-primary/10 disabled:opacity-50 transition-colors"
              >
                {blogLoading ? "Writing blog…" : "✍ Generate Blog Post"}
              </button>
            ) : (
              <a
                href={`/blog/${blogResult.slug}`}
                className="px-4 py-2 rounded-theme bg-primary/10 border border-primary/40 text-primary text-sm hover:bg-primary/20 transition-colors"
              >
                View blog post →
              </a>
            )}
          </>
        )}

        <button
          onClick={async () => { setDeleting(true); try { await onDelete(); } finally { setDeleting(false); } }}
          disabled={deleting}
          className="px-4 py-2 rounded-theme border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10 disabled:opacity-50 transition-colors ml-auto"
        >
          {deleting ? "Deleting…" : "Delete Session"}
        </button>
      </div>
    </div>
  );
}

// ── Storage stats ─────────────────────────────────────────────────────────────

function StorageStats() {
  const [stats, setStats] = useState<{ s3_blob_count: number; mongodb_doc_count: number; postgres_session_count: number } | null>(null);

  useEffect(() => {
    getUDEStorageStats().then(setStats).catch(() => {});
  }, []);

  if (!stats) return null;

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {[
        { label: "Sessions",    value: stats.postgres_session_count, icon: "📋" },
        { label: "S3 Blobs",   value: stats.s3_blob_count,           icon: "☁️" },
        { label: "MongoDB Docs", value: stats.mongodb_doc_count,     icon: "🗄️" },
      ].map(s => (
        <div key={s.label} className="rounded-theme bg-surface border border-white/10 p-4 text-center">
          <div className="text-2xl mb-1">{s.icon}</div>
          <div className="text-2xl font-bold text-primary">{s.value.toLocaleString()}</div>
          <div className="text-xs text-muted mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── How It Works ──────────────────────────────────────────────────────────────

function HowItWorks() {
  const [open, setOpen] = useState(false);

  const steps = [
    { num: "01", title: "Choose Source Type", body: "Pick Auto-detect, Web Page, JSON API, CSV URL, Kaggle dataset, or paste raw data. Auto-detect works for most public URLs by probing the content-type." },
    { num: "02", title: "Set Extraction Goal", body: 'Describe what you want in plain English — e.g. "Extract product names, prices, and ratings". The more specific, the better the LLM schema normalisation.' },
    { num: "03", title: "Fetch + Save Raw to S3", body: "The engine fetches the source (Playwright for JS-heavy pages) and immediately uploads the raw content to AWS S3 before any processing — preserving the original." },
    { num: "04", title: "LLM Schema Normalisation", body: "Groq AI (llama-3.3-70b-versatile) analyses sample records and proposes a unified snake_case schema. All rows are mapped to consistent field names." },
    { num: "05", title: "Store in Postgres + MongoDB", body: "Normalised records are written to PostgreSQL for structured queries and mirrored to MongoDB (raybags_ude database) for flexible document access." },
    { num: "06", title: "Analytics + Export", body: "Numeric fields get distribution histograms; categorical fields get bar/pie charts. Export as JSON or CSV, or let AI write a blog post from the findings." },
  ];

  const tech = ["Python / FastAPI", "Playwright", "BeautifulSoup4", "Groq AI (llama-3.3-70b)", "AWS S3", "MongoDB", "PostgreSQL", "Next.js / Recharts"];

  return (
    <div className="mt-10 rounded-theme bg-surface border border-white/10 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <div>
          <h2 className="font-semibold text-base">How It Works</h2>
          <p className="text-xs text-muted mt-0.5">Architecture, pipeline, and tech stack</p>
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

// ── Chart block ───────────────────────────────────────────────────────────────

function ChartBlock({ chart }: { chart: ChartData }) {
  const xKey = (chart as ChartData & { x_key?: string }).x_key || "label";
  const yKey = (chart as ChartData & { y_key?: string }).y_key || "value";
  const needsScroll = chart.type !== "pie" && chart.data.length > 10;
  const dynamicWidth = Math.max(chart.data.length * 54, 320);

  const tooltipStyle = {
    background: "var(--color-surface)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    fontSize: 12,
  };

  return (
    <div className="rounded-theme bg-surface border border-white/10 p-5">
      <h4 className="text-sm font-semibold mb-4">{chart.title}</h4>

      {chart.type === "pie" ? (
        <div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={chart.data}
                dataKey={yKey}
                nameKey={xKey}
                cx="50%" cy="50%"
                outerRadius={108}
                innerRadius={46}
                paddingAngle={2}
                labelLine={false}
              >
                {chart.data.map((_: unknown, i: number) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "var(--color-fg)" }} itemStyle={{ color: "var(--color-primary)" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-3 px-2">
            {chart.data.map((entry: Record<string, unknown>, i: number) => (
              <div key={i} className="flex items-center gap-1.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="text-xs truncate text-muted">{String(entry[xKey] ?? "")}</span>
              </div>
            ))}
          </div>
        </div>
      ) : chart.type === "line" ? (
        <div className={needsScroll ? "overflow-x-auto chart-scroll" : ""}>
          <div style={{ width: needsScroll ? dynamicWidth : "100%", minWidth: "100%" }}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chart.data} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "var(--color-muted)" }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={40} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "var(--color-fg)" }} itemStyle={{ color: "var(--color-primary)" }} />
                <Line type="monotone" dataKey={yKey} stroke="var(--color-primary)" strokeWidth={2} dot={{ fill: "var(--color-primary)", r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className={needsScroll ? "overflow-x-auto chart-scroll" : ""}>
          <div style={{ width: needsScroll ? dynamicWidth : "100%", minWidth: "100%" }}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chart.data} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "var(--color-muted)" }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={40} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "var(--color-fg)" }} itemStyle={{ color: "var(--color-primary)" }} />
                <Bar dataKey={yKey} radius={[4, 4, 0, 0]} maxBarSize={52}>
                  {chart.data.map((_: unknown, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
