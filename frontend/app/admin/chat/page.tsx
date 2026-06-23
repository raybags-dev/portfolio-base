"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/store";

// ---- Types ----
interface Session {
  session_id: string;
  visitor_name: string | null;
  visitor_email: string | null;
  status: string;
  human_active: boolean;
  created_at: string;
  message_count?: number;
}

interface ChatMsg {
  id?: number;
  sender: "user" | "agent" | "human" | "system";
  content: string;
  tool_call?: string | null;
  created_at?: string;
  ts?: number;
}

type ConnectionState = "disconnected" | "connecting" | "connected";

// ---- Helpers ----
// nginx rewrites /chat/api/v1/... → /api/v1/... at the chat backend (port 8010)
const CHAT_API = "/chat/api/v1";

function buildAdminWsUrl(token: string): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/admin?token=${encodeURIComponent(token)}`;
}

function fmtTime(ts: string | number | undefined): string {
  if (!ts) return "";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---- Sub-components ----

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${active ? "bg-emerald-400" : "bg-amber-400"}`}
    />
  );
}

function SessionRow({
  s,
  selected,
  hasUnread,
  onClick,
}: {
  s: Session;
  selected: boolean;
  hasUnread: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-start gap-2",
        selected ? "bg-primary/15 text-fg" : "hover:bg-white/5 text-muted",
      ].join(" ")}
    >
      <StatusDot active={s.human_active} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-fg truncate flex items-center gap-1.5">
          {s.visitor_name || "Anonymous"}
          {hasUnread && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-none" />}
        </p>
        <p className="text-[10px] text-muted truncate">{s.session_id.slice(0, 12)}…</p>
        <p className="text-[10px] text-muted mt-0.5">{relTime(s.created_at)}</p>
      </div>
      <span
        className={[
          "text-[9px] px-1.5 py-0.5 rounded-full flex-none mt-0.5",
          s.status === "escalated"
            ? "bg-rose-500/20 text-rose-400"
            : "bg-white/10 text-muted",
        ].join(" ")}
      >
        {s.status}
      </span>
    </button>
  );
}

function Bubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.sender === "user";
  const isSystem = msg.sender === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <span className="text-[11px] text-muted italic">{msg.content}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={[
          "w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-none",
          isUser ? "bg-sky-500/20 text-sky-400" : msg.sender === "human" ? "bg-emerald-600 text-white" : "bg-primary/20 text-primary",
        ].join(" ")}
      >
        {isUser ? "V" : msg.sender === "human" ? "R" : "AI"}
      </div>
      <div className={`max-w-[70%] flex flex-col gap-0.5 ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={[
            "px-3 py-2 text-sm rounded-2xl leading-relaxed break-words",
            isUser
              ? "bg-sky-500/20 text-sky-300 rounded-br-[4px]"
              : msg.sender === "human"
              ? "bg-emerald-600 text-white rounded-bl-[4px]"
              : "bg-surface border border-white/10 text-fg rounded-bl-[4px]",
          ].join(" ")}
        >
          {msg.content}
          {msg.tool_call && (
            <span className="ml-2 text-[10px] opacity-60">[{msg.tool_call}]</span>
          )}
        </div>
        <span className="text-[10px] text-muted px-1">
          {fmtTime(msg.created_at || msg.ts)}
        </span>
      </div>
    </div>
  );
}

// ---- Main page ----
export default function AdminChatPage() {
  // Use portfolio admin JWT directly — no manual token entry needed
  const portfolioToken = useAuth((s) => s.token) ?? "";
  const [adminToken, setAdminToken] = useState<string>(() => {
    if (typeof window !== "undefined") {
      // Prefer portfolio JWT; fall back to manually stored static token
      return localStorage.getItem("chat_admin_token") ?? "";
    }
    return "";
  });
  // Sync portfolioToken into adminToken on mount
  const [tokenInput, setTokenInput] = useState("");
  const [wsState, setWsState] = useState<ConnectionState>("disconnected");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [liveMsgs, setLiveMsgs] = useState<Record<string, ChatMsg[]>>({});
  const [reply, setReply] = useState("");
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveMsgs, selectedId]);

  // Load sessions
  const loadSessions = useCallback(async (token: string) => {
    try {
      const r = await fetch(`${CHAT_API}/sessions?token=${encodeURIComponent(token)}&limit=50`);
      if (r.ok) setSessions(await r.json());
    } catch { /* ignore */ }
  }, []);

  // Load historical messages for a session
  const loadMessages = useCallback(async (sid: string, token: string) => {
    setLoadingMsgs(true);
    try {
      const r = await fetch(`${CHAT_API}/sessions/${sid}?token=${encodeURIComponent(token)}`);
      if (r.ok) {
        const data = await r.json();
        setMessages(data.messages ?? []);
      }
    } catch { /* ignore */ }
    setLoadingMsgs(false);
  }, []);

  // Connect admin WebSocket
  const connectWs = useCallback((token: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setWsState("connecting");

    const ws = new WebSocket(buildAdminWsUrl(token));
    wsRef.current = ws;

    ws.onopen = () => {
      setWsState("connected");
      loadSessions(token);
    };

    ws.onclose = () => {
      setWsState("disconnected");
      setTimeout(() => connectWs(token), 4000);
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as {
          type: string;
          sender: "user" | "agent" | "human" | "system";
          content: string;
          session_id: string;
          ts: number;
          tool?: string;
        };
        if (data.type !== "msg") return;

        const sid = data.session_id;
        const newMsg: ChatMsg = {
          sender: data.sender,
          content: data.content,
          ts: data.ts,
          tool_call: data.tool,
        };

        setLiveMsgs((prev) => ({
          ...prev,
          [sid]: [...(prev[sid] ?? []), newMsg],
        }));

        if (selectedIdRef.current !== sid) {
          setUnreadIds((prev) => new Set(prev).add(sid));
        }

        // Refresh sessions list periodically
        loadSessions(token);
      } catch { /* ignore */ }
    };
  }, [loadSessions]);

  // Save token and connect
  function handleConnect() {
    const t = tokenInput.trim();
    if (!t) return;
    localStorage.setItem("chat_admin_token", t);
    setAdminToken(t);
    connectWs(t);
  }

  // Auto-connect using portfolio JWT (preferred) or previously saved static token
  useEffect(() => {
    const token = portfolioToken || adminToken;
    if (token) {
      setAdminToken(token);
      connectWs(token);
    }
    return () => wsRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioToken]);

  // Load messages when session selected
  useEffect(() => {
    if (!selectedId || !adminToken) return;
    setMessages([]);
    setUnreadIds((prev) => { const s = new Set(prev); s.delete(selectedId); return s; });
    loadMessages(selectedId, adminToken);
  }, [selectedId, adminToken, loadMessages]);

  // Send reply via WebSocket
  function sendReply(e: React.FormEvent) {
    e.preventDefault();
    const text = reply.trim();
    if (!text || !selectedId || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "reply", session_id: selectedId, content: text }));
    setReply("");
  }

  // Takeover / release
  async function takeover(sid: string) {
    await fetch(`${CHAT_API}/sessions/${sid}/takeover?token=${encodeURIComponent(adminToken)}`, { method: "POST" });
    loadSessions(adminToken);
  }
  async function release(sid: string) {
    await fetch(`${CHAT_API}/sessions/${sid}/release?token=${encodeURIComponent(adminToken)}`, { method: "POST" });
    loadSessions(adminToken);
  }

  const combined: ChatMsg[] = [
    ...messages,
    ...(selectedId ? liveMsgs[selectedId] ?? [] : []),
  ];

  const selectedSession = sessions.find((s) => s.session_id === selectedId);

  // ---- No token: show fallback input ----
  if (!adminToken && !portfolioToken) {
    return (
      <div className="max-w-sm mx-auto mt-24 space-y-4">
        <h1 className="font-heading font-bold text-2xl">Live Chat Admin</h1>
        <p className="text-muted text-sm">Your admin session wasn&apos;t detected. Enter your PORTFOLIO_ADMIN_TOKEN to connect manually.</p>
        <div className="flex gap-2">
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            placeholder="Admin token…"
            className="flex-1 bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-fg outline-none focus:border-primary transition-colors"
          />
          <button
            onClick={handleConnect}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Connect
          </button>
        </div>
      </div>
    );
  }

  // ---- Main UI ----
  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="font-heading font-bold text-2xl">Live Chat</h1>
          <span
            className={[
              "text-xs px-2 py-0.5 rounded-full font-medium",
              wsState === "connected"
                ? "bg-emerald-500/15 text-emerald-400"
                : wsState === "connecting"
                ? "bg-amber-500/15 text-amber-400"
                : "bg-rose-500/15 text-rose-400",
            ].join(" ")}
          >
            {wsState}
          </span>
        </div>
        <button
          onClick={() => { localStorage.removeItem("chat_admin_token"); setAdminToken(""); wsRef.current?.close(); }}
          className="text-xs text-muted hover:text-fg transition-colors"
        >
          Disconnect
        </button>
      </div>

      <div className="flex-1 min-h-0 flex gap-4">
        {/* ── Session list ── */}
        <div className="w-56 flex-none flex flex-col rounded-xl bg-surface border border-white/10 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">Sessions</span>
            <button onClick={() => loadSessions(adminToken)} className="text-muted hover:text-fg text-[10px] transition-colors">↻</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.length === 0 && (
              <p className="text-xs text-muted text-center pt-6">No sessions yet</p>
            )}
            {sessions.map((s) => (
              <SessionRow
                key={s.session_id}
                s={s}
                selected={selectedId === s.session_id}
                hasUnread={unreadIds.has(s.session_id)}
                onClick={() => setSelectedId(s.session_id)}
              />
            ))}
          </div>
        </div>

        {/* ── Conversation ── */}
        <div className="flex-1 min-w-0 flex flex-col rounded-xl bg-surface border border-white/10 overflow-hidden">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-muted text-sm">Select a session to view the conversation</p>
            </div>
          ) : (
            <>
              {/* Session header */}
              <div className="flex-none px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-fg">
                    {selectedSession?.visitor_name || "Anonymous visitor"}
                    {selectedSession?.visitor_email && (
                      <span className="ml-2 text-xs text-muted font-normal">{selectedSession.visitor_email}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {selectedId.slice(0, 20)}… · {selectedSession?.status}
                  </p>
                </div>
                <div className="flex gap-2">
                  {selectedSession?.human_active ? (
                    <button
                      onClick={() => release(selectedId)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-white/10 text-muted hover:text-fg transition-colors"
                    >
                      Release to AI
                    </button>
                  ) : (
                    <button
                      onClick={() => takeover(selectedId)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                    >
                      Take over
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {loadingMsgs && (
                  <p className="text-xs text-muted text-center">Loading…</p>
                )}
                {combined.map((m, i) => (
                  <Bubble key={m.id ?? i} msg={m} />
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Reply input */}
              <div className="flex-none border-t border-white/10 px-3 py-3">
                {selectedSession?.human_active ? (
                  <form onSubmit={sendReply} className="flex gap-2">
                    <input
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Reply as Ray…"
                      className="flex-1 bg-bg border border-white/20 rounded-xl px-3.5 py-2.5 text-sm text-fg placeholder:text-muted outline-none focus:border-primary transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={!reply.trim() || wsState !== "connected"}
                      className="flex-none bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl px-4 text-sm font-medium transition-colors"
                    >
                      Send
                    </button>
                  </form>
                ) : (
                  <p className="text-xs text-muted text-center py-1">
                    AI is handling this session — click <strong>Take over</strong> to reply directly.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
