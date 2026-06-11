"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/store";
import {
  generateAppToken,
  listAppTokens,
  revokeAppToken,
  getDevMode,
  toggleDevMode,
  listIpUsage,
  deleteIpUsage,
  listGuestSessions,
  deleteGuestSession,
  type AppToken,
  type IpUsageEntry,
  type CrawlSession,
} from "@/lib/api";

function timeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function statusBadge(tok: AppToken) {
  if (tok.is_used) return <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">used</span>;
  if (tok.is_expired) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400">expired</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/20 text-yellow-400">active</span>;
}

export default function TokensPage() {
  const { token: authToken } = useAuth();
  const [tokens, setTokens] = useState<AppToken[]>([]);
  const [ipUsage, setIpUsage] = useState<IpUsageEntry[]>([]);
  const [devMode, setDevMode] = useState<{ current_ip: string; dev_mode: boolean; whitelisted_ips: string[] } | null>(null);
  const [guestSessions, setGuestSessions] = useState<CrawlSession[]>([]);
  const [guestModal, setGuestModal] = useState(false);
  const [newToken, setNewToken] = useState<AppToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [togglingDev, setTogglingDev] = useState(false);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!authToken) return;
    const [toks, usage, dm, guests] = await Promise.all([
      listAppTokens(authToken).catch(() => [] as AppToken[]),
      listIpUsage(authToken).catch(() => [] as IpUsageEntry[]),
      getDevMode(authToken).catch(() => null),
      listGuestSessions(authToken).catch(() => [] as CrawlSession[]),
    ]);
    setTokens(toks);
    setIpUsage(usage);
    setDevMode(dm);
    setGuestSessions(guests);
  }, [authToken]);

  useEffect(() => { load(); }, [load]);

  // Tick every second to update countdown timers
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  async function handleGenerate() {
    if (!authToken) return;
    setGenerating(true);
    try {
      const tok = await generateAppToken(authToken);
      setNewToken(tok);
      setTokens(prev => [tok, ...prev]);
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke(id: number) {
    if (!authToken) return;
    await revokeAppToken(authToken, id);
    setTokens(prev => prev.filter(t => t.id !== id));
    if (newToken?.id === id) setNewToken(null);
  }

  async function handleToggleDev() {
    if (!authToken) return;
    setTogglingDev(true);
    try {
      const result = await toggleDevMode(authToken);
      setDevMode(result);
    } finally {
      setTogglingDev(false);
    }
  }

  async function handleDeleteUsage(id: number) {
    if (!authToken) return;
    await deleteIpUsage(authToken, id);
    setIpUsage(prev => prev.filter(e => e.id !== id));
  }

  async function handleDeleteGuestSession(id: number) {
    if (!authToken) return;
    await deleteGuestSession(authToken, id);
    setGuestSessions(prev => prev.filter(s => s.id !== id));
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const activeTokens = tokens.filter(t => !t.is_used && !t.is_expired);
  const pastTokens = tokens.filter(t => t.is_used || t.is_expired);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="font-heading font-bold text-2xl mb-1">Access Tokens</h1>
        <p className="text-muted text-sm">
          Any IP can run any app once for free. A second run requires a token you generate here.
          Tokens are valid for 10 minutes and single-use.
        </p>
      </div>

      {/* Dev mode toggle */}
      <section className="rounded-theme bg-surface border border-white/10 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold mb-1">Dev Mode</h2>
            <p className="text-sm text-muted">
              When enabled, the token requirement is bypassed for your current IP
              {devMode ? ` (${devMode.current_ip})` : ""}. Use this while you&apos;re developing so you don&apos;t consume tokens on every test run.
            </p>
            {devMode && devMode.whitelisted_ips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {devMode.whitelisted_ips.map(ip => (
                  <span key={ip} className="text-xs font-mono bg-white/10 px-2 py-0.5 rounded">{ip}</span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleToggleDev}
            disabled={togglingDev}
            className={`flex-shrink-0 relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
              devMode?.dev_mode ? "bg-primary" : "bg-white/20"
            }`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              devMode?.dev_mode ? "translate-x-6" : "translate-x-1"
            }`} />
          </button>
        </div>
        <div className={`mt-3 text-xs font-medium ${devMode?.dev_mode ? "text-green-400" : "text-muted"}`}>
          {devMode?.dev_mode ? "Dev mode ON — token checks skipped for your IP" : "Dev mode OFF — normal rate limiting applies"}
        </div>
      </section>

      {/* Generate */}
      <section className="rounded-theme bg-surface border border-white/10 p-5">
        <h2 className="font-semibold mb-3">Generate Token</h2>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="rounded-theme bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {generating ? "Generating…" : "+ Generate Token"}
        </button>

        {newToken && !newToken.is_expired && (
          <div className="mt-4 rounded-theme bg-yellow-500/10 border border-yellow-500/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-yellow-300">New token — share this with the user</span>
              <span className="text-xs text-yellow-400 font-mono">{timeLeft(newToken.expires_at)}</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs bg-black/30 px-3 py-2 rounded break-all">{newToken.token}</code>
              <button
                onClick={() => copy(newToken.token)}
                className="text-xs rounded px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors flex-shrink-0"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Active tokens */}
      {activeTokens.length > 0 && (
        <section className="rounded-theme bg-surface border border-white/10 p-5">
          <h2 className="font-semibold mb-3">Active Tokens ({activeTokens.length})</h2>
          <div className="space-y-2">
            {activeTokens.map(tok => (
              <div key={tok.id} className="flex items-center gap-3 rounded bg-white/5 px-3 py-2 text-sm">
                <code className="flex-1 font-mono text-xs text-muted/80 truncate">{tok.token}</code>
                <span className="text-xs font-mono text-yellow-400 w-16 text-right flex-shrink-0">{timeLeft(tok.expires_at)}</span>
                {statusBadge(tok)}
                <button onClick={() => copy(tok.token)} className="text-xs text-muted hover:text-white flex-shrink-0">copy</button>
                <button onClick={() => handleRevoke(tok.id)} className="text-xs text-red-400 hover:text-red-300 flex-shrink-0">revoke</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Past tokens */}
      {pastTokens.length > 0 && (
        <section className="rounded-theme bg-surface border border-white/10 p-5">
          <h2 className="font-semibold mb-3 text-muted">Past Tokens</h2>
          <div className="space-y-2">
            {pastTokens.slice(0, 20).map(tok => (
              <div key={tok.id} className="flex items-center gap-3 rounded bg-white/5 px-3 py-2 text-sm opacity-60">
                <code className="flex-1 font-mono text-xs text-muted/60 truncate">{tok.token.slice(0, 20)}…</code>
                {statusBadge(tok)}
                {tok.used_by_ip && <span className="text-xs text-muted font-mono">{tok.used_by_ip}</span>}
                <button onClick={() => handleRevoke(tok.id)} className="text-xs text-red-400/60 hover:text-red-300 flex-shrink-0">delete</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* IP usage log */}
      <section className="rounded-theme bg-surface border border-white/10 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold">IP Usage Log</h2>
            <p className="text-xs text-muted mt-0.5">IPs that have used their free run. Delete an entry to reset that IP.</p>
          </div>
          <button onClick={load} className="text-xs text-muted hover:text-white">Refresh</button>
        </div>
        {ipUsage.length === 0 ? (
          <p className="text-sm text-muted">No usage recorded yet.</p>
        ) : (
          <div className="space-y-1">
            {ipUsage.map(entry => (
              <div key={entry.id} className="flex items-center gap-3 rounded bg-white/5 px-3 py-2 text-sm">
                <span className="font-mono text-xs text-muted w-32 flex-shrink-0">{entry.ip}</span>
                <span className="text-xs text-primary flex-shrink-0">{entry.app_name}</span>
                <span className="text-xs text-muted flex-1">{new Date(entry.first_used_at).toLocaleString()}</span>
                <button
                  onClick={() => handleDeleteUsage(entry.id)}
                  className="text-xs text-red-400/70 hover:text-red-300"
                >
                  reset
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Guest sessions */}
      <section className="rounded-theme bg-surface border border-white/10 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold">Guest Sessions</h2>
            <p className="text-xs text-muted mt-0.5">
              Crawl sessions created by non-whitelisted IPs.{" "}
              <span className="text-yellow-400">{guestSessions.length} session{guestSessions.length !== 1 ? "s" : ""}</span>
            </p>
          </div>
          <button
            onClick={() => setGuestModal(true)}
            className="text-xs rounded-theme border border-white/15 px-3 py-1.5 hover:border-primary hover:text-primary transition-colors"
          >
            View all
          </button>
        </div>
        {guestSessions.length === 0 ? (
          <p className="text-sm text-muted">No guest sessions yet.</p>
        ) : (
          <div className="space-y-1">
            {guestSessions.slice(0, 5).map(s => (
              <div key={s.id} className="flex items-center gap-3 rounded bg-white/5 px-3 py-2 text-sm">
                <span className="font-mono text-xs text-muted w-28 flex-shrink-0">{(s as unknown as { client_ip?: string }).client_ip || "unknown"}</span>
                <span className="flex-1 text-xs truncate text-muted">{s.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                  s.status === "done" ? "bg-green-500/20 text-green-400" :
                  s.status === "failed" ? "bg-red-500/20 text-red-400" :
                  "bg-white/10 text-muted"
                }`}>{s.status}</span>
                <span className="text-xs text-muted flex-shrink-0">{new Date(s.created_at).toLocaleDateString()}</span>
              </div>
            ))}
            {guestSessions.length > 5 && (
              <button onClick={() => setGuestModal(true)} className="text-xs text-primary hover:underline mt-1">
                View {guestSessions.length - 5} more…
              </button>
            )}
          </div>
        )}
      </section>

      {/* Guest sessions modal */}
      {guestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-surface border border-white/15 rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h2 className="font-heading font-bold text-lg">Guest Sessions ({guestSessions.length})</h2>
              <button onClick={() => setGuestModal(false)} className="text-muted hover:text-text transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-3">
              {guestSessions.length === 0 ? (
                <p className="text-sm text-muted">No guest sessions.</p>
              ) : guestSessions.map(s => {
                const ext = s as unknown as { client_ip?: string; session_contact?: Record<string, string> };
                return (
                  <div key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{s.name}</div>
                        <div className="text-xs text-muted mt-0.5 font-mono">{ext.client_ip || "unknown IP"}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          s.status === "done" ? "bg-green-500/20 text-green-400" :
                          s.status === "failed" ? "bg-red-500/20 text-red-400" :
                          "bg-white/10 text-muted"
                        }`}>{s.status}</span>
                        <button
                          onClick={() => handleDeleteGuestSession(s.id)}
                          className="text-xs text-red-400/70 hover:text-red-300 transition-colors"
                        >
                          delete
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-muted truncate mb-2">{s.target_url}</div>
                    {ext.session_contact && Object.values(ext.session_contact).some(Boolean) && (
                      <div className="mt-2 pt-2 border-t border-white/8 text-xs space-y-0.5">
                        <div className="text-primary/80 font-medium mb-1">Contact info provided:</div>
                        {ext.session_contact.name && <div>Name: <span className="text-text">{ext.session_contact.name}</span></div>}
                        {ext.session_contact.role && <div>Role: <span className="text-text">{ext.session_contact.role}</span></div>}
                        {ext.session_contact.email && <div>Email: <span className="text-text">{ext.session_contact.email}</span></div>}
                        {ext.session_contact.phone && <div>Phone: <span className="text-text">{ext.session_contact.phone}</span></div>}
                      </div>
                    )}
                    <div className="text-xs text-muted mt-2">{new Date(s.created_at).toLocaleString()}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
