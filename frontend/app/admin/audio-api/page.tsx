"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAudioTrack,
  getAudioAdminConfig,
  listAudioAdminTracks,
  presignAudioUpload,
  putAudioAdminConfig,
  type AudioAdminConfig,
} from "@/lib/api";
import { useAuth } from "@/lib/store";
import { ModuleDisabled, isDisabled } from "@/components/admin/ModuleGate";

const FLAG = "ENABLE_AUDIO_API";

const FIELDS: { key: keyof AudioAdminConfig; label: string; secret?: boolean; placeholder: string }[] = [
  { key: "region", label: "AWS region", placeholder: "eu-central-1" },
  { key: "api_url", label: "API Gateway URL", placeholder: "https://xxxx.execute-api.eu-central-1.amazonaws.com" },
  { key: "tracks_table", label: "DynamoDB tracks table", placeholder: "medialab-dev-audio-tracks" },
  { key: "progress_table", label: "DynamoDB progress table", placeholder: "medialab-dev-audio-progress" },
  { key: "audio_bucket", label: "Audio S3 bucket", placeholder: "medialab-dev-audio-audio-xxxxxx" },
  { key: "admin_key_param", label: "Admin key SSM param", placeholder: "/medialab-dev-audio/admin-api-key" },
  { key: "access_key_id", label: "Broker access key id", placeholder: "AKIA… (blank = server env creds)" },
  { key: "secret_access_key", label: "Broker secret key", secret: true, placeholder: "(stored, never shown)" },
];

const TRACK_CATEGORIES = ["podcast", "music", "lecture", "demo"];

