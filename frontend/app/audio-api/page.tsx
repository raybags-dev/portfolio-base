"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  audioGetTrack,
  audioListTracks,
  audioPatchProgress,
  getAudioConfig,
  getBootstrap,
  submitTryoutRequest,
  type AudioTrack,
  type AudioTrackDetail,
} from "@/lib/api";
import ThemeProvider from "@/components/ThemeProvider";
import Navbar from "@/components/Navbar";
import { Footer } from "@/components/sections";

const APP_KEY = "audio-api";
const LISTENER_KEY = "audio_listener_id";

const CATEGORIES = ["all", "podcast", "music", "lecture", "demo"] as const;

function getListenerId(): string {
  try {
    let id = localStorage.getItem(LISTENER_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(LISTENER_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AudioApiPage() {
  const { data: bootstrap } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap, staleTime: Infinity });
  const { data: config } = useQuery({ queryKey: ["audio-config"], queryFn: getAudioConfig });

  const project = useMemo(
    () => bootstrap?.projects.find((p) => p.service_key === APP_KEY) ?? null,
    [bootstrap],
  );

  const [category, setCategory] = useState<string>("all");
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState<AudioTrackDetail | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestState, setRequestState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const apiUrl = config?.api_url ?? null;

  const loadTracks = useCallback(
    async (cat: string) => {
      if (!apiUrl) return;
      setLoadingTracks(true);
      setLoadError(null);
      try {
        const items = await audioListTracks(apiUrl, cat === "all" ? undefined : cat);
        setTracks(items);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load tracks");
      } finally {
        setLoadingTracks(false);
      }
    },
    [apiUrl],
  );

  useEffect(() => {
    loadTracks(category);
  }, [category, loadTracks]);

  const play = useCallback(
    async (track: AudioTrack) => {
      if (!apiUrl) return;
      const listenerId = getListenerId();
      try {
        const detail = await audioGetTrack(apiUrl, track.id, listenerId);
        setActive(detail);
        setPlayingId(track.id);
      } catch {
        setLoadError("Failed to load stream");
      }
    },
    [apiUrl],
  );

  // Attach stream + restore progress
  useEffect(() => {
    if (!active || !audioRef.current) return;
    const audio = audioRef.current;
    audio.src = active.streamUrl;
    if (active.progress && active.progress.positionSeconds > 0) {
      audio.currentTime = active.progress.positionSeconds;
    }
    audio.play().catch(() => {});
  }, [active]);

  // Sync progress every 5s while playing
  useEffect(() => {
    if (progressTimer.current) clearInterval(progressTimer.current);
    if (!active || !apiUrl) return;
    progressTimer.current = setInterval(() => {
      const audio = audioRef.current;
      if (audio && !audio.paused && audio.currentTime > 0) {
        audioPatchProgress(apiUrl, active.track.id, getListenerId(), audio.currentTime);
      }
    }, 5000);
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, [active, apiUrl]);

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

  const notDeployed = config && !config.deployed;

  if (!bootstrap) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-bg)", color: "var(--color-fg)" }}>
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

          <div className="mt-6 mb-8">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-heading text-3xl md:text-4xl font-bold">
                {project?.title ?? "Audio & Podcast Stream API"}
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary">AWS</span>
              {config && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${config.deployed ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                  {config.deployed ? "live" : "deploying"}
                </span>
              )}
            </div>
            <p className="text-muted mt-3 max-w-2xl">
              {project?.summary ?? "Serverless REST API for audio metadata with presigned S3 streaming."}
            </p>
            {project?.tech_tags && (
              <div className="flex flex-wrap gap-2 mt-4">
                {project.tech_tags.map((t) => (
                  <span key={t} className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 text-muted">{t}</span>
                ))}
              </div>
            )}
          </div>

          {notDeployed && (
            <div className="rounded-theme bg-yellow-500/10 border border-yellow-500/30 p-4 mb-8 text-sm text-yellow-300">
              The AWS infrastructure for this demo is being deployed (it runs on-demand to control cost).
              Leave your email below and you&apos;ll be notified when it&apos;s live.
            </div>
          )}

          {/* Player card */}
          {active && (
            <section className="rounded-theme bg-surface border border-primary/30 p-5 mb-8">
              <div className="flex items-center gap-4">
                {active.track.coverUrl ? (
                  <img src={active.track.coverUrl} alt="" className="w-14 h-14 rounded-theme object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-theme bg-primary/15 flex items-center justify-center text-2xl">🎧</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{active.track.title}</div>
                  <div className="text-xs text-muted">
                    {active.track.artist ?? "Unknown"} · {fmtDuration(active.track.durationSeconds)} ·{" "}
                    <span className="text-primary/80">{active.track.category}</span>
                  </div>
                </div>
                <span className="text-xs text-muted">stream valid {Math.round(active.expiresIn / 60)}m</span>
              </div>
              <audio ref={audioRef} controls className="w-full mt-4" />
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Track browser */}
            <section className="lg:col-span-2 rounded-theme bg-surface border border-white/10 p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="font-heading font-semibold text-lg">Catalog</h2>
                <div className="flex gap-1.5 flex-wrap">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        category === c ? "bg-primary text-white border-primary" : "border-white/15 text-muted hover:border-white/30"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {!apiUrl ? (
                <p className="text-sm text-muted">Catalog unavailable until the API is deployed.</p>
              ) : loadingTracks ? (
                <p className="text-sm text-muted">Loading tracks…</p>
              ) : loadError ? (
                <p className="text-sm text-red-400">{loadError}</p>
              ) : tracks.length === 0 ? (
                <p className="text-sm text-muted">No tracks in this category yet.</p>
              ) : (
                <div className="space-y-2">
                  {tracks.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 rounded-theme bg-white/5 border border-white/10 px-4 py-2.5 text-sm">
                      {t.coverUrl ? (
                        <img src={t.coverUrl} alt="" className="w-9 h-9 rounded object-cover flex-none" />
                      ) : (
                        <div className="w-9 h-9 rounded bg-primary/10 flex items-center justify-center flex-none">🎵</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{t.title}</div>
                        <div className="text-xs text-muted truncate">{t.artist ?? "—"} · {t.category}</div>
                      </div>
                      <span className="text-xs text-muted flex-none">{fmtDuration(t.durationSeconds)}</span>
                      <button
                        onClick={() => play(t)}
                        className={`text-xs px-3 py-1.5 rounded-theme flex-none transition-colors ${
                          playingId === t.id ? "bg-primary/30 text-primary" : "bg-primary/15 text-primary hover:bg-primary/25"
                        }`}
                      >
                        {playingId === t.id ? "▶ playing" : "▶ play"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Info / request card */}
            <section className="rounded-theme bg-surface border border-white/10 p-5 space-y-4">
              <div>
                <h2 className="font-heading font-semibold text-lg mb-1">How it works</h2>
                <ol className="space-y-2 text-sm text-muted">
                  <li><span className="text-primary font-mono">1.</span> Browser reads the catalog straight from API Gateway (public reads, near-zero cost)</li>
                  <li><span className="text-primary font-mono">2.</span> Play fetches a 1h presigned S3 URL — audio streams direct from S3, never through this server</li>
                  <li><span className="text-primary font-mono">3.</span> Your playback position syncs every 5s — pick up where you left off on any device</li>
                </ol>
              </div>

              <div className="pt-4 border-t border-white/10">
                <h3 className="text-sm font-semibold mb-2">Want the admin walkthrough?</h3>
                <p className="text-sm text-muted mb-3">
                  See the track registration + upload flow (Zod-validated writes, presigned S3 PUT, SSM-held admin key).
                </p>
                {!showRequestForm && requestState !== "sent" && (
                  <button
                    onClick={() => setShowRequestForm(true)}
                    className="rounded-theme bg-primary text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Request access
                  </button>
                )}
                {showRequestForm && requestState !== "sent" && (
                  <form onSubmit={submitRequest} className="space-y-3">
                    <input name="name" required placeholder="Your name" className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm outline-none focus:border-primary" />
                    <input name="email" type="email" required placeholder="Your email" className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm outline-none focus:border-primary" />
                    <textarea name="reason" rows={3} placeholder="What do you want to try?" className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm outline-none focus:border-primary" />
                    <div className="flex gap-2">
                      <button type="submit" disabled={requestState === "busy"} className="rounded-theme bg-primary text-white px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                        {requestState === "busy" ? "Sending…" : "Send request"}
                      </button>
                      <button type="button" onClick={() => setShowRequestForm(false)} className="rounded-theme border border-white/15 px-4 py-2 text-sm text-muted hover:border-white/30 transition-colors">
                        Cancel
                      </button>
                    </div>
                    {requestState === "error" && <p className="text-xs text-red-400">Failed to send - please try again.</p>}
                  </form>
                )}
                {requestState === "sent" && (
                  <div className="rounded-theme bg-green-500/10 border border-green-500/30 p-3 text-sm text-green-300">
                    Request received! I&apos;ll review and email you shortly.
                  </div>
                )}
              </div>
            </section>
          </div>
        </main>
        {bootstrap && <Footer data={bootstrap} />}
      </div>
    </>
  );
}
