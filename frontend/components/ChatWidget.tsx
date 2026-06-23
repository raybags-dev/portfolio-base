"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

type Sender = "user" | "agent" | "human" | "system";

interface Msg {
  id: string;
  sender: Sender;
  content: string;
  ts: number;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function genId() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem("rc_sid");
    if (!id) {
      id = genId();
      sessionStorage.setItem("rc_sid", id);
    }
    return id;
  } catch {
    return genId();
  }
}

function buildWsUrl(sessionId: string): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${proto}//${host}/ws/${sessionId}`;
}

// --------------------------------------------------------------------------
// Sub-components
// --------------------------------------------------------------------------

function Avatar({ sender }: { sender: Sender }) {
  const base =
    "flex-none w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold";
  if (sender === "user")
    return <span className={`${base} bg-sky-500/20 text-sky-400`}>U</span>;
  if (sender === "human")
    return (
      <span className={`${base} bg-emerald-500/20 text-emerald-400`}>R</span>
    );
  return <span className={`${base} bg-primary/20 text-primary`}>AI</span>;
}

function TypingDots() {
  return (
    <div className="flex gap-2 items-end">
      <Avatar sender="agent" />
      <div className="bg-bg border border-white/10 rounded-2xl rounded-tl-sm px-3 py-2.5 flex gap-1">
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

function ChatMessage({ msg }: { msg: Msg }) {
  const isUser = msg.sender === "user";
  const isSystem = msg.sender === "system";
  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isSystem && <Avatar sender={msg.sender} />}
      <div
        className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-white rounded-tr-sm"
            : isSystem
              ? "text-muted italic text-xs self-center mx-auto"
              : "bg-bg text-fg rounded-tl-sm border border-white/10"
        }`}
      >
        {msg.content}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// ChatPanel (open panel)
// --------------------------------------------------------------------------

function ChatPanel({
  onClose,
  messages,
  typing,
  connected,
  onSend,
}: {
  onClose: () => void;
  messages: Msg[];
  typing: boolean;
  connected: boolean;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="fixed inset-0 z-[9998] flex flex-col bg-surface border border-white/10 shadow-card overflow-hidden rounded-none sm:inset-auto sm:bottom-36 sm:right-6 sm:w-[360px] sm:max-h-[520px] sm:rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-surface/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm font-semibold text-fg">Chat with Ray's AI</span>
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-fg transition-colors p-1"
          aria-label="Close chat"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 sm:max-h-[360px]">
        {messages.map((m) => (
          <ChatMessage key={m.id} msg={m} />
        ))}
        {typing && <TypingDots />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={submit}
        className="flex items-center gap-2 px-3 py-3 border-t border-white/10 bg-surface"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? "Message Ray's AI…" : "Connecting…"}
          disabled={!connected}
          className="flex-1 bg-bg border border-white/10 rounded-xl px-3 py-2 text-sm text-fg placeholder:text-muted outline-none focus:border-primary disabled:opacity-50 transition-colors"
        />
        <button
          type="submit"
          disabled={!connected || !draft.trim()}
          className="bg-primary hover:opacity-90 disabled:opacity-40 text-white rounded-xl w-9 h-9 flex items-center justify-center transition-opacity flex-none"
          aria-label="Send"
        >
          <svg
            className="w-4 h-4 rotate-90"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      </form>
    </div>
  );
}

// --------------------------------------------------------------------------
// Main ChatWidget
// --------------------------------------------------------------------------

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [connected, setConnected] = useState(false);
  const [unread, setUnread] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string>("");

  const addMsg = useCallback((m: Omit<Msg, "id">) => {
    setMessages((prev) => [...prev, { ...m, id: genId() }]);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const sid = sessionIdRef.current;
    if (!sid) return;

    const ws = new WebSocket(buildWsUrl(sid));
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as Msg & { type?: string };
        if (data.type !== "msg") return;
        setTyping(false);
        addMsg({
          sender: data.sender,
          content: data.content,
          ts: data.ts ?? Date.now() / 1000,
        });
        setUnread((n) => (open ? 0 : n + 1));
      } catch {
        /* ignore malformed frames */
      }
    };
  }, [addMsg, open]);

  // Initialise session ID and connect once on mount
  useEffect(() => {
    sessionIdRef.current = getSessionId();
    connect();
    return () => {
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear unread count when panel opens
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  function send(text: string) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    addMsg({ sender: "user", content: text, ts: Date.now() / 1000 });
    setTyping(true);
    ws.send(JSON.stringify({ type: "msg", content: text }));
  }

  return (
    <>
      {/* Chat panel */}
      {open && (
        <ChatPanel
          onClose={() => setOpen(false)}
          messages={messages}
          typing={typing}
          connected={connected}
          onSend={send}
        />
      )}

      {/* FAB — sits above the back-to-top button; hidden on mobile when panel is open (header X closes it) */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Open chat"}
        className={`fixed bottom-20 right-6 z-[9999] w-14 h-14 rounded-full bg-primary hover:opacity-90 active:scale-95 shadow-lg items-center justify-center transition-all duration-200 ${open ? "hidden sm:flex" : "flex"}`}
      >
        {open ? (
          <svg
            className="w-6 h-6 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <>
            <svg
              className="w-6 h-6 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </>
        )}
      </button>
    </>
  );
}
