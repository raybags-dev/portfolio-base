"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  getStreamStats,
  listStreamTopics,
  getStreamSseUrl,
  getBootstrap,
  type StreamStats,
  type StreamTopic,
  type StreamEvent,
} from "@/lib/api";
import { Footer } from "@/components/sections";

// Extract a one-line summary from an event payload
function briefSummary(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .filter(([, v]) => v !== null && typeof v !== "object")
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 35)}`)
    .join("  ·  ");
}

export default function StreamsPage() {
  const { data: bootstrap } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap, staleTime: Infinity });
  const [stats, setStats] = useState<StreamStats | null>(null);
  const [topics, setTopics] = useState<StreamTopic[]>([]);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [selected, setSelected] = useState<StreamEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [filterTopic, setFilterTopic] = useState<string | null>(null);
  const briefRef = useRef<HTMLDivElement>(null);

  // Initial data fetch
  useEffect(() => {
    getStreamStats().then(setStats).catch(() => null);
    listStreamTopics().then(setTopics).catch(() => null);
  }, []);

  // SSE live feed
  useEffect(() => {
    const url = filterTopic
      ? `${getStreamSseUrl()}?topic=${encodeURIComponent(filterTopic)}`
      : getStreamSseUrl();
    const es = new EventSource(url);
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const ev: StreamEvent = JSON.parse(e.data);
        setEvents((prev) => [ev, ...prev].slice(0, 200));
        if (!selected) setSelected(ev); // auto-select first
        setStats((s) => s ? { ...s, total_events: s.total_events + 1 } : s);
      } catch {
        // ignore parse errors
      }
    };
    es.onerror = () => setConnected(false);
    return () => { es.close(); setConnected(false); };
  }, [filterTopic]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayed = filterTopic
    ? events.filter((e) => e.topic === filterTopic)
    : events;

  const statCards = stats
    ? [
        { label: "Topics", value: stats.total_topics, color: "text-blue-400" },
        { label: "Total Events", value: stats.total_events, color: "text-emerald-400" },
        { label: "Alert Rules", value: stats.active_rules, color: "text-amber-400" },
        { label: "Alerts Fired", value: stats.alerts_fired, color: "text-rose-400" },
      ]
    : [];

  return (
    <>
    <main
      className="min-h-screen flex flex-col"
      style={{ background: "var(--color-bg)", color: "var(--color-fg)" }}
    >
      {/* ── Top nav bar ── */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between h-12 px-4 border-b backdrop-blur shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(12,12,18,0.9)" }}
      >
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs text-muted hover:text-primary transition-colors">← Back</Link>
          <span className="text-white/20 text-xs">|</span>
          <span className="font-heading font-semibold text-sm tracking-tight">Stream Pipeline</span>
        </div>
        <div className="flex items-center gap-3">
          {filterTopic && (
            <button
              onClick={() => setFilterTopic(null)}
              className="text-xs rounded-full px-2.5 py-0.5 border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
            >
              {filterTopic} ×
            </button>
          )}
          <span
            className="inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-0.5 font-medium"
            style={{
              background: connected ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
              color: connected ? "#4ade80" : "#f87171",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: connected ? "#4ade80" : "#f87171",
                animation: connected ? "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" : "none",
              }}
            />
            {connected ? "Live" : "Connecting"}
          </span>
        </div>
      </header>

      <div className="flex-1 flex flex-col">
        {/* ── Stats strip ── */}
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-px shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}
        >
          {statCards.map((s) => (
            <div key={s.label} className="flex items-center gap-3 px-4 py-3">
              <div>
                <div className={`text-xl font-bold font-heading tabular-nums ${s.color}`}>
                  {s.value.toLocaleString()}
                </div>
                <div className="text-xs text-muted">{s.label}</div>
              </div>
            </div>
          ))}
          {!stats && (
            <div className="col-span-4 px-4 py-3 text-xs text-muted">Loading stats…</div>
          )}
        </div>

        {/* ── 3-column layout ── */}
        <div className="flex flex-1 min-h-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>

          {/* Left: Topics */}
          <aside
            className="w-48 lg:w-56 shrink-0 flex flex-col border-r"
            style={{ background: "rgba(255,255,255,0.015)", borderColor: "rgba(255,255,255,0.06)" }}
          >
            <div className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted border-b"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              Topics
            </div>
            <div className="flex-1 overflow-y-auto">
              <button
                onClick={() => setFilterTopic(null)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  !filterTopic ? "bg-white/5 text-fg font-medium" : "text-muted hover:bg-white/5"
                }`}
              >
                All topics
              </button>
              {topics.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setFilterTopic(filterTopic === t.name ? null : t.name)}
                  className={`w-full text-left px-3 py-2 text-xs border-t transition-colors ${
                    filterTopic === t.name
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted hover:bg-white/5"
                  }`}
                  style={{ borderColor: "rgba(255,255,255,0.04)" }}
                >
                  <div className="font-mono truncate">{t.name}</div>
                  <div className="text-muted/70 mt-0.5">{t.event_count.toLocaleString()} events</div>
                </button>
              ))}
            </div>

            {/* How it works — compact */}
            <div className="px-3 py-3 border-t text-xs text-muted space-y-2"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <div><span className="text-fg font-medium">Ingest</span> — Schedulers crawl URLs and publish to topics.</div>
              <div><span className="text-fg font-medium">Alert</span> — Rules watch fields and fire on threshold breach.</div>
              <div><span className="text-fg font-medium">Export</span> — DB keeps last 500 per topic; optional Kafka mirror.</div>
            </div>
          </aside>

          {/* Center: Brief log */}
          <section className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0 text-xs"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <span className="font-semibold uppercase tracking-wider text-muted">Live Log</span>
              <span className="text-muted tabular-nums">{displayed.length} event{displayed.length !== 1 ? "s" : ""}</span>
            </div>
            <div ref={briefRef} className="flex-1 overflow-y-auto" style={{ maxHeight: "calc(100vh - 120px)" }}>
              {displayed.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-muted">
                  {connected ? "Waiting for events…" : "Connecting to stream…"}
                </div>
              ) : (
                displayed.map((ev, i) => (
                  <button
                    key={`${ev.id}-${i}`}
                    onClick={() => setSelected(ev)}
                    className={`w-full text-left px-4 py-2.5 border-b flex items-start gap-3 transition-colors text-xs ${
                      selected === ev
                        ? "bg-primary/10 border-l-2 border-l-primary"
                        : "hover:bg-white/4 border-transparent"
                    }`}
                    style={{ borderBottomColor: "rgba(255,255,255,0.04)" }}
                  >
                    <div className="shrink-0 tabular-nums text-muted/70 mt-px w-14 text-right">
                      {ev.ts ? new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span
                        className="inline-block font-mono font-semibold mr-2"
                        style={{ color: "var(--color-primary)" }}
                      >
                        {ev.topic}
                      </span>
                      <span className="text-secondary truncate">
                        {briefSummary(ev.payload as Record<string, unknown>)}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          {/* Right: Full JSON detail */}
          <aside className="w-80 lg:w-[420px] shrink-0 flex flex-col border-l"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0 text-xs"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <span className="font-semibold uppercase tracking-wider text-muted">Event Detail</span>
              {selected && (
                <span className="font-mono text-primary">{selected.topic}</span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: "calc(100vh - 120px)" }}>
              {!selected ? (
                <div className="flex items-center justify-center h-32 text-sm text-muted">
                  Click an event to inspect
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-3 text-xs text-muted">
                    <span className="font-mono text-primary font-medium">{selected.topic}</span>
                    <span>·</span>
                    <span>{selected.ts ? new Date(selected.ts).toLocaleString() : ""}</span>
                    {selected.id && <span>· #{selected.id}</span>}
                  </div>
                  <pre
                    className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-all"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    {JSON.stringify(selected.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </aside>

        </div>
      </div>
    </main>
    {bootstrap && <Footer data={bootstrap} />}
    </>
  );
}
