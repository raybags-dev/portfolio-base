"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getStreamStats,
  listStreamTopics,
  getStreamSseUrl,
  type StreamStats,
  type StreamTopic,
  type StreamEvent,
} from "@/lib/api";

export default function StreamsPage() {
  const [stats, setStats] = useState<StreamStats | null>(null);
  const [topics, setTopics] = useState<StreamTopic[]>([]);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    getStreamStats().then(setStats).catch(() => null);
    listStreamTopics().then(setTopics).catch(() => null);
  }, []);

  useEffect(() => {
    const es = new EventSource(getStreamSseUrl());
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const ev: StreamEvent = JSON.parse(e.data);
        setEvents((prev) => [ev, ...prev].slice(0, 150));
        setStats((s) =>
          s ? { ...s, total_events: s.total_events + 1 } : s
        );
      } catch {
        // ignore malformed frames
      }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  const statCards = stats
    ? [
        { label: "Topics", value: stats.total_topics },
        { label: "Total Events", value: stats.total_events },
        { label: "Alert Rules", value: stats.active_rules },
        { label: "Alerts Fired", value: stats.alerts_fired },
      ]
    : [];

  return (
    <main className="min-h-screen" style={{ background: "var(--color-bg)", color: "var(--color-fg)" }}>
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b backdrop-blur"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(var(--color-bg-rgb,15,15,20),0.85)" }}>
        <div className="container-x flex items-center justify-between h-14 gap-4">
          <Link href="/" className="text-sm text-muted hover:text-primary transition-colors">← Back</Link>
          <span className="font-heading font-semibold text-sm">Stream Pipeline</span>
          <span
            className="inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-0.5"
            style={{
              background: connected ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
              color: connected ? "#4ade80" : "#f87171",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: connected ? "#4ade80" : "#f87171",
                animation: connected ? "pulse 2s infinite" : "none",
              }}
            />
            {connected ? "Live" : "Connecting…"}
          </span>
        </div>
      </header>

      <div className="container-x py-12">
        <h1 className="text-3xl font-heading font-bold mb-1">Stream Pipeline</h1>
        <p className="text-muted mb-8 text-sm max-w-xl">
          Real-time event ingestion from web crawlers and schedulers. Events are published per topic,
          processed by alert rules, and optionally bridged to Kafka.
        </p>

        {/* Stats */}
        {statCards.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
            {statCards.map((s) => (
              <div key={s.label}
                className="rounded-theme p-4 text-center"
                style={{ background: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="text-2xl font-bold font-heading">{s.value.toLocaleString()}</div>
                <div className="text-xs text-muted mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-[260px_1fr] gap-6">
          {/* Topics */}
          <aside>
            <h2 className="font-heading font-semibold text-sm uppercase tracking-wider text-muted mb-3">Topics</h2>
            {topics.length === 0 ? (
              <p className="text-sm text-muted">No topics yet.</p>
            ) : (
              <div className="space-y-2">
                {topics.map((t) => (
                  <div key={t.name}
                    className="rounded-theme p-3 text-sm"
                    style={{ background: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="font-medium font-mono">{t.name}</div>
                    {t.description && (
                      <p className="text-xs text-muted mt-0.5 leading-snug">{t.description}</p>
                    )}
                    <div className="text-xs text-muted mt-1">
                      {t.event_count.toLocaleString()} events
                      {t.last_event_at && (
                        <> · {new Date(t.last_event_at).toLocaleTimeString()}</>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>

          {/* Live feed */}
          <section>
            <h2 className="font-heading font-semibold text-sm uppercase tracking-wider text-muted mb-3">Live Feed</h2>
            {events.length === 0 ? (
              <div className="rounded-theme p-8 text-center text-muted text-sm"
                style={{ background: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.06)" }}>
                {connected ? "Waiting for events…" : "Connecting to stream…"}
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((ev, i) => (
                  <div key={`${ev.id}-${i}`}
                    className="rounded-theme p-3"
                    style={{ background: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-xs font-semibold" style={{ color: "var(--color-primary)" }}>
                        {ev.topic}
                      </span>
                      <span className="text-xs text-muted">
                        {ev.ts ? new Date(ev.ts).toLocaleTimeString() : ""}
                      </span>
                    </div>
                    <pre className="text-xs text-secondary whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-hidden">
                      {JSON.stringify(ev.payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* About section */}
        <div className="mt-16 rounded-theme p-6 sm:p-8"
          style={{ background: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 className="font-heading font-semibold mb-3">How it works</h2>
          <div className="grid sm:grid-cols-3 gap-6 text-sm text-muted">
            <div>
              <div className="font-medium text-fg mb-1">Ingest</div>
              Scheduled crawlers fetch data from URLs, parse records, and publish to named topics in real time.
            </div>
            <div>
              <div className="font-medium text-fg mb-1">Alert</div>
              Configurable rules watch each event&apos;s fields. When a threshold is crossed, an alert fires and
              appears in the feed.
            </div>
            <div>
              <div className="font-medium text-fg mb-1">Export</div>
              Events are persisted in the database (last 500 per topic) and optionally mirrored to a Kafka
              broker for downstream consumers.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
