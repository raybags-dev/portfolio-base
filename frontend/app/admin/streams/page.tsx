"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/lib/store";
import {
  getStreamStats,
  listStreamTopics,
  createStreamTopic,
  deleteStreamTopic,
  getTopicEvents,
  publishStreamEvent,
  listAlertRules,
  createAlertRule,
  deleteAlertRule,
  listFiredAlerts,
  getStreamSseUrl,
  type StreamTopic,
  type StreamEvent,
  type AlertRule,
  type AlertFired,
  type StreamStats,
} from "@/lib/api";

const TABS = ["Topics", "Live Feed", "Alert Rules", "Fired Alerts"] as const;
type Tab = (typeof TABS)[number];

const OP_LABELS: Record<string, string> = {
  lt: "< less than",
  gt: "> greater than",
  eq: "= equals",
  ne: "≠ not equals",
  contains: "contains",
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface border border-white/10 rounded-theme p-4 flex flex-col gap-1">
      <p className="text-xs text-muted uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-bold text-primary">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function LiveDot({ active }: { active: boolean }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{
        background: active ? "#22c55e" : "#6b7280",
        boxShadow: active ? "0 0 6px #22c55e" : "none",
        animation: active ? "pulse 1.4s ease-in-out infinite" : "none",
      }}
    />
  );
}