export default function AudioApiAdmin() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<AudioAdminConfig>>({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);

  // track create form
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [category, setCategory] = useState("podcast");
  const [duration, setDuration] = useState("");
  const [summary, setSummary] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [s3Key, setS3Key] = useState("");
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  const { data: cfg, error: cfgError } = useQuery({
    queryKey: ["audio-admin-config"],
    queryFn: () => getAudioAdminConfig(token),
    retry: false,
  });

  const { data: tracksResp, refetch: refetchTracks } = useQuery({
    queryKey: ["audio-admin-tracks"],
    queryFn: () => listAudioAdminTracks(token),
    enabled: !!cfg?.deployed,
  });
  const tracks = tracksResp?.data?.items ?? [];

  if (isDisabled(cfgError)) return <ModuleDisabled flag={FLAG} />;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveResult(null);
    try {
      await putAudioAdminConfig(token, form);
      setForm({});
      setSaveResult("saved");
      qc.invalidateQueries({ queryKey: ["audio-admin-config"] });
    } catch (err) {
      setSaveResult(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !cfg) return;
    setUploading(true);
    setUploadPct(0);
    setCreateResult(null);
    try {
      const { key, upload } = await presignAudioUpload(token, {
        filename: file.name,
        size_bytes: file.size,
        content_type: file.type || "audio/mpeg",
      });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", upload.url);
        xhr.setRequestHeader("Content-Type", file.type || "audio/mpeg");
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`S3 ${xhr.status}`)));
        xhr.onerror = () => reject(new Error("network"));
        xhr.send(file);
      });
      setS3Key(key);
      setCreateResult(`Uploaded → ${key}`);
    } catch (err) {
      setCreateResult(err instanceof Error ? `Upload failed: ${err.message}` : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateResult(null);
    try {
      const res = await createAudioTrack(token, {
        title,
        category,
        durationSeconds: Number(duration),
        s3Key,
        ...(artist.trim() && { artist: artist.trim() }),
        ...(summary.trim() && { summary: summary.trim() }),
        ...(coverUrl.trim() && { coverUrl: coverUrl.trim() }),
      });
      if (res.success) {
        setCreateResult(`Registered "${res.data?.title}" (${res.data?.id})`);
        setTitle(""); setArtist(""); setDuration(""); setSummary(""); setCoverUrl(""); setS3Key("");
        refetchTracks();
      } else {
        setCreateResult(res.message ?? "Create failed");
      }
    } catch (err) {
      setCreateResult(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  const inputCls = "w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="font-heading font-bold text-2xl mb-1">Audio & Podcast API</h1>
        <p className="text-muted text-sm">
          Paste the terraform outputs after <code className="font-mono text-xs">make up</code>. The public catalog goes live the moment the config is complete.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-theme bg-surface border border-white/10 p-4">
          <div className="text-xs text-muted mb-1">Status</div>
          <div className={`font-semibold ${cfg?.deployed ? "text-green-400" : "text-yellow-400"}`}>
            {cfg?.deployed ? "Deployed" : "Not configured"}
          </div>
        </div>
        <div className="rounded-theme bg-surface border border-white/10 p-4">
          <div className="text-xs text-muted mb-1">Tracks</div>
          <div className="font-semibold">{cfg?.deployed ? tracks.length : "—"}</div>
        </div>
        <div className="rounded-theme bg-surface border border-white/10 p-4">
          <div className="text-xs text-muted mb-1">Catalog API</div>
          <div className="font-semibold text-xs truncate">{cfg?.api_url ?? "—"}</div>
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
                placeholder={f.secret ? (cfg?.secret_access_key ? "(stored - type to replace)" : f.placeholder) : f.placeholder}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className={`${inputCls} font-mono`}
              />
            </div>
          ))}
          <div className="sm:col-span-2 flex items-center gap-3 mt-2">
            <button type="submit" disabled={saving || Object.keys(form).length === 0}
              className="rounded-theme bg-primary text-white px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
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
          Terraform outputs: <code className="font-mono">api_url</code>, <code className="font-mono">tracks_table</code>, <code className="font-mono">progress_table</code>, <code className="font-mono">audio_bucket</code>, <code className="font-mono">admin_key_ssm_name</code> + broker creds from <code className="font-mono">make output</code>.
        </p>
      </section>

      {/* Track registration */}
      <section className="rounded-theme bg-surface border border-white/10 p-5">
        <h2 className="font-semibold mb-4">Register Track</h2>
        <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title *" required className={inputCls} />
          <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" className={inputCls} />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            {TRACK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={duration} onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Duration (seconds) *" required className={inputCls} />
          <input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="Cover image URL" className={inputCls} />
          <div className="flex gap-2">
            <input value={s3Key} onChange={(e) => setS3Key(e.target.value)} placeholder="audio/…/file.mp3 *" required className={`${inputCls} font-mono`} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || !cfg?.deployed}
              className="rounded-theme border border-white/15 px-3 text-xs text-muted hover:border-primary hover:text-primary transition-colors whitespace-nowrap disabled:opacity-50">
              {uploading ? `${uploadPct}%` : "Upload"}
            </button>
            <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={handleUpload} />
          </div>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary" rows={2} className={`${inputCls} sm:col-span-2`} />
          <div className="sm:col-span-2 flex items-center gap-3">
            <button type="submit" disabled={creating || !cfg?.deployed || !s3Key}
              className="rounded-theme bg-primary text-white px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
              {creating ? "Registering…" : "Register track"}
            </button>
            {createResult && (
              <span className={`text-xs ${createResult.startsWith("Registered") || createResult.startsWith("Uploaded") ? "text-green-400" : "text-red-400"}`}>
                {createResult}
              </span>
            )}
          </div>
        </form>
      </section>

      {/* Tracks list */}
      <section className="rounded-theme bg-surface border border-white/10 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Tracks ({tracks.length})</h2>
          <button onClick={() => refetchTracks()} className="text-xs text-muted hover:text-white transition-colors">Refresh</button>
        </div>
        {tracks.length === 0 ? (
          <p className="text-sm text-muted">{cfg?.deployed ? "No tracks registered yet." : "Deploy + configure first."}</p>
        ) : (
          <div className="space-y-2">
            {tracks.map((t) => (
              <div key={t.id} className="rounded bg-white/5 px-3 py-2 text-sm flex items-center gap-3 flex-wrap">
                <span className="flex-1 truncate font-medium">{t.title}</span>
                <span className="text-xs text-muted">{t.artist ?? "—"}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary">{t.category}</span>
                <span className="text-xs text-muted font-mono truncate max-w-48">{t.s3Key}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
