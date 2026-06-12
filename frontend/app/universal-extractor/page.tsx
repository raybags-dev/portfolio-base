"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from "recharts";
import {
  createUDESession,
  getUDESession,
  runUDESession,
  deleteUDESession,
  listUDESessions,
  generateUDESummary,
  exportUDERecordsUrl,
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
  { id: "auto", label: "Auto-detect", icon: "🔍", hint: "Let the engine figure it out" },
  { id: "html", label: "Web Page", icon: "🌐", hint: "Any HTML page (static or JS-heavy)" },
  { id: "api", label: "JSON API", icon: "⚙️", hint: "REST/GraphQL endpoint returning JSON" },
  { id: "csv", label: "CSV URL", icon: "📊", hint: "Direct link to a CSV file" },
  { id: "kaggle", label: "Kaggle", icon: "🏆", hint: "kaggle://owner/dataset-slug" },
  { id: "text", label: "Paste Data", icon: "📋", hint: "Paste raw CSV or JSON directly" },
];

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
        const s = await getUDESession(sessionId);
        setActiveSession(s);
        if (s.status === "done") { setStep("results"); stopPolling(); }
        if (s.status === "failed") { stopPolling(); }
      } catch { stopPolling(); }
    }, 2500);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function loadHistory() {
    try { setSessions(await listUDESessions()); } catch { /* ignore */ }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!sourceUrl.trim()) { setFormError("Source URL or data is required."); return; }
    const ack = typeof window !== "undefined" && localStorage.getItem(DISCLAIMER_KEY);
    if (!ack) { setShowDisclaimer(true); return; }
    await doSubmit();
  }

  async function doSubmit(contact?: RunContactInfo) {
    setShowDisclaimer(false);
    setSubmitting(true);
    try {
      let headers: Record<string, string> = {};
      if (customHeaders.trim()) {
        try { headers = JSON.parse(customHeaders); } catch { setFormError("Custom headers must be valid JSON."); setSubmitting(false); return; }
      }

      const session = await createUDESession({
        name: name.trim() || `Extraction — ${new Date().toLocaleString()}`,
        source_url: sourceUrl.trim(),
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

  function reset() {
    stopPolling();
    setStep("configure");
    setActiveSession(null);
    setSourceUrl(""); setName(""); setFormError(""); setSubmitting(false);
    setCustomHeaders(""); setSourceType("auto");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Universal Data Extractor</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Point it at any URL, API, CSV, or Kaggle dataset — auto-detect, extract, normalise, analyse.
              </p>
            </div>
            <button
              onClick={() => { setShowHistory(h => !h); loadHistory(); }}
              className="text-sm text-muted-foreground hover:text-foreground border border-border rounded px-3 py-1.5"
            >
              {showHistory ? "Hide History" : "History"}
            </button>
          </div>

          {showHistory && sessions.length > 0 && (
            <div className="mt-4 border border-border rounded-lg overflow-hidden">
              <div className="divide-y divide-border">
                {sessions.slice(0, 10).map(s => (
                  <button key={s.id} onClick={() => { setActiveSession(s); setStep(s.status === "done" || s.status === "failed" ? "results" : "running"); setShowHistory(false); s.status === "running" && startPolling(s.id); }}
                    className="w-full text-left px-4 py-3 hover:bg-accent/30 flex items-center justify-between text-sm">
                    <span className="font-medium truncate max-w-xs">{s.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === "done" ? "bg-green-500/20 text-green-400" : s.status === "failed" ? "bg-red-500/20 text-red-400" : s.status === "running" ? "bg-blue-500/20 text-blue-400 animate-pulse" : "bg-muted text-muted-foreground"}`}>
                      {s.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Token modal */}
        {tokenModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <form onSubmit={handleTokenSubmit} className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-lg">
              <h2 className="font-semibold mb-2">Access Token Required</h2>
              <p className="text-sm text-muted-foreground mb-4">Enter your one-time token to run this extraction.</p>
              <input type="text" value={tokenInput} onChange={e => setTokenInput(e.target.value)}
                placeholder="Paste token…" className="w-full bg-background border border-border rounded px-3 py-2 text-sm mb-3 font-mono" />
              {tokenError && <p className="text-sm text-red-400 mb-3">{tokenError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={tokenSubmitting || !tokenInput.trim()}
                  className="flex-1 bg-primary text-primary-foreground rounded py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">
                  {tokenSubmitting ? "Verifying…" : "Run Extraction"}
                </button>
                <button type="button" onClick={() => { setTokenModal(null); setTokenInput(""); setSubmitting(false); }}
                  className="px-4 py-2 rounded border border-border text-sm hover:bg-accent/30">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Disclaimer */}
        {showDisclaimer && (
          <RunProjectDisclaimer
            projectName="Universal Data Extractor"
            onRun={(c) => { if (typeof window !== "undefined") localStorage.setItem(DISCLAIMER_KEY, "1"); doSubmit(c); }}
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
          />
        )}

        {step === "running" && activeSession && (
          <RunningStep session={activeSession} />
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
      </div>
    </main>
  );
}

// ── Configure step ────────────────────────────────────────────────────────────

function ConfigureStep({
  name, setName, sourceUrl, setSourceUrl, sourceType, setSourceType,
  prompt, setPrompt, maxRecords, setMaxRecords, maxPages, setMaxPages,
  customHeaders, setCustomHeaders,
  showAdvanced, setShowAdvanced,
  formError, submitting, onSubmit,
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
}) {
  const selectedType = SOURCE_TYPES.find(t => t.id === sourceType)!;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="border border-border rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5">Source Type</label>
          <div className="grid grid-cols-3 gap-2">
            {SOURCE_TYPES.map(t => (
              <button key={t.id} type="button"
                onClick={() => setSourceType(t.id)}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-sm transition-colors ${sourceType === t.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50 text-muted-foreground"}`}>
                <span className="text-lg">{t.icon}</span>
                <span className="font-medium">{t.label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">{selectedType.hint}</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            {sourceType === "text" ? "Paste Raw Data (CSV or JSON)" : sourceType === "kaggle" ? "Kaggle Dataset Ref (e.g. kaggle://owner/dataset-slug)" : "Source URL"}
          </label>
          {sourceType === "text" ? (
            <textarea value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} rows={6}
              placeholder='[{"name":"Alice","age":30},{"name":"Bob","age":25}]'
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono resize-y" />
          ) : (
            <input type={sourceType === "kaggle" ? "text" : "url"} value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}
              placeholder={sourceType === "kaggle" ? "kaggle://owner/dataset-slug" : "https://example.com/data"}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Extraction Goal</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={2}
            placeholder="Describe what data to extract and which fields matter most…"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Name (optional)
          </label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="My extraction session"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Max Records: {maxRecords.toLocaleString()}</label>
          <input type="range" min={50} max={5000} step={50} value={maxRecords} onChange={e => setMaxRecords(Number(e.target.value))}
            className="w-full accent-primary" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>50</span><span>5 000</span></div>
        </div>

        {/* Advanced */}
        <div>
          <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <span>{showAdvanced ? "▾" : "▸"}</span> Advanced options
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-4 pl-4 border-l border-border">
              {(sourceType === "html" || sourceType === "auto") && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Max Pages (for HTML crawl): {maxPages}</label>
                  <input type="range" min={1} max={20} value={maxPages} onChange={e => setMaxPages(Number(e.target.value))}
                    className="w-full accent-primary" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1.5">Custom Request Headers (JSON)</label>
                <textarea value={customHeaders} onChange={e => setCustomHeaders(e.target.value)} rows={3}
                  placeholder='{"Authorization": "Bearer token", "Accept": "application/json"}'
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono resize-none" />
              </div>
            </div>
          )}
        </div>
      </div>

      {formError && <p className="text-sm text-red-400">{formError}</p>}

      <button type="submit" disabled={submitting}
        className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity">
        {submitting ? "Starting extraction…" : "Extract & Analyse →"}
      </button>
    </form>
  );
}

// ── Running step ─────────────────────────────────────────────────────────────

function RunningStep({ session }: { session: UDESession }) {
  const progress = session.progress || {};
  const log: string[] = progress.log || [];
  const isFailed = session.status === "failed";

  return (
    <div className="border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        {!isFailed ? (
          <span className="h-3 w-3 rounded-full bg-blue-400 animate-pulse" />
        ) : (
          <span className="h-3 w-3 rounded-full bg-red-400" />
        )}
        <h2 className="font-semibold">{isFailed ? "Extraction Failed" : "Extracting…"}</h2>
        {progress.records_collected != null && (
          <span className="ml-auto text-sm text-muted-foreground">{progress.records_collected.toLocaleString()} records</span>
        )}
      </div>

      {progress.source_type_detected && (
        <div className="text-xs text-muted-foreground">Detected: <span className="text-foreground font-mono">{progress.source_type_detected}</span></div>
      )}

      {isFailed && session.error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
          {session.error}
        </div>
      )}

      <div className="bg-black/20 rounded-lg p-3 max-h-60 overflow-y-auto font-mono text-xs space-y-1">
        {log.length === 0 && <span className="text-muted-foreground">Initialising…</span>}
        {log.map((line, i) => (
          <div key={i} className="text-muted-foreground">{line}</div>
        ))}
        {!isFailed && log.length > 0 && (
          <div className="text-blue-400 animate-pulse">▌</div>
        )}
      </div>
    </div>
  );
}

// ── Results step ─────────────────────────────────────────────────────────────

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
  const isFailed = session.status === "failed";
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState(
    (session.analytics_result as Record<string, unknown> & { summary?: string } | null)?.summary || ""
  );
  const [deleting, setDeleting] = useState(false);
  const [recordPreview, setRecordPreview] = useState<Record<string, unknown>[]>([]);
  const [showPreview, setShowPreview] = useState(false);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{session.name}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className={`inline-flex items-center gap-1.5 font-medium ${isFailed ? "text-red-400" : "text-green-400"}`}>
              <span className={`h-2 w-2 rounded-full ${isFailed ? "bg-red-400" : "bg-green-400"}`} />
              {isFailed ? "failed" : "complete"}
            </span>
            {" · "}{(progress.records_collected ?? analytics.total_records ?? 0).toLocaleString()} records
            {session.source_type_detected && ` · ${session.source_type_detected}`}
          </p>
        </div>
        <button onClick={onReset} className="text-sm text-muted-foreground hover:text-foreground border border-border rounded px-3 py-1.5">
          ← New Extraction
        </button>
      </div>

      {isFailed && session.error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-300">
          {session.error}
        </div>
      )}

      {/* Schema info */}
      {session.schema_detected && Object.keys(session.schema_detected).length > 0 && (
        <div className="border border-border rounded-xl p-4">
          <h3 className="text-sm font-medium mb-2 text-muted-foreground">Detected Schema</h3>
          <div className="flex flex-wrap gap-2">
            {Object.keys(session.schema_detected).map(k => (
              <span key={k} className="bg-primary/10 text-primary text-xs px-2 py-1 rounded font-mono">{k}</span>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {!isFailed && (
        <div className="border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">AI Insights Summary</h3>
            {!summary && (
              <button onClick={handleSummary} disabled={summaryLoading}
                className="text-xs bg-primary/10 text-primary px-3 py-1 rounded hover:bg-primary/20 disabled:opacity-50">
                {summaryLoading ? "Generating…" : "Generate →"}
              </button>
            )}
          </div>
          {summary && <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{summary}</p>}
        </div>
      )}

      {/* Charts */}
      {analytics.charts && analytics.charts.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold">Analytics</h3>
          {analytics.charts.map((chart: ChartData) => (
            <ChartBlock key={chart.id} chart={chart} />
          ))}
        </div>
      )}

      {/* Data preview */}
      <div className="border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Data Preview</h3>
          <button onClick={loadPreview} className="text-xs text-primary hover:underline">
            {showPreview ? "Refresh" : "Load preview (10 rows)"}
          </button>
        </div>
        {showPreview && recordPreview.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {Object.keys(recordPreview[0]).slice(0, 8).map(k => (
                    <th key={k} className="text-left py-1.5 px-2 text-muted-foreground font-mono">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recordPreview.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-accent/10">
                    {Object.values(row).slice(0, 8).map((v, j) => (
                      <td key={j} className="py-1.5 px-2 text-muted-foreground truncate max-w-[160px]">
                        {String(v ?? "").slice(0, 60)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Export + actions */}
      {!isFailed && (
        <div className="flex flex-wrap gap-3">
          <a href={exportUDERecordsUrl(session.id, "json")} target="_blank" rel="noreferrer"
            className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent/30">
            ↓ Export JSON
          </a>
          <a href={exportUDERecordsUrl(session.id, "csv")} target="_blank" rel="noreferrer"
            className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent/30">
            ↓ Export CSV
          </a>
          <button onClick={async () => { setDeleting(true); try { await onDelete(); } finally { setDeleting(false); } }}
            disabled={deleting}
            className="px-4 py-2 rounded-lg border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10 disabled:opacity-50 ml-auto">
            {deleting ? "Deleting…" : "Delete Session"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Chart block ───────────────────────────────────────────────────────────────

function ChartBlock({ chart }: { chart: ChartData }) {
  const xKey = (chart as ChartData & { x_key?: string }).x_key || "label";
  const yKey = (chart as ChartData & { y_key?: string }).y_key || "value";

  return (
    <div className="border border-border rounded-xl p-4">
      <h4 className="text-sm font-medium mb-4">{chart.title}</h4>
      {chart.type === "pie" ? (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={chart.data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" outerRadius={90} label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}>
              {chart.data.map((_: unknown, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      ) : chart.type === "line" ? (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey={yKey} stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey={yKey} radius={[4, 4, 0, 0]}>
              {chart.data.map((_: unknown, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
