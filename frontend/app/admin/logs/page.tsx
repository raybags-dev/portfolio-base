"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLogs } from "@/lib/api";
import { useAuth } from "@/lib/store";
import type { LogEntry } from "@/lib/types";

const LEVELS = ["", "debug", "info", "warning", "error", "critical"];

const LEVEL_COLORS: Record<string, string> = {
  debug: "text-muted",
  info: "text-blue-400",
  warning: "text-yellow-400",
  error: "text-red-400",
  critical: "text-red-500 font-bold",
};

export default function LogsPage() {
  const token = useAuth((s) => s.token)!;
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

  const filtered = search
    ? logs.filter(
        (l) =>
          l.event?.toLowerCase().includes(search.toLowerCase()) ||
          JSON.stringify(l).toLowerCase().includes(search.toLowerCase()),
      )
    : logs;

  useEffect(() => {
    if (autoScroll && !paused) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
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
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-5xl">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="font-heading font-bold text-2xl">Live Logs</h1>
        <div className="flex items-center gap-2 ml-auto">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="rounded-theme bg-surface border border-white/15 px-3 py-1.5 text-sm w-48"
          />
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="rounded-theme bg-surface border border-white/15 px-3 py-1.5 text-sm"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l || "All levels"}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-primary"
            />
            Auto-scroll
          </label>
          <button
            onClick={() => setPaused((p) => !p)}
            className={`rounded-theme border px-3 py-1.5 text-sm transition-colors ${
              paused
                ? "border-yellow-400/60 text-yellow-400"
                : "border-white/15 text-muted hover:border-white/30"
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
      </div>

      {/* log pane */}
      <div className="flex-1 overflow-y-auto rounded-theme bg-surface border border-white/10 font-mono text-xs leading-relaxed p-4 space-y-0.5">
        {filtered.length === 0 ? (
          <p className="text-muted text-center py-8">
            {paused ? "Paused — no logs captured yet." : "Waiting for log entries…"}
          </p>
        ) : (
          filtered.map((entry, i) => {
            const lv = (entry.level as string | undefined) ?? "info";
            const color = LEVEL_COLORS[lv.toLowerCase()] ?? "text-muted";
            return (
              <div key={i} className="flex gap-3 hover:bg-white/5 px-1 py-0.5 rounded">
                <span className="text-muted shrink-0 w-[7.5rem] truncate">
                  {entry.timestamp ? String(entry.timestamp).slice(11, 23) : ""}
                </span>
                <span className={`shrink-0 w-16 uppercase ${color}`}>{lv}</span>
                <span className="flex-1 break-all">
                  {entry.event as string}
                  {entry.logger && (
                    <span className="text-muted ml-2">[{entry.logger as string}]</span>
                  )}
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