export default function StreamsAdminPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("Topics");
  const [stats, setStats] = useState<StreamStats | null>(null);
  const [topics, setTopics] = useState<StreamTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [topicEvents, setTopicEvents] = useState<StreamEvent[]>([]);
  const [liveEvents, setLiveEvents] = useState<StreamEvent[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [fired, setFired] = useState<AlertFired[]>([]);
  const [error, setError] = useState("");

  // Create topic form
  const [newTopic, setNewTopic] = useState({ name: "", description: "", source_key: "" });
  const [creatingTopic, setCreatingTopic] = useState(false);

  // Publish form
  const [pubTopic, setPubTopic] = useState("");
  const [pubPayload, setPubPayload] = useState('{\n  "message": "test"\n}');
  const [pubError, setPubError] = useState("");

  // Alert rule form
  const [ruleForm, setRuleForm] = useState({
    topic_name: "", label: "", field_path: "", operator: "lt", threshold: "", enabled: true,
  });
  const [ruleError, setRuleError] = useState("");

  const sseRef = useRef<EventSource | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    try {
      const [s, t, r, f] = await Promise.all([
        getStreamStats(), listStreamTopics(), listAlertRules(), listFiredAlerts(),
      ]);
      setStats(s); setTopics(t); setRules(r); setFired(f);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (selectedTopic) {
      getTopicEvents(selectedTopic).then(setTopicEvents).catch(() => setTopicEvents([]));
    }
  }, [selectedTopic]);

  // ── SSE connection ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "Live Feed") {
      sseRef.current?.close();
      sseRef.current = null;
      setSseConnected(false);
      return;
    }
    const url = getStreamSseUrl(selectedTopic ?? undefined);
    const es = new EventSource(url);
    sseRef.current = es;
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as StreamEvent;
        setLiveEvents((prev) => [ev, ...prev].slice(0, 200));
      } catch { /* ignore */ }
    };
    return () => { es.close(); setSseConnected(false); };
  }, [tab, selectedTopic]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function handleCreateTopic() {
    if (!newTopic.name.trim()) return;
    setCreatingTopic(true);
    try {
      await createStreamTopic(token!, { ...newTopic });
      setNewTopic({ name: "", description: "", source_key: "" });
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreatingTopic(false);
    }
  }

  async function handleDeleteTopic(name: string) {
    if (!confirm(`Delete topic "${name}" and all its events?`)) return;
    try {
      await deleteStreamTopic(token!, name);
      if (selectedTopic === name) setSelectedTopic(null);
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function handlePublish() {
    setPubError("");
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(pubPayload); } catch { setPubError("Invalid JSON"); return; }
    if (!pubTopic.trim()) { setPubError("Topic required"); return; }
    try {
      await publishStreamEvent(token!, pubTopic, payload);
    } catch (e: unknown) {
      setPubError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function handleCreateRule() {
    setRuleError("");
    if (!ruleForm.topic_name || !ruleForm.label || !ruleForm.field_path || !ruleForm.threshold) {
      setRuleError("All fields required"); return;
    }
    try {
      await createAlertRule(token!, { ...ruleForm });
      setRuleForm({ topic_name: "", label: "", field_path: "", operator: "lt", threshold: "", enabled: true });
      await reload();
    } catch (e: unknown) {
      setRuleError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function handleDeleteRule(id: number) {
    try { await deleteAlertRule(token!, id); await reload(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  const INPUT = "w-full bg-bg border border-white/15 rounded-theme px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:border-primary/60 transition-colors";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Stream Pipeline</h1>
          <p className="text-sm text-muted mt-0.5">
            Real-time event bus — Kafka-ready, SSE delivery, alert rules
          </p>
        </div>
        <button onClick={reload} className="text-xs text-muted hover:text-fg border border-white/10 px-3 py-1.5 rounded-theme transition-colors">
          Refresh
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-theme px-4 py-3">
          {error}
          <button onClick={() => setError("")} className="ml-3 text-xs underline">dismiss</button>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Topics" value={stats.total_topics} />
          <StatCard label="Events stored" value={stats.total_events.toLocaleString()} />
          <StatCard label="Active rules" value={stats.active_rules} />
          <StatCard label="Alerts fired" value={stats.alerts_fired} />
          <StatCard
            label="Kafka"
            value={stats.kafka_available ? "Connected" : "In-process"}
            sub={stats.kafka_available ? "Redpanda / Kafka broker" : "Set KAFKA_BOOTSTRAP_SERVERS to enable"}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              tab === t ? "border-primary text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Topics tab ──────────────────────────────────────────────────────── */}
      {tab === "Topics" && (
        <div className="space-y-6">
          {/* Create */}
          <div className="bg-surface border border-white/10 rounded-theme p-4 space-y-3">
            <p className="text-sm font-medium">New topic</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input className={INPUT} placeholder="name (e.g. news.raw)" value={newTopic.name}
                onChange={(e) => setNewTopic((p) => ({ ...p, name: e.target.value }))} />
              <input className={INPUT} placeholder="description (optional)" value={newTopic.description}
                onChange={(e) => setNewTopic((p) => ({ ...p, description: e.target.value }))} />
              <input className={INPUT} placeholder="source_key (optional)" value={newTopic.source_key}
                onChange={(e) => setNewTopic((p) => ({ ...p, source_key: e.target.value }))} />
            </div>
            <button onClick={handleCreateTopic} disabled={creatingTopic || !newTopic.name.trim()}
              className="bg-primary text-white text-sm px-4 py-2 rounded-theme disabled:opacity-50">
              {creatingTopic ? "Creating…" : "Create topic"}
            </button>
          </div>

          {/* List */}
          <div className="space-y-2">
            {topics.length === 0 && <p className="text-sm text-muted">No topics yet. Create one above or run a <code>streams.ingest</code> scheduler job.</p>}
            {topics.map((t) => (
              <div key={t.name}
                className={`flex items-center justify-between bg-surface border rounded-theme px-4 py-3 cursor-pointer transition-colors ${
                  selectedTopic === t.name ? "border-primary/60" : "border-white/10 hover:border-white/20"
                }`}
                onClick={() => setSelectedTopic(t.name === selectedTopic ? null : t.name)}
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium font-mono">{t.name}</p>
                  {t.description && <p className="text-xs text-muted">{t.description}</p>}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted">
                  <span>{t.event_count.toLocaleString()} events</span>
                  {t.last_event_at && <span>{new Date(t.last_event_at).toLocaleString()}</span>}
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteTopic(t.name); }}
                    className="text-red-400/60 hover:text-red-400 transition-colors">×</button>
                </div>
              </div>
            ))}
          </div>

          {/* Selected topic events preview */}
          {selectedTopic && (
            <div className="bg-surface border border-white/10 rounded-theme p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium font-mono">{selectedTopic} — recent events</p>
                <button onClick={() => getTopicEvents(selectedTopic).then(setTopicEvents)}
                  className="text-xs text-muted hover:text-fg">reload</button>
              </div>
              {topicEvents.length === 0
                ? <p className="text-xs text-muted">No events yet</p>
                : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {topicEvents.map((ev) => (
                      <div key={ev.id} className="bg-bg rounded-theme p-3 font-mono text-xs text-fg/80 space-y-1">
                        <p className="text-muted">{ev.ts ? new Date(ev.ts).toLocaleString() : "—"} · event #{ev.id}</p>
                        <pre className="whitespace-pre-wrap break-all">
                          {JSON.stringify(ev.payload, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}

          {/* Publish (manual test) */}
          <div className="bg-surface border border-white/10 rounded-theme p-4 space-y-3">
            <p className="text-sm font-medium">Publish test event</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input className={INPUT} placeholder="topic name" value={pubTopic}
                onChange={(e) => setPubTopic(e.target.value)} />
              <textarea className={INPUT} rows={4} value={pubPayload}
                onChange={(e) => setPubPayload(e.target.value)} />
            </div>
            {pubError && <p className="text-xs text-red-400">{pubError}</p>}
            <button onClick={handlePublish} className="bg-primary text-white text-sm px-4 py-2 rounded-theme">
              Publish
            </button>
          </div>
        </div>
      )}

      {/* ── Live Feed tab ────────────────────────────────────────────────────── */}
      {tab === "Live Feed" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <LiveDot active={sseConnected} />
            <span className="text-sm text-muted">{sseConnected ? "Connected — receiving events" : "Connecting…"}</span>
            <select className="ml-auto bg-bg border border-white/15 rounded-theme px-3 py-1.5 text-sm text-fg"
              value={selectedTopic ?? ""}
              onChange={(e) => setSelectedTopic(e.target.value || null)}>
              <option value="">All topics</option>
              {topics.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
            <button onClick={() => setLiveEvents([])} className="text-xs text-muted hover:text-fg border border-white/10 px-3 py-1.5 rounded-theme">
              Clear
            </button>
          </div>

          {liveEvents.length === 0 ? (
            <div className="bg-surface border border-white/10 rounded-theme p-12 text-center">
              <p className="text-muted text-sm">Waiting for events…</p>
              <p className="text-xs text-muted/60 mt-2">
                Publish a test event above, or run a <code>streams.ingest</code> job from the Scheduler.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {liveEvents.map((ev, i) => (
                <div key={`${ev.id}-${i}`}
                  className="bg-surface border border-white/10 rounded-theme px-4 py-3 font-mono text-xs space-y-1 animate-fade-in">
                  <div className="flex items-center gap-2 text-muted">
                    <span className="text-primary font-medium">{ev.topic}</span>
                    <span>·</span>
                    <span>{ev.ts ? new Date(ev.ts).toLocaleTimeString() : "—"}</span>
                    <span>· #{ev.id}</span>
                  </div>
                  <pre className="whitespace-pre-wrap break-all text-fg/80">
                    {JSON.stringify(ev.payload, null, 2).slice(0, 800)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Alert Rules tab ──────────────────────────────────────────────────── */}
      {tab === "Alert Rules" && (
        <div className="space-y-6">
          {/* Create form */}
          <div className="bg-surface border border-white/10 rounded-theme p-4 space-y-3">
            <p className="text-sm font-medium">New alert rule</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <input className={INPUT} placeholder="topic (e.g. deals.raw)" value={ruleForm.topic_name}
                onChange={(e) => setRuleForm((p) => ({ ...p, topic_name: e.target.value }))} />
              <input className={INPUT} placeholder="label (e.g. Price drop &gt; 20%)" value={ruleForm.label}
                onChange={(e) => setRuleForm((p) => ({ ...p, label: e.target.value }))} />
              <input className={INPUT} placeholder="field path (e.g. price or title)" value={ruleForm.field_path}
                onChange={(e) => setRuleForm((p) => ({ ...p, field_path: e.target.value }))} />
              <select className={INPUT} value={ruleForm.operator}
                onChange={(e) => setRuleForm((p) => ({ ...p, operator: e.target.value }))}>
                {Object.entries(OP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input className={INPUT} placeholder="threshold value" value={ruleForm.threshold}
                onChange={(e) => setRuleForm((p) => ({ ...p, threshold: e.target.value }))} />
            </div>
            {ruleError && <p className="text-xs text-red-400">{ruleError}</p>}
            <button onClick={handleCreateRule} className="bg-primary text-white text-sm px-4 py-2 rounded-theme">
              Add rule
            </button>
          </div>

          {/* Rules list */}
          <div className="space-y-2">
            {rules.length === 0 && <p className="text-sm text-muted">No rules yet.</p>}
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between bg-surface border border-white/10 rounded-theme px-4 py-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${r.enabled ? "bg-green-500/20 text-green-400" : "bg-white/5 text-muted"}`}>
                      {r.enabled ? "on" : "off"}
                    </span>
                    <p className="text-sm font-medium">{r.label}</p>
                  </div>
                  <p className="text-xs text-muted font-mono">
                    [{r.topic_name}] {r.field_path} {OP_LABELS[r.operator] ?? r.operator} {r.threshold}
                  </p>
                </div>
                <button onClick={() => handleDeleteRule(r.id)} className="text-red-400/60 hover:text-red-400 text-sm transition-colors">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Fired Alerts tab ─────────────────────────────────────────────────── */}
      {tab === "Fired Alerts" && (
        <div className="space-y-2">
          {fired.length === 0 && <p className="text-sm text-muted">No alerts fired yet.</p>}
          {fired.map((f) => (
            <div key={f.id} className="bg-surface border border-amber-500/20 rounded-theme px-4 py-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <span>⚡ rule #{f.rule_id}</span>
                <span>·</span>
                <span>{f.fired_at ? new Date(f.fired_at).toLocaleString() : "—"}</span>
              </div>
              <pre className="text-xs text-fg/70 font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(f.event_snapshot, null, 2).slice(0, 600)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
