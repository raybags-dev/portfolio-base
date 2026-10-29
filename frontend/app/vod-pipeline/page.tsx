"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ApiError,
  getBootstrap,
  getVodConfig,
  getVodJob,
  requestVodUpload,
  submitTryoutRequest,
  type VodJob,
} from "@/lib/api";
import ThemeProvider from "@/components/ThemeProvider";
import Navbar from "@/components/Navbar";
import { Footer } from "@/components/sections";
import RunProjectDisclaimer from "@/components/RunProjectDisclaimer";

const APP_KEY = "vod-pipeline";
const TOKEN_KEY = "vod_pipeline_token";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "processing"; jobId: string }
  | { kind: "ready"; job: VodJob }
  | { kind: "error"; message: string };

function statusPill(status: string): { bg: string; text: string } {
  if (status === "COMPLETE") return { bg: "bg-green-500/20", text: "text-green-400" };
  if (status === "ERROR") return { bg: "bg-red-500/20", text: "text-red-400" };
  if (status === "PROGRESSING" || status === "SUBMITTED")
    return { bg: "bg-yellow-500/20", text: "text-yellow-400" };
  return { bg: "bg-white/10", text: "text-muted" };
}

export default function VodPipelinePage() {
  const { data: bootstrap } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap, staleTime: Infinity });
  const { data: config } = useQuery({ queryKey: ["vod-config"], queryFn: getVodConfig });

  const project = useMemo(
    () => bootstrap?.projects.find((p) => p.service_key === APP_KEY) ?? null,
    [bootstrap],
  );

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [token, setToken] = useState<string>("");
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestState, setRequestState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [jobs, setJobs] = useState<VodJob[]>([]);
  const pendingFile = useRef<File | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  // Attach hls.js when a stream becomes ready (Safari plays HLS natively).
  useEffect(() => {
    if (phase.kind !== "ready" || !phase.job.stream_url || !videoRef.current) return;
    const video = videoRef.current;
    const url = phase.job.stream_url;
    let hls: { destroy(): void } | null = null;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          hls = new Hls();
          (hls as InstanceType<typeof Hls>).loadSource(url);
          (hls as InstanceType<typeof Hls>).attachMedia(video);
        }
      });
    }
    return () => hls?.destroy();
  }, [phase]);

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    pollTimer.current = setInterval(async () => {
      try {
        const job = await getVodJob(jobId);
        setJobs((prev) => [job, ...prev.filter((j) => j.job_id !== job.job_id)]);
        if (job.status === "COMPLETE") {
          stopPolling();
          setPhase({ kind: "ready", job });
        } else if (job.status === "ERROR") {
          stopPolling();
          setPhase({ kind: "error", message: job.error ?? "Transcode failed" });
        }
      } catch {
        /* transient poll failure - keep polling */
      }
    }, 3000);
  }, []);

  const uploadToS3 = useCallback((url: string, file: File, onProgress: (pct: number) => void) => {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`S3 upload failed (${xhr.status})`)));
      xhr.onerror = () => reject(new Error("S3 upload failed (network)"));
      xhr.send(file);
    });
  }, []);

  const doUpload = useCallback(
    async (file: File, appToken?: string) => {
      try {
        const res = await requestVodUpload(
          { filename: file.name, size_bytes: file.size, content_type: file.type || "video/mp4" },
          appToken,
        );
        setPhase({ kind: "uploading", progress: 0 });
        await uploadToS3(res.upload.url, file, (pct) => setPhase({ kind: "uploading", progress: pct }));
        setPhase({ kind: "processing", jobId: res.job_id });
        startPolling(res.job_id);
      } catch (err) {
        if (err instanceof ApiError && err.status === 403 && err.message === "rate_limited") {
          pendingFile.current = file;
          setShowTokenModal(true);
          return;
        }
        if (err instanceof ApiError && err.status === 403 && err.message === "invalid_token") {
          sessionStorage.removeItem(TOKEN_KEY);
          setToken("");
          setPhase({ kind: "error", message: "Token expired or quota exhausted - request a new one." });
          return;
        }
        setPhase({ kind: "error", message: err instanceof Error ? err.message : "Upload failed" });
      }
    },
    [startPolling, uploadToS3],
  );

  const handleFilePick = (file: File) => {
    if (!config) return;
    if (file.size > config.max_upload_mb * 1024 * 1024) {
      setPhase({ kind: "error", message: `File exceeds the ${config.max_upload_mb} MB tryout limit.` });
      return;
    }
    const extOk = config.allowed_extensions.some((e) => file.name.toLowerCase().endsWith(e));
    if (!extOk) {
      setPhase({ kind: "error", message: `Only ${config.allowed_extensions.join(", ")} files are allowed.` });
      return;
    }
    if (!sessionStorage.getItem("run_disclaimer_ack_vod")) {
      pendingFile.current = file;
      setShowDisclaimer(true);
      return;
    }
    // Token-only tryout: no key -> ask for one up front instead of failing.
    if (config?.requires_token && !token) {
      pendingFile.current = file;
      setShowTokenModal(true);
      return;
    }
    doUpload(file, token || undefined);
  };

  const submitRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setRequestState("busy");
    try {
      await submitTryoutRequest({
        app_key: APP_KEY,
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        reason: String(fd.get("reason") ?? ""),
      });
      setRequestState("sent");
    } catch {
      setRequestState("error");
    }
  };

  const redeemToken = () => {
    const t = tokenInput.trim();
    if (!t) return;
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setShowTokenModal(false);
    setTokenInput("");
    if (pendingFile.current) doUpload(pendingFile.current, t);
  };

  const notDeployed = config && !config.deployed;

  if (!bootstrap) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--color-bg)", color: "var(--color-fg)" }}
      >
        <span className="text-muted text-sm">Loading…</span>
      </main>
    );
  }

  return (
    <>
      <ThemeProvider theme={bootstrap.theme} />
      <div style={{ background: "var(--color-bg)", minHeight: "100vh", color: "var(--color-fg)" }}>
        <Navbar site={bootstrap.site_configuration} theme={bootstrap.theme} sections={bootstrap.sections} />
        <main className="container-x pb-16 pt-24">
          <Link href="/" className="text-sm text-muted hover:text-primary transition-colors">
            ← Back to portfolio
          </Link>

          {/* Hero (data-driven from the project record) */}
          <div className="mt-6 mb-10">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-heading text-3xl md:text-4xl font-bold">
                {project?.title ?? "VOD & HLS Packaging Pipeline"}
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary">AWS</span>
              {config && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    config.deployed ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                  }`}
                >
                  {config.deployed ? "live" : "deploying"}
                </span>
              )}
            </div>
            <p className="text-muted mt-3 max-w-2xl">
              {project?.summary ??
                "Upload an mp4; AWS MediaConvert packages it into adaptive HLS streamed via CloudFront."}
            </p>
            {project?.tech_tags && (
              <div className="flex flex-wrap gap-2 mt-4">
                {project.tech_tags.map((t) => (
                  <span key={t} className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 text-muted">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {notDeployed && (
            <div className="rounded-theme bg-yellow-500/10 border border-yellow-500/30 p-4 mb-8 text-sm text-yellow-300">
              The AWS infrastructure for this demo is being deployed (it runs on-demand to control
              cost). Leave your email below and you&apos;ll get a token the moment it&apos;s live.
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Upload card */}
            <section className="rounded-theme bg-surface border border-white/10 p-5">
              <h2 className="font-heading font-semibold text-lg mb-1">Try it</h2>
              <p className="text-sm text-muted mb-4">
                Upload a short clip (max {config?.max_upload_mb ?? 100} MB, mp4/mov/mkv) with a
                24h tryout token ({config?.quota_per_token ?? 2} transcodes per token).{" "}
                <button
                  className="text-primary hover:underline"
                  onClick={() => setShowRequestForm(true)}
                >
                  Request one
                </button>{" "}
                - I approve every request personally.
              </p>

              <label
                className={`flex flex-col items-center justify-center gap-2 rounded-theme border-2 border-dashed border-white/15 p-8 text-center cursor-pointer hover:border-primary/60 transition-colors ${
                  notDeployed ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/x-matroska,.mp4,.mov,.mkv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFilePick(f);
                    e.target.value = "";
                  }}
                />
                <span className="text-3xl">🎬</span>
                <span className="text-sm font-medium">Choose a video file</span>
                <span className="text-xs text-muted">H.264/AAC · 720p/1080p single-pass · auto-deleted after 7 days</span>
              </label>

              {phase.kind === "uploading" && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted mb-1">
                    <span>Uploading to S3…</span>
                    <span>{phase.progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${phase.progress}%` }} />
                  </div>
                </div>
              )}

              {phase.kind === "processing" && (
                <div className="mt-4 rounded-theme bg-white/5 border border-white/10 p-4 text-sm">
                  <span className="text-yellow-400 font-medium">Transcoding…</span>{" "}
                  <span className="text-muted">MediaConvert is packaging your HLS renditions. This takes ~30s per minute of video.</span>
                </div>
              )}

              {phase.kind === "error" && (
                <div className="mt-4 rounded-theme bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300">
                  {phase.message}
                </div>
              )}

              {phase.kind === "ready" && phase.job.stream_url && (
                <div className="mt-4">
                  <div className="text-sm text-green-400 font-medium mb-2">Your HLS stream is ready:</div>
                  <video ref={videoRef} controls className="w-full rounded-theme border border-white/10 bg-black" />
                  <div className="mt-2 text-xs text-muted break-all font-mono">{phase.job.stream_url}</div>
                </div>
              )}
            </section>

            {/* Token request card */}
            <section className="rounded-theme bg-surface border border-white/10 p-5">
              <h2 className="font-heading font-semibold text-lg mb-1">Need more runs?</h2>
              <p className="text-sm text-muted mb-4">
                Request a 24-hour tryout token ({config?.quota_per_token ?? 2} transcodes). I review
                every request personally - the token arrives by email.
              </p>

              {!showRequestForm && requestState !== "sent" && (
                <button
                  onClick={() => setShowRequestForm(true)}
                  className="rounded-theme bg-primary text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Request 24h token
                </button>
              )}

              {showRequestForm && requestState !== "sent" && (
                <form onSubmit={submitRequest} className="space-y-3">
                  <input
                    name="name"
                    required
                    placeholder="Your name"
                    className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="Your email"
                    className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <textarea
                    name="reason"
                    rows={3}
                    placeholder="What do you want to try?"
                    className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={requestState === "busy"}
                      className="rounded-theme bg-primary text-white px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {requestState === "busy" ? "Sending…" : "Send request"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRequestForm(false)}
                      className="rounded-theme border border-white/15 px-4 py-2 text-sm text-muted hover:border-white/30 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  {requestState === "error" && (
                    <p className="text-xs text-red-400">Failed to send - please try again.</p>
                  )}
                </form>
              )}

              {requestState === "sent" && (
                <div className="rounded-theme bg-green-500/10 border border-green-500/30 p-4 text-sm text-green-300">
                  Request received! I&apos;ll review it and email your token shortly.
                </div>
              )}

              {/* How it works */}
              <div className="mt-6 pt-5 border-t border-white/10">
                <h3 className="text-sm font-semibold mb-3">How it works</h3>
                <ol className="space-y-2 text-sm text-muted">
                  <li><span className="text-primary font-mono">1.</span> Browser PUTs the file straight to S3 via a bounded presigned URL (video never touches this server)</li>
                  <li><span className="text-primary font-mono">2.</span> S3 event triggers a Lambda → MediaConvert single-pass H.264/AAC job</li>
                  <li><span className="text-primary font-mono">3.</span> Multi-rendition HLS lands in a private bucket; EventBridge updates job status</li>
                  <li><span className="text-primary font-mono">4.</span> You stream the result through CloudFront (Origin Access Control)</li>
                </ol>
              </div>
            </section>
          </div>

          {/* Jobs history */}
          {jobs.length > 0 && (
            <section className="mt-10">
              <h2 className="font-heading font-semibold text-lg mb-3">Your jobs</h2>
              <div className="space-y-2">
                {jobs.map((j) => {
                  const pill = statusPill(j.status);
                  return (
                    <div key={j.job_id} className="flex items-center gap-3 rounded-theme bg-surface border border-white/10 px-4 py-2.5 text-sm">
                      <span className="flex-1 truncate">{j.filename}</span>
                      <span className="text-xs text-muted">{j.size_mb} MB</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${pill.bg} ${pill.text}`}>{j.status}</span>
                      {j.status === "COMPLETE" && j.stream_url && (
                        <button
                          onClick={() => setPhase({ kind: "ready", job: j })}
                          className="text-xs text-primary hover:underline"
                        >
                          play
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </main>
        {bootstrap && <Footer data={bootstrap} />}

        {/* Disclaimer modal */}
        {showDisclaimer && (
          <RunProjectDisclaimer
            projectName="VOD & HLS Pipeline"
            onRun={() => {
              sessionStorage.setItem("run_disclaimer_ack_vod", "1");
              setShowDisclaimer(false);
              if (pendingFile.current) doUpload(pendingFile.current, token || undefined);
            }}
            onClose={() => setShowDisclaimer(false)}
          />
        )}

        {/* Token modal */}
        {showTokenModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md bg-surface border border-white/15 rounded-2xl shadow-2xl p-6">
              <h3 className="font-heading font-bold text-lg mb-2">Access Token Required</h3>
              <p className="text-sm text-muted mb-4">
                You&apos;ve used your free run. Paste your 24h tryout token, or{" "}
                <button
                  className="text-primary hover:underline"
                  onClick={() => {
                    setShowTokenModal(false);
                    setShowRequestForm(true);
                  }}
                >
                  request one
                </button>
                .
              </p>
              <input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Paste token here"
                className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm font-mono outline-none focus:border-primary mb-4"
              />
              <div className="flex gap-2">
                <button
                  onClick={redeemToken}
                  className="rounded-theme bg-primary text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Use token
                </button>
                <button
                  onClick={() => setShowTokenModal(false)}
                  className="rounded-theme border border-white/15 px-4 py-2 text-sm text-muted hover:border-white/30 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
