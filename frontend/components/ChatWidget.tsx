"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---- Types ----
type Sender = "user" | "agent" | "human" | "system";
interface Msg { id: string; sender: Sender; content: string; ts: number; }
type NameFlow = "idle" | "prompted" | "entering" | "done";
type EndFlow = "idle" | "confirming";

// ---- Storage keys ----
const LS_NAME = "rc_name";
const LS_SID  = "rc_sid";   // localStorage so it survives refresh
const LS_MSGS = "rc_msgs";  // cached messages for refresh-persistence

// ---- Helpers ----
function genId() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function getOrCreateSid(): string {
  try {
    let id = localStorage.getItem(LS_SID);
    if (!id) { id = genId(); localStorage.setItem(LS_SID, id); }
    return id;
  } catch { return genId(); }
}

function getSavedName(): string | null {
  try { return localStorage.getItem(LS_NAME); } catch { return null; }
}

function persistName(name: string) {
  try { localStorage.setItem(LS_NAME, name); } catch {}
}

function loadCachedMsgs(): Msg[] {
  try {
    const raw = localStorage.getItem(LS_MSGS);
    return raw ? (JSON.parse(raw) as Msg[]) : [];
  } catch { return []; }
}

function saveCachedMsgs(msgs: Msg[]) {
  try { localStorage.setItem(LS_MSGS, JSON.stringify(msgs.slice(-100))); } catch {}
}

function clearStoredData(keepName: boolean) {
  try {
    if (!keepName) localStorage.removeItem(LS_NAME);
    localStorage.removeItem(LS_SID);
    localStorage.removeItem(LS_MSGS);
  } catch {}
}

function buildWsUrl(sid: string): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/${sid}`;
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Theme-aware input class.
// Avoids opacity-modifier syntax (bg-bg/60) which breaks when CSS variables are
// hex strings rather than space-separated RGB channels.
// border-gray-400/30 works because gray-400 is a built-in Tailwind colour
// with known RGB values, so the /30 opacity modifier resolves correctly.
const inputCls =
  "flex-1 min-w-0 bg-bg border border-gray-400/30 rounded-xl " +
  "px-3.5 py-2.5 text-sm text-fg placeholder:text-muted " +
  "outline-none focus:border-primary transition-colors";

// ---- Sub-components ----

function AgentAvatar() {
  return (
    <div className="flex-none w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-[10px] font-bold shadow-sm">
      AI
    </div>
  );
}

function HumanAvatar() {
  return (
    <div className="flex-none w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white text-[10px] font-bold shadow-sm">
      R
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-2 items-end">
      <AgentAvatar />
      <div className="bg-surface border border-gray-400/20 rounded-2xl rounded-bl-[4px] px-3 py-2.5 flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-muted/60 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: Msg }) {
  const isUser   = msg.sender === "user";
  const isSystem = msg.sender === "system";
  const isHuman  = msg.sender === "human";

  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <span className="text-[11px] text-muted italic bg-surface px-3 py-1 rounded-full border border-gray-400/20">
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser && (isHuman ? <HumanAvatar /> : <AgentAvatar />)}
      <div className={`flex flex-col gap-0.5 max-w-[72%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={[
            "px-3.5 py-2.5 text-sm leading-relaxed break-words",
            isUser
              ? "bg-primary text-white rounded-2xl rounded-br-[4px]"
              : "bg-surface border border-gray-400/20 text-fg rounded-2xl rounded-bl-[4px]",
          ].join(" ")}
        >
          {msg.content}
        </div>
        <span className="text-[10px] text-muted px-1">{fmtTime(msg.ts)}</span>
      </div>
    </div>
  );
}

