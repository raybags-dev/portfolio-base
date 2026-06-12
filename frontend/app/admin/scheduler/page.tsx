"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSchedulerJob,
  listSchedulerJobs,
  listSchedulerTasks,
  runSchedulerJob,
  schedulerTick,
  updateSchedulerJob,
} from "@/lib/api";
import { useAuth } from "@/lib/store";
import { ModuleDisabled, isDisabled } from "@/components/admin/ModuleGate";

export default function SchedulerPage() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();

  const { data: tasks = [], error } = useQuery({
    queryKey: ["sched-tasks"],
    queryFn: () => listSchedulerTasks(token),
    retry: false,
  });
  const { data: jobs = [] } = useQuery({
    queryKey: ["sched-jobs"],
    queryFn: () => listSchedulerJobs(token),
    enabled: !isDisabled(error),
  });

  const [name, setName] = useState("");
  const [task, setTask] = useState("");
  const [interval, setIntervalSecs] = useState(3600);
  const [args, setArgs] = useState("{}");
  const [formError, setFormError] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["sched-jobs"] });
  };

  const create = useMutation({
    mutationFn: () => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(args);
      } catch {
        throw new Error("Args must be valid JSON");
      }
      return createSchedulerJob(token, {
        name,
        task: task || tasks[0],
        interval_seconds: interval,
        args: parsed,
      });
    },
    onSuccess: () => {
      setName("");
      setArgs("{}");
      setFormError(null);
      invalidate();
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : "Failed"),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      updateSchedulerJob(token, id, { is_enabled: enabled }),
    onSuccess: invalidate,
  });
  const runJob = useMutation({
    mutationFn: (id: number) => runSchedulerJob(token, id),
    onSuccess: invalidate,
  });
  const tick = useMutation({
    mutationFn: () => schedulerTick(token),
    onSuccess: invalidate,
  });

  if (isDisabled(error)) return <ModuleDisabled flag="ENABLE_SCHEDULER" />;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-heading font-bold text-2xl">Scheduler</h1>
        <button
          onClick={() => tick.mutate()}
          disabled={tick.isPending}
          className="text-sm rounded-theme border border-white/15 px-3 py-1.5"
        >
          {tick.isPending ? "Running…" : "Run due now (tick)"}
        </button>
      </div>
      <p className="text-muted text-sm mb-6">
        Schedule tasks by interval (cron supported when <code>croniter</code> is
        installed). The in-process ticker runs due jobs while the module is on.
      </p>

      <div className="rounded-theme bg-surface border border-white/10 p-4 mb-8">
        <h2 className="font-semibold mb-3">New scheduled job</h2>
        {formError && <p className="text-sm text-red-400 mb-2">{formError}</p>}
        <div className="grid sm:grid-cols-3 gap-3">
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-theme bg-bg border border-white/15 px-3 py-2"
          />
          <select
            value={task}
            onChange={(e) => setTask(e.target.value)}
            className="rounded-theme bg-bg border border-white/15 px-3 py-2"
          >
            {tasks.map((t: string) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            type="number"
            min={5}
            value={interval}
            onChange={(e) => setIntervalSecs(Number(e.target.value))}
            placeholder="Interval (s)"
            className="rounded-theme bg-bg border border-white/15 px-3 py-2"
          />
        </div>
        <textarea
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder='args, e.g. {"job_id": 1} or {"workflow": "insight", "input": {}}'
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

      <div className="space-y-2">
        {jobs.map((j: any) => (
          <div
            key={j.id}
            className="rounded-theme bg-surface border border-white/10 px-4 py-3 text-sm"
          >
            <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">{j.name}</span>{" "}
              <span className="text-muted">
                · {j.task} · every {j.interval_seconds ?? j.cron}s ·{" "}
                <span className={j.status === "failed" ? "text-red-400 font-semibold" : j.status === "running" ? "text-amber-400" : "text-green-400/80"}>
                  {j.status}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => runJob.mutate(j.id)}
                className="rounded-theme bg-primary text-white px-3 py-1.5"
              >
                Run now
              </button>
              <button
                onClick={() => toggle.mutate({ id: j.id, enabled: !j.is_enabled })}
                className={`rounded-theme px-3 py-1.5 border ${
                  j.is_enabled ? "border-green-400/40 text-green-400" : "border-white/15 text-muted"
                }`}
              >
                {j.is_enabled ? "Enabled" : "Disabled"}
              </button>
            </div>
            </div>
            {j.last_error && (
              <p className="mt-1.5 text-xs text-red-400/80 font-mono break-all leading-relaxed">
                ✕ {j.last_error.slice(0, 300)}
              </p>
            )}
          </div>
        ))}
        {jobs.length === 0 && <p className="text-muted text-sm">No scheduled jobs yet.</p>}
      </div>
    </div>
  );
}
