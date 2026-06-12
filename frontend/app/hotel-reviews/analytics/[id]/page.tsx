"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line,
} from "recharts";
import {
  getCrawlSession,
  deleteCrawlSession,
  exportCrawlRecordsUrl,
  previewCrawlRecords,
  type CrawlSession,
  type ChartData,
  type AnalyticsResult,
} from "@/lib/api";

const COLORS = ["#6366f1","#8b5cf6","#a78bfa","#c4b5fd","#4f46e5","#7c3aed","#ddd6fe","#ede9fe"];

export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = Number(id);

  const [session, setSession] = useState<CrawlSession | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getCrawlSession(sessionId);
      setSession(s);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!confirm("Delete this session and all collected records? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteCrawlSession(sessionId);
      router.push("/hotel-reviews");
    } catch {
      setDeleting(false);
    }
  }

  async function handlePreview() {
    if (preview) { setShowPreview(v => !v); return; }
    const data = await previewCrawlRecords(sessionId);
    setPreview(data);
    setShowPreview(true);
  }

  if (loading) return <div className="min-h-screen bg-bg text-muted flex items-center justify-center text-sm">Loading…</div>;
  if (!session) return <div className="min-h-screen bg-bg text-muted flex items-center justify-center text-sm">Session not found.</div>;

  const analytics: AnalyticsResult = session.analytics_result || {};
  const charts = analytics.charts || [];
  const progress = session.progress || {};

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Header */}
      <header className="border-b border-white/10 bg-surface/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/hotel-reviews" className="text-muted hover:text-text text-sm">← Crawler</a>
            <span className="text-white/20">|</span>
            <h1 className="font-heading font-bold text-lg truncate max-w-xs">{session.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              session.status === "done" ? "bg-green-500/20 text-green-400"
              : session.status === "failed" ? "bg-red-500/20 text-red-400"
              : "bg-yellow-500/20 text-yellow-400"
            }`}>{session.status}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePreview} className="text-sm border border-white/15 rounded-theme px-3 py-1.5 hover:bg-white/5">
              {showPreview ? "Hide JSON" : "View Data"}
            </button>
            <a
              href={exportCrawlRecordsUrl(sessionId)}
              download
              className="text-sm border border-white/15 rounded-theme px-3 py-1.5 hover:bg-white/5"
            >
              Download JSON
            </a>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-sm border border-red-500/30 text-red-400 rounded-theme px-3 py-1.5 hover:bg-red-500/10 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">

        {/* Dataset reference card */}
        <section className="rounded-theme bg-surface border border-white/10 p-5 grid sm:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-1">Source</div>
            <a href={session.target_url} target="_blank" rel="noopener noreferrer" className="text-primary text-sm break-all hover:underline">
              {session.target_url}
            </a>
          </div>
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-1">Collection Goal</div>
            <p className="text-sm">{session.collection_prompt}</p>
          </div>
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-1">Fields Found</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {(analytics.fields_found || []).map(f => (
                <span key={f} className="text-xs font-mono bg-white/10 px-2 py-0.5 rounded">{f}</span>
              ))}
              {!analytics.fields_found?.length && <span className="text-xs text-muted">—</span>}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-1">Crawl Settings</div>
            <p className="text-sm text-muted">{session.max_pages} page(s) · {progress.records_collected ?? analytics.total_records ?? 0} records</p>
          </div>
        </section>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Records", value: analytics.total_records ?? progress.records_collected ?? 0 },
            { label: "Charts", value: charts.length },
            { label: "Fields", value: analytics.fields_found?.length ?? 0 },
            { label: "Highly Rated", value: analytics.high_rated_count ?? "—" },
          ].map(s => (
            <div key={s.label} className="rounded-theme bg-surface border border-white/10 p-4 text-center">
              <div className="text-3xl font-bold text-primary">{s.value}</div>
              <div className="text-xs text-muted mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* JSON preview drawer */}
        {showPreview && preview && (
          <section className="rounded-theme bg-surface border border-white/10 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                Data Preview — first {preview.length} records
              </span>
              <button onClick={() => setShowPreview(false)} className="text-muted text-xs hover:text-white">close</button>
            </div>
            <div className="h-80 overflow-auto p-4">
              <pre className="text-xs font-mono text-muted/80 whitespace-pre-wrap">
                {JSON.stringify(preview, null, 2)}
              </pre>
            </div>
          </section>
        )}

        {/* Summary stats table */}
        {analytics.summary_stats && Object.keys(analytics.summary_stats).length > 0 && (
          <section className="rounded-theme bg-surface border border-white/10 p-5">
            <h2 className="font-semibold mb-3">Summary Statistics</h2>
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
          </section>
        )}

        {/* Error state */}
        {analytics.error && (
          <div className="rounded-theme bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 text-sm">
            {analytics.error}
          </div>
        )}

        {/* Charts */}
        {charts.map(chart => <ChartPanel key={chart.id} chart={chart} />)}

        {!charts.length && !analytics.error && (
          <div className="rounded-theme bg-surface border border-white/10 p-10 text-center text-muted">
            <p className="text-lg mb-2">No charts yet</p>
            <p className="text-sm">Analytics run automatically when the crawl finishes. If no charts appear, the collected data may not contain enough numeric fields (price, rating, etc.).</p>
          </div>
        )}
      </main>
    </div>
  );
}

function ChartPanel({ chart }: { chart: ChartData }) {
  if (!chart.data || chart.data.length === 0) return null;
  return (
    <section className="rounded-theme bg-surface border border-white/10 p-5">
      <h3 className="font-semibold mb-4">{chart.title}</h3>
      {chart.type === "bar"  && <BarView  data={chart.data} />}
      {chart.type === "pie"  && <PieView  data={chart.data} />}
      {chart.type === "line" && <LineView data={chart.data} />}
    </section>
  );
}

function BarView({ data }: { data: Record<string, unknown>[] }) {
  const numKeys = Object.keys(data[0] || {}).filter(k => typeof data[0][k] === "number");
  const labelKey = Object.keys(data[0] || {}).find(k => typeof data[0][k] === "string") || "name";
  const valueKey = numKeys[0] || "count";
  const needsScroll = data.length > 10;
  const dynamicWidth = Math.max(data.length * 56, 320);
  return (
    <div className={needsScroll ? "overflow-x-auto chart-scroll" : ""}>
      <div style={{ width: needsScroll ? dynamicWidth : "100%", minWidth: "100%" }}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey={labelKey} tick={{ fill: "var(--color-muted)", fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis tick={{ fill: "var(--color-muted)", fontSize: 11 }} width={40} />
            <Tooltip
              contentStyle={{ background: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "var(--color-fg)" }}
              itemStyle={{ color: "var(--color-primary)" }}
            />
            <Bar dataKey={valueKey} fill="var(--color-primary)" radius={[3,3,0,0]} maxBarSize={48} />
            {numKeys[1] && <Bar dataKey={numKeys[1]} fill="var(--color-secondary)" radius={[3,3,0,0]} maxBarSize={48} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PieView({ data }: { data: Record<string, unknown>[] }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            cx="50%" cy="50%"
            outerRadius={110}
            innerRadius={48}
            dataKey="value"
            nameKey="name"
            paddingAngle={2}
            labelLine={false}
          >
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--color-fg)" }}
            itemStyle={{ color: "var(--color-primary)" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-3 px-2">
        {data.map((entry, i) => (
          <div key={i} className="flex items-center gap-1.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="text-xs truncate" style={{ color: "var(--color-muted)" }}>{String(entry.name ?? "")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineView({ data }: { data: Record<string, unknown>[] }) {
  const labelKey = Object.keys(data[0] || {}).find(k => typeof data[0][k] === "string") || "period";
  const valueKey = Object.keys(data[0] || {}).find(k => typeof data[0][k] === "number") || "count";
  const needsScroll = data.length > 14;
  const dynamicWidth = Math.max(data.length * 48, 320);
  return (
    <div className={needsScroll ? "overflow-x-auto chart-scroll" : ""}>
      <div style={{ width: needsScroll ? dynamicWidth : "100%", minWidth: "100%" }}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey={labelKey} tick={{ fill: "var(--color-muted)", fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis tick={{ fill: "var(--color-muted)", fontSize: 11 }} width={40} />
            <Tooltip
              contentStyle={{ background: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "var(--color-fg)" }}
              itemStyle={{ color: "var(--color-primary)" }}
            />
            <Line type="monotone" dataKey={valueKey} stroke="var(--color-primary)" strokeWidth={2} dot={{ fill: "var(--color-primary)", r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
