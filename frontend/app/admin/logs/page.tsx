"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getActivityLogs, getAuditLogs, getLogs } from "@/lib/api";
import { useAuth } from "@/lib/store";
import type { ActivityLogEntry, AuditLogEntry, LogEntry } from "@/lib/types";

type Tab = "live" | "activity" | "audit";

const LEVELS = ["", "debug", "info", "warning", "error", "critical"];

const LEVEL_COLORS: Record<string, string> = {
  debug: "text-muted",
  info: "text-blue-400",
  warning: "text-yellow-400",
  error: "text-red-400",
  critical: "text-red-500 font-bold",
};

function LevelBadge({ level }: { level: string }) {
  const color = LEVEL_COLORS[level?.toLowerCase()] ?? "text-muted";
  return <span className={`shrink-0 w-16 uppercase text-xs ${color}`}>{level}</span>;
}

function ts(raw: string) {
  return raw ? String(raw).slice(0, 23).replace("T", " ") : "";
}

// ---- Live tab ----
function LiveLogs({ token }: { token: string }) {
  const [paused, setPaused] = useState(false);
  const [level, setLevel] = useState("");
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const { data: logs = [] } = useQuery<LogEntry[]>({
    queryKey: ["logs", level],
    queryFn: () => getLogs(token, 300, level || undefined),
    refetchInterval: paused ? false : 2000,
    enabled: !!token,
  });

  const loggers = [...new Set(logs.map((l) => l.logger).filter(Boolean))] as string[];
  const [loggerFilter, setLoggerFilter] = useState("");

  const filtered = logs.filter((l) => {
    if (loggerFilter && l.logger !== loggerFilter) return false;
    if (!search) return true;
    return (
      l.event?.toLowerCase().includes(search.toLowerCase()) ||
      JSON.stringify(l).toLowerCase().includes(search.toLowerCase())
    );
  });

  useEffect(() => {
    if (autoScroll && !paused) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filtered, autoScroll, paused]);

  function download() {
    const text = filtered
      .map((l) => `[${l.timestamp}] ${l.level?.toUpperCase()} ${l.event}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "logs.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="rounded-theme bg-surface border border-white/15 px-3 py-1.5 text-sm w-44"
        />
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="rounded-theme bg-surface border border-white/15 px-3 py-1.5 text-sm"
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>{l || "All levels"}</option>
          ))}
        </select>
        {loggers.length > 0 && (
          <select
            value={loggerFilter}
            onChange={(e) => setLoggerFilter(e.target.value)}
            className="rounded-theme bg-surface border border-white/15 px-3 py-1.5 text-sm"
          >
            <option value="">All services</option>
            {loggers.map((lg) => <option key={lg} value={lg}>{lg}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-muted cursor-pointer ml-auto">
          <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="accent-primary" />
          Auto-scroll
        </label>
        <button
          onClick={() => setPaused((p) => !p)}
          className={`rounded-theme border px-3 py-1.5 text-sm transition-colors ${
            paused ? "border-yellow-400/60 text-yellow-400" : "border-white/15 text-muted hover:border-white/30"
          }`}
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          onClick={download}
          className="rounded-theme border border-white/15 px-3 py-1.5 text-sm text-muted hover:border-white/30 transition-colors"
        >
          Download
        </button>
      </div>

      <div className="flex-1 overflow-y-auto rounded-theme bg-surface border border-white/10 font-mono text-xs leading-relaxed p-4 space-y-0.5">
        {filtered.length === 0 ? (
          <p className="text-muted text-center py-8">
            {paused ? "Paused — no logs captured yet." : "Waiting for log entries…"}
          </p>
        ) : (
          filtered.map((entry, i) => {
            const lv = (entry.level as string | undefined) ?? "info";
            return (
              <div key={i} className="flex gap-3 hover:bg-white/5 px-1 py-0.5 rounded">
                <span className="text-muted shrink-0 w-[9rem] truncate">{ts(entry.timestamp as string)}</span>
                <LevelBadge level={lv} />
                <span className="flex-1 break-all">
                  {entry.event as string}
                  {entry.logger && <span className="text-muted ml-2">[{entry.logger as string}]</span>}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <p className="text-xs text-muted mt-2">
        {filtered.length} entries · {paused ? "paused" : "live, refreshes every 2 s"} · resets on server restart
      </p>
    </div>
  );
}

// ---- Activity tab ----
function ActivityLogs({ token }: { token: string }) {
  const [level, setLevel] = useState("");
  const [category, setCategory] = useState("");

  const { data: logs = [], isFetching } = useQuery<ActivityLogEntry[]>({
    queryKey: ["activity-logs", level, category],
    queryFn: () => getActivityLogs(token, 300, level || undefined, category || undefined),
    refetchInterval: 15_000,
  });

  const categories = [...new Set(logs.map((l) => l.category))];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded-theme bg-surface border border-white/15 px-3 py-1.5 text-sm">
          {LEVELS.map((l) => <option key={l} value={l}>{l || "All levels"}</option>)}
        </select>
        {categories.length > 0 && (
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-theme bg-surface border border-white/15 px-3 py-1.5 text-sm">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {isFetching && <span className="text-xs text-muted animate-pulse ml-auto">Refreshing…</span>}
      </div>
      <div className="flex-1 overflow-y-auto rounded-theme bg-surface border border-white/10 font-mono text-xs leading-relaxed p-4 space-y-0.5">
        {logs.length === 0 ? (
          <p className="text-muted text-center py-8">No activity logs yet.</p>
        ) : (
          logs.map((entry) => (
            <div key={entry.id} className="flex gap-3 hover:bg-white/5 px-1 py-0.5 rounded">
              <span className="text-muted shrink-0 w-[9rem] truncate">{ts(entry.created_at)}</span>
              <LevelBadge level={entry.level} />
              <span className="text-primary/70 shrink-0 w-24 truncate">{entry.category}</span>
              <span className="flex-1 break-all">{entry.message}</span>
            </div>
          ))
        )}
      </div>
      <p className="text-xs text-muted mt-2">{logs.length} entries · persisted · refreshes every 15 s</p>
    </div>
  );
}

// ---- Audit tab ----
function AuditLogs({ token }: { token: string }) {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");

  const { data: logs = [], isFetching } = useQuery<AuditLogEntry[]>({
    queryKey: ["audit-logs", entityFilter],
    queryFn: () => getAuditLogs(token, 300, undefined, entityFilter || undefined),
    refetchInterval: 15_000,
  });

  const entities = [...new Set(logs.map((l) => l.entity).filter(Boolean))] as string[];

  const filtered = search
    ? logs.filter((l) => l.action.toLowerCase().includes(search.toLowerCase()) || JSON.stringify(l).toLowerCase().includes(search.toLowerCase()))
    : logs;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search action…"
          className="rounded-theme bg-surface border border-white/15 px-3 py-1.5 text-sm w-44"
        />
        {entities.length > 0 && (
          <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="rounded-theme bg-surface border border-white/15 px-3 py-1.5 text-sm">
            <option value="">All entities</option>
            {entities.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        )}
        {isFetching && <span className="text-xs text-muted animate-pulse ml-auto">Refreshing…</span>}
      </div>
      <div className="flex-1 overflow-y-auto rounded-theme bg-surface border border-white/10 font-mono text-xs leading-relaxed p-4 space-y-0.5">
        {filtered.length === 0 ? (
          <p className="text-muted text-center py-8">No audit logs yet.</p>
        ) : (
          filtered.map((entry) => (
            <div key={entry.id} className="flex gap-3 hover:bg-white/5 px-1 py-0.5 rounded">
              <span className="text-muted shrink-0 w-[9rem] truncate">{ts(entry.created_at)}</span>
              <span className="text-primary/70 shrink-0 w-28 truncate">{entry.action}</span>
              {entry.entity && <span className="text-muted shrink-0 w-24 truncate">{entry.entity}{entry.entity_id ? `#${entry.entity_id}` : ""}</span>}
              {entry.ip_address && <span className="text-muted shrink-0">{entry.ip_address}</span>}
              {entry.detail && <span className="flex-1 break-all text-muted">{JSON.stringify(entry.detail)}</span>}
            </div>
          ))
        )}
      </div>
      <p className="text-xs text-muted mt-2">{filtered.length} entries · persisted · refreshes every 15 s</p>
    </div>
  );
}

// ---- Page ----
export default function LogsPage() {
  const token = useAuth((s) => s.token)!;
  const [tab, setTab] = useState<Tab>("live");

  const TABS: { id: Tab; label: string }[] = [
    { id: "live", label: "Live" },
    { id: "activity", label: "Activity" },
    { id: "audit", label: "Audit" },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-heading font-bold text-2xl">Logs</h1>
        <div className="flex rounded-theme overflow-hidden border border-white/15">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 text-sm transition-colors ${
                tab === t.id
                  ? "bg-primary text-white"
                  : "text-muted hover:text-foreground hover:bg-white/5"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "live" && <LiveLogs token={token} />}
      {tab === "activity" && <ActivityLogs token={token} />}
      {tab === "audit" && <AuditLogs token={token} />}
    </div>
  );
}
