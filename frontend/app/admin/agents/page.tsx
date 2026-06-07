"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listAgentTasks, listAgentWorkflows, runAgent } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { ModuleDisabled, isDisabled } from "@/components/admin/ModuleGate";

export default function AgentsPage() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();

  const { data: workflows = [], error } = useQuery({
    queryKey: ["agent-workflows"],
    queryFn: () => listAgentWorkflows(token),
    retry: false,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["agent-tasks"],
    queryFn: () => listAgentTasks(token),
    enabled: !isDisabled(error),
  });

  const [workflow, setWorkflow] = useState("insight");
  const [input, setInput] = useState('{\n  "topic": "retail prices",\n  "points": [1, 2, 3]\n}');
  const [result, setResult] = useState<unknown>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: () => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(input);
      } catch {
        throw new Error("Input must be valid JSON");
      }
      return runAgent(token, { workflow, input: parsed });
    },
    onSuccess: (data) => {
      setResult(data);
      setFormError(null);
      qc.invalidateQueries({ queryKey: ["agent-tasks"] });
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : "Failed"),
  });

  if (isDisabled(error)) return <ModuleDisabled flag="ENABLE_AGENTIC_AI" />;

  return (
    <div className="max-w-4xl">
      <h1 className="font-heading font-bold text-2xl mb-2">AI Agents</h1>
      <p className="text-muted text-sm mb-6">
        Run agent workflows (observe → reason → plan → execute → validate → retry
        → report). Works offline; set <code>OPENAI_API_KEY</code> for live models.
      </p>

      <div className="rounded-theme bg-surface border border-white/10 p-4 mb-8">
        <div className="flex flex-wrap gap-3 items-center mb-3">
          <select
            value={workflow}
            onChange={(e) => setWorkflow(e.target.value)}
            className="rounded-theme bg-bg border border-white/15 px-3 py-2"
          >
            {workflows.map((w: string) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
          <button
            onClick={() => run.mutate()}
            disabled={run.isPending}
            className="rounded-theme bg-primary text-white px-4 py-2 disabled:opacity-50"
          >
            {run.isPending ? "Running…" : "Run workflow"}
          </button>
        </div>
        {formError && <p className="text-sm text-red-400 mb-2">{formError}</p>}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={6}
          spellCheck={false}
          className="w-full font-mono text-xs rounded-theme bg-bg border border-white/15 px-3 py-2"
        />
        {result != null && (
          <pre className="mt-3 text-xs rounded-theme bg-bg border border-white/10 p-3 overflow-auto max-h-72 whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>

      <h2 className="font-semibold mb-3">Recent tasks</h2>
      <div className="space-y-2">
        {tasks.map((t: any) => (
          <div
            key={t.id}
            className="flex items-center justify-between rounded-theme bg-surface border border-white/10 px-4 py-2 text-sm"
          >
            <span>
              #{t.id} {t.title}
            </span>
            <span className="flex items-center gap-3">
              <span className="text-muted">stage: {t.stage}</span>
              <span
                className={
                  t.status === "done"
                    ? "text-green-400"
                    : t.status === "failed"
                      ? "text-red-400"
                      : "text-muted"
                }
              >
                {t.status}
              </span>
            </span>
          </div>
        ))}
        {tasks.length === 0 && <p className="text-muted text-sm">No tasks yet.</p>}
      </div>
    </div>
  );
}
