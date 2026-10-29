"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getVodAdminConfig,
  listVodAdminJobs,
  putVodAdminConfig,
  type VodAdminConfig,
} from "@/lib/api";
import { useAuth } from "@/lib/store";
import { ModuleDisabled, isDisabled } from "@/components/admin/ModuleGate";

const FLAG = "ENABLE_VOD_PIPELINE";

const FIELDS: { key: keyof VodAdminConfig; label: string; secret?: boolean; placeholder: string }[] = [
  { key: "region", label: "AWS region", placeholder: "eu-central-1" },
  { key: "raw_bucket", label: "Raw uploads bucket", placeholder: "medialab-dev-vod-raw-xxxxxx" },
  { key: "processed_bucket", label: "Processed HLS bucket", placeholder: "medialab-dev-vod-hls-xxxxxx" },
  { key: "jobs_table", label: "DynamoDB jobs table", placeholder: "medialab-dev-vod-jobs" },
  { key: "cloudfront_domain", label: "CloudFront domain", placeholder: "dxxxxxxxx.cloudfront.net" },
  { key: "access_key_id", label: "Broker access key id", secret: false, placeholder: "AKIA… (leave empty to use server env creds)" },
  { key: "secret_access_key", label: "Broker secret key", secret: true, placeholder: "(stored, never shown)" },
];

export default function VodPipelineAdmin() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<VodAdminConfig>>({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);

  const { data: cfg, error: cfgError } = useQuery({
    queryKey: ["vod-admin-config"],
    queryFn: () => getVodAdminConfig(token),
    retry: false,
  });

  const { data: jobs } = useQuery({
    queryKey: ["vod-admin-jobs"],
    queryFn: () => listVodAdminJobs(token),
    enabled: !!cfg?.deployed,
    refetchInterval: 10000,
  });

  if (isDisabled(cfgError)) return <ModuleDisabled flag={FLAG} />;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveResult(null);
    try {
      await putVodAdminConfig(token, form);
      setForm({});
      setSaveResult("saved");
      qc.invalidateQueries({ queryKey: ["vod-admin-config"] });
    } catch (err) {
      setSaveResult(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="font-heading font-bold text-2xl mb-1">VOD Pipeline</h1>
        <p className="text-muted text-sm">
          Paste the terraform outputs here after <code className="font-mono text-xs">make up</code>.
          The module goes live for tryouts the moment the config is complete.
        </p>
      </div>

      {/* Status + usage */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-theme bg-surface border border-white/10 p-4">
          <div className="text-xs text-muted mb-1">Status</div>
          <div className={`font-semibold ${cfg?.deployed ? "text-green-400" : "text-yellow-400"}`}>
            {cfg?.deployed ? "Deployed" : "Not configured"}
          </div>
        </div>
        <div className="rounded-theme bg-surface border border-white/10 p-4">
          <div className="text-xs text-muted mb-1">Total jobs</div>
          <div className="font-semibold">{jobs?.usage.total_jobs ?? "—"}</div>
        </div>
        <div className="rounded-theme bg-surface border border-white/10 p-4">
          <div className="text-xs text-muted mb-1">Uploaded (MB)</div>
          <div className="font-semibold">{jobs?.usage.total_upload_mb ?? "—"}</div>
        </div>
      </section>

      {/* Config form */}
      <section className="rounded-theme bg-surface border border-white/10 p-5">
        <h2 className="font-semibold mb-4">AWS Connection</h2>
        <form onSubmit={handleSave} className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className={f.secret ? "sm:col-span-2" : ""}>
              <label className="text-xs text-muted block mb-1">{f.label}</label>
              <input
                type={f.secret ? "password" : "text"}
                value={String(form[f.key] ?? (f.secret ? "" : (cfg?.[f.key] as string | undefined) ?? ""))}
                placeholder={
                  f.secret
                    ? cfg?.secret_access_key
                      ? "(stored - type to replace)"
                      : f.placeholder
                    : f.placeholder
                }
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm outline-none focus:border-primary font-mono"
              />
            </div>
          ))}
          <div className="sm:col-span-2 flex items-center gap-3 mt-2">
            <button
              type="submit"
              disabled={saving || Object.keys(form).length === 0}
              className="rounded-theme bg-primary text-white px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? "Saving…" : "Save config"}
            </button>
            {saveResult && (
              <span className={`text-xs ${saveResult === "saved" ? "text-green-400" : "text-red-400"}`}>
                {saveResult === "saved" ? "Saved." : saveResult}
              </span>
            )}
          </div>
        </form>
        <p className="text-xs text-muted mt-4">
          Terraform outputs to paste: <code className="font-mono">raw_bucket</code>,{" "}
          <code className="font-mono">processed_bucket</code>, <code className="font-mono">jobs_table</code>,{" "}
          <code className="font-mono">cloudfront_url</code> (strip the https://), and the broker IAM
          credentials from <code className="font-mono">make output</code>.
        </p>
      </section>

      {/* Jobs table */}
      <section className="rounded-theme bg-surface border border-white/10 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Tryout Jobs</h2>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["vod-admin-jobs"] })}
            className="text-xs text-muted hover:text-white transition-colors"
          >
            Refresh
          </button>
        </div>
        {jobs?.usage && Object.keys(jobs.usage.by_status).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(jobs.usage.by_status).map(([status, count]) => (
              <span key={status} className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-muted">
                {status}: {count}
              </span>
            ))}
          </div>
        )}
        {!jobs || jobs.items.length === 0 ? (
          <p className="text-sm text-muted">No jobs yet.</p>
        ) : (
          <div className="space-y-2">
            {jobs.items.map((j) => (
              <div key={j.job_id} className="rounded bg-white/5 px-3 py-2 text-sm">
                <div className="flex items-center gap-3 flex-wrap">
                  <code className="text-xs text-muted font-mono">{j.job_id}</code>
                  <span className="flex-1 truncate">{j.filename}</span>
                  <span className="text-xs text-muted">{j.size_mb} MB</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      j.status === "COMPLETE"
                        ? "bg-green-500/20 text-green-400"
                        : j.status === "ERROR"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-yellow-500/20 text-yellow-400"
                    }`}
                  >
                    {j.status}
                  </span>
                </div>
                {j.error && <div className="text-xs text-red-400 mt-1">{j.error}</div>}
                {j.stream_url && (
                  <div className="text-xs text-muted mt-1 truncate font-mono">{j.stream_url}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