function NamePromptCard({ onSure, onSkip }: { onSure: () => void; onSkip: () => void }) {
  return (
    <div className="flex items-end gap-2">
      <AgentAvatar />
      <div className="flex flex-col gap-2.5 max-w-[80%]">
        <div className="bg-surface border border-gray-400/20 text-fg rounded-2xl rounded-bl-[4px] px-3.5 py-2.5 text-sm leading-relaxed">
          By the way — if you don&apos;t mind, what should I call you? I&apos;d love to address you by name while we chat!
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSure}
            className="px-4 py-1.5 bg-primary text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Sure!
          </button>
          <button
            onClick={onSkip}
            className="px-4 py-1.5 bg-surface border border-gray-400/20 text-muted rounded-xl text-xs font-semibold hover:text-fg transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

function NameInputCard({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex items-end gap-2">
      <AgentAvatar />
      <form
        onSubmit={(e) => { e.preventDefault(); const n = val.trim(); if (n) onSubmit(n); }}
        className="flex gap-2 flex-1 min-w-0"
      >
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Your name…"
          className={inputCls}
        />
        <button
          type="submit"
          disabled={!val.trim()}
          className="flex-none bg-primary disabled:opacity-40 text-white rounded-xl px-3 py-2 text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          Done
        </button>
      </form>
    </div>
  );
}

function EndConfirmCard({
  onEndSession,
  onDeleteData,
  onCancel,
}: {
  onEndSession: () => void;
  onDeleteData: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mx-1 p-3.5 bg-surface border border-gray-400/20 rounded-2xl space-y-3">
      <p className="text-xs text-muted text-center">How would you like to end this chat?</p>
      <div className="flex gap-2">
        <button
          onClick={onEndSession}
          className="flex-1 py-2.5 bg-bg border border-gray-400/25 text-fg rounded-xl text-xs font-semibold hover:bg-surface transition-colors"
        >
          End session
        </button>
        <button
          onClick={onDeleteData}
          className="flex-1 py-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs font-semibold hover:bg-rose-500/20 transition-colors"
        >
          Delete my data
        </button>
      </div>
      <button
        onClick={onCancel}
        className="w-full text-center text-xs text-muted hover:text-fg transition-colors py-0.5"
      >
        Cancel
      </button>
    </div>
  );
}

function SendIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

// ---- Main ChatWidget ----
export default function ChatWidget() {
  const [open,      setOpen]      = useState(false);
  const [messages,  setMessages]  = useState<Msg[]>([]);
  const [typing,    setTyping]    = useState(false);
  const [connected, setConnected] = useState(false);
  const [unread,    setUnread]    = useState(0);
  const [draft,     setDraft]     = useState("");
  const [nameFlow,  setNameFlow]  = useState<NameFlow>("idle");
  const [endFlow,   setEndFlow]   = useState<EndFlow>("idle");
  const [userName,  setUserName]  = useState<string | null>(null);

  const wsRef              = useRef<WebSocket | null>(null);
  const sessionIdRef       = useRef<string>("");
  const openRef            = useRef(false);
  const greetingHandledRef = useRef(false);
  const userNameRef        = useRef<string | null>(null);
  const pendingNamePrompt  = useRef(false);
  const bottomRef          = useRef<HTMLDivElement>(null);

  // Keep refs in sync
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { userNameRef.current = userName; }, [userName]);

  // Restore persisted session on mount (runs once, client-side only)
  useEffect(() => {
    const savedName = getSavedName();
    if (savedName) {
      setUserName(savedName);
      userNameRef.current = savedName;
      setNameFlow("done");
    }

    const cached = loadCachedMsgs();
    if (cached.length > 0) {
      setMessages(cached);
      greetingHandledRef.current = true;   // skip re-greeting on reconnect
      if (!savedName) setNameFlow("done"); // skip name prompt if history exists
    }
  }, []);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) saveCachedMsgs(messages);
  }, [messages]);

  // When panel opens: clear unread, fire any deferred name prompt
  useEffect(() => {
    if (open) {
      setUnread(0);
      if (pendingNamePrompt.current) {
        pendingNamePrompt.current = false;
        setTimeout(() => setNameFlow("prompted"), 400);
      }
    }
  }, [open]);

  // Scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing, nameFlow, endFlow]);

  const addMsg = useCallback((m: Omit<Msg, "id">) => {
    setMessages((prev) => [...prev, { ...m, id: genId() }]);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const sid = sessionIdRef.current;
    if (!sid) return;

    const ws = new WebSocket(buildWsUrl(sid));
    wsRef.current = ws;

    ws.onopen  = () => setConnected(true);
    ws.onclose = () => { setConnected(false); setTimeout(connect, 3000); };
    ws.onerror = () => ws.close();

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { type?: string; sender: Sender; content: string; ts: number };
        if (data.type !== "msg") return;
        setTyping(false);

        const savedName = userNameRef.current;

        // First agent message on a fresh session = greeting
        if (!greetingHandledRef.current && data.sender === "agent") {
          greetingHandledRef.current = true;
          if (savedName && savedName !== "visitor") {
            addMsg({ sender: "agent", content: `Welcome back, ${savedName}! Great to see you again — how can I help?`, ts: data.ts ?? Date.now() / 1000 });
          } else {
            addMsg({ sender: data.sender, content: data.content, ts: data.ts ?? Date.now() / 1000 });
            if (!savedName) {
              // Defer name prompt if panel isn't open yet
              if (openRef.current) setTimeout(() => setNameFlow("prompted"), 900);
              else pendingNamePrompt.current = true;
            }
          }
          return;
        }

        addMsg({ sender: data.sender, content: data.content, ts: data.ts ?? Date.now() / 1000 });
        if (!openRef.current) setUnread((n) => n + 1);
      } catch { /* ignore malformed frames */ }
    };
  }, [addMsg]);

  // Init: restore session ID and connect once
  useEffect(() => {
    sessionIdRef.current = getOrCreateSid();
    connect();
    return () => wsRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Actions ----
  function send(text: string) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    addMsg({ sender: "user", content: text, ts: Date.now() / 1000 });
    setTyping(true);
    setEndFlow("idle");
    ws.send(JSON.stringify({ type: "msg", content: text }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    send(text);
    setDraft("");
  }

  function handleNameSure() { setNameFlow("entering"); }

  function handleNameSkip() {
    setNameFlow("done");
    persistName("visitor");
    setUserName("visitor");
    addMsg({ sender: "agent", content: "No worries! I'll call you Visitor for now. What would you like to know?", ts: Date.now() / 1000 });
  }

  function handleNameSubmit(name: string) {
    setNameFlow("done");
    persistName(name);
    setUserName(name);
    addMsg({ sender: "agent", content: `Great to meet you, ${name}! What can I help you with today?`, ts: Date.now() / 1000 });
  }

  function startNewSession(keepName: boolean) {
    clearStoredData(keepName);
    const newSid = genId();
    localStorage.setItem(LS_SID, newSid);
    sessionIdRef.current = newSid;
    greetingHandledRef.current = false;
    pendingNamePrompt.current = false;
    wsRef.current?.close(); // onclose → auto-reconnect with newSid after 3s
    setMessages([]);
    setNameFlow(keepName && userNameRef.current ? "done" : "idle");
  }

  function handleEndSession() {
    startNewSession(true); // keep name
    setOpen(false);
    setEndFlow("idle");
  }

  function handleDeleteData() {
    const sid = sessionIdRef.current;
    fetch(`/chat/api/sessions/${sid}/messages`, { method: "DELETE" }).catch(() => {});
    startNewSession(false); // clear everything
    setUserName(null);
    userNameRef.current = null;
    setOpen(false);
    setEndFlow("idle");
  }

  // ---- Render ----
  return (
    <>
      {/* ── Chat panel ── */}
      {open && (
        <div
          className={[
            // Mobile: full screen
            "fixed inset-0 z-[9998] flex flex-col overflow-hidden",
            // Desktop: floating card positioned above where the FAB would be
            "sm:inset-auto sm:bottom-8 sm:right-6 sm:w-[400px] sm:h-[560px] sm:rounded-2xl",
            // Appearance — using solid bg-bg (no opacity modifier; CSS hex vars break /N syntax)
            "bg-bg border border-gray-400/20 shadow-card",
          ].join(" ")}
        >
          {/* Header */}
          <div className="flex-none flex items-center gap-3 px-4 py-3 bg-surface border-b border-gray-400/15">
            <div className="flex-none relative">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
                AI
              </div>
              {connected && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-surface" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-fg leading-tight truncate">
                Ray&apos;s AI
                {userName && userName !== "visitor" && (
                  <span className="font-normal text-muted ml-1">· Hi, {userName}!</span>
                )}
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                {connected ? "Online" : "Connecting…"}
              </p>
            </div>
            <button
              onClick={() => setEndFlow("confirming")}
              className="text-muted hover:text-fg transition-colors text-[11px] font-medium px-2 py-1 rounded-lg hover:bg-bg whitespace-nowrap"
            >
              End chat
            </button>
            <button
              onClick={() => setOpen(false)}
              className="flex-none text-muted hover:text-fg transition-colors p-1 rounded-lg hover:bg-bg"
              aria-label="Close chat"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((m) => <ChatBubble key={m.id} msg={m} />)}
            {nameFlow === "prompted" && (
              <NamePromptCard onSure={handleNameSure} onSkip={handleNameSkip} />
            )}
            {nameFlow === "entering" && (
              <NameInputCard onSubmit={handleNameSubmit} />
            )}
            {endFlow === "confirming" && (
              <EndConfirmCard
                onEndSession={handleEndSession}
                onDeleteData={handleDeleteData}
                onCancel={() => setEndFlow("idle")}
              />
            )}
            {typing && <TypingDots />}
            <div ref={bottomRef} />
          </div>

          {/* Input footer */}
          <div className="flex-none border-t border-gray-400/15 bg-surface px-3 py-3">
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={connected ? "Message Ray's AI…" : "Connecting…"}
                disabled={!connected}
                className={`${inputCls} disabled:opacity-50`}
              />
              <button
                type="submit"
                disabled={!connected || !draft.trim()}
                className="flex-none bg-primary hover:opacity-90 disabled:opacity-40 text-white rounded-xl w-10 h-10 flex items-center justify-center transition-opacity"
                aria-label="Send"
              >
                <SendIcon />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── FAB — completely hidden while panel is open ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open chat"
          className="fixed bottom-20 right-6 z-[9999] w-14 h-14 rounded-full bg-primary hover:opacity-90 active:scale-95 shadow-lg flex items-center justify-center transition-all duration-200"
        >
          <div className="relative">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </div>
        </button>
      )}
    </>
  );
}
