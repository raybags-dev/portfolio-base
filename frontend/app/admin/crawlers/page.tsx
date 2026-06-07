"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCrawlerJob,
  crawlerJobLogs,
  crawlerJobResults,
  listCrawlerJobs,
  runCrawlerJob,
} from "@/lib/api";
import { useAuth } from "@/lib/store";
import { ModuleDisabled, isDisabled } from "@/components/admin/ModuleGate";

const TEMPLATE = JSON.stringify(
  {
    fields: {
      title: { selector: { tag: "h1" }, hint: { regex: ".+" }, required: true },
      price: {
        selector: { tag: "span", class: "price" },
        hint: { regex: "[0-9]" },
        required: true,
      },
    },
  },
  null,
  2,
);

export default function CrawlersPage() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data: jobs = [], error } = useQuery({
    queryKey: ["crawler-jobs"],
    queryFn: () => listCrawlerJobs(token),
    retry: false,
  });

  const [name, setName] = useState("");
  const [urls, setUrls] = useState("");
  const [selectors, setSelectors] = useState(TEMPLATE);
  const [selected, setSelected] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(selectors);
      } catch {
        throw new Error("Selectors must be valid JSON");
      }
      return createCrawlerJob(token, {
        name,
        start_urls: urls.split(/[\n,]/).map((u) => u.trim()).filter(Boolean),
        selectors: parsed,
      });
    },
    onSuccess: () => {
      setName("");
      setUrls("");
      setFormError(null);
      qc.invalidateQueries({ queryKey: ["crawler-jobs"] });
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : "Failed"),
  });

  const run = useMutation({
    mutationFn: (id: number) => runCrawlerJob(token, id),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["crawler-jobs"] });
      qc.invalidateQueries({ queryKey: ["crawler-logs", id] });
      qc.invalidateQueries({ queryKey: ["crawler-results", id] });
    },
  });

  if (isDisabled(error)) return <ModuleDisabled flag="ENABLE_CRAWLERS" />;

  return (
    <div className="max-w-4xl">
      <h1 className="font-heading font-bold text-2xl mb-2">Self-Healing Crawlers</h1>
      <p className="text-muted text-sm mb-6">
        Define fields with a <em>selector</em> and a <em>hint</em> (what a valid
        value looks like). When a site changes and a selector breaks, the crawler
        finds a new one, verifies it against the hint, and rewrites its own config.
      </p>

      {/* create */}
      <div className="rounded-theme bg-surface border border-white/10 p-4 mb-8">
        <h2 className="font-semibold mb-3">New job</h2>
        {formError && <p className="text-sm text-red-400 mb-2">{formError}</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            placeholder="Job name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-theme bg-bg border border-white/15 px-3 py-2"
          />
          <input
            placeholder="Start URLs (comma or newline separated)"
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            className="rounded-theme bg-bg border border-white/15 px-3 py-2"
          />
        </div>
        <textarea
          value={selectors}
          onChange={(e) => setSelectors(e.target.value)}
          rows={10}
          spellCheck={false}
          className="w-full mt-3 font-mono text-xs rounded-theme bg-bg border border-white/15 px-3 py-2"
        />
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending || !name}
          className="mt-3 rounded-theme bg-primary text-white px-4 py-2 disabled:opacity-50"
        >
          {create.isPending ? "Creating…" : "Create job"}
        </button>
      </div>

      {/* jobs */}
      <div className="space-y-2">
        {jobs.map((j: any) => (
          <div key={j.id} className="rounded-theme bg-surface border border-white/10 p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{j.name}</span>{" "}
                <span className="text-xs text-muted">
                  · {(j.start_urls || []).length} url(s) · {j.status}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => run.mutate(j.id)}
                  disabled={run.isPending}
                  className="text-sm rounded-theme bg-primary text-white px-3 py-1.5 disabled:opacity-50"
                >
                  Run
                </button>
                <button
                  onClick={() => setSelected(selected === j.id ? null : j.id)}
                  className="text-sm rounded-theme border border-white/15 px-3 py-1.5"
                >
                  {selected === j.id ? "Hide" : "Details"}
                </button>
              </div>
            </div>
            {selected === j.id && <JobDetails token={token} jobId={j.id} />}
          </div>
        ))}
        {jobs.length === 0 && (
          <p className="text-muted text-sm">No crawler jobs yet.</p>
        )}
      </div>
    </div>
  );
}

function JobDetails({ token, jobId }: { token: string; jobId: number }) {
  const { data: logs = [] } = useQuery({
    queryKey: ["crawler-logs", jobId],
    queryFn: () => crawlerJobLogs(token, jobId),
  });
  const { data: results = [] } = useQuery({
    queryKey: ["crawler-results", jobId],
    queryFn: () => crawlerJobResults(token, jobId),
  });
  return (
    <div className="mt-4 grid md:grid-cols-2 gap-4 text-xs">
      <div>
        <h3 className="font-semibold mb-2 text-secondary">Logs</h3>
        <div className="space-y-1 max-h-64 overflow-auto">
          {logs.map((l: any) => (
            <div
              key={l.id}
              className={`rounded px-2 py-1 ${
                l.healing_event ? "bg-accent/15 text-accent" : "bg-white/5"
              }`}
            >
              <span className="uppercase opacity-60">{l.level}</span> {l.message}
              {l.healing_event && (
                <pre className="mt-1 opacity-80 whitespace-pre-wrap">
                  {JSON.stringify(l.healing_event, null, 2)}
                </pre>
              )}
            </div>
          ))}
          {logs.length === 0 && <p className="text-muted">No logs yet.</p>}
        </div>
      </div>
      <div>
        <h3 className="font-semibold mb-2 text-secondary">Results</h3>
        <div className="space-y-1 max-h-64 overflow-auto">
          {results.map((r: any) => (
            <pre key={r.id} className="rounded bg-white/5 px-2 py-1 whitespace-pre-wrap">
              {JSON.stringify(r.payload, null, 2)}
            </pre>
          ))}
          {results.length === 0 && <p className="text-muted">No results yet.</p>}
        </div>
      </div>
    </div>
  );
}
