"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ---- Types ----
type Sender = "user" | "agent" | "human" | "system";
interface Msg { id: string; sender: Sender; content: string; ts: number; }

// ---- Helpers ----
function genId() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function buildWsUrl(sid: string): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/${sid}`;
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---- Sub-components ----
function TypingDots() {
  return (
    <div className="flex items-end gap-2">
      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary flex-none">AI</div>
      <div className="bg-surface border border-white/10 rounded-2xl rounded-bl-[4px] px-3 py-2 flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-muted/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.sender === "user";
  const isSystem = msg.sender === "system";
  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <span className="text-[10px] text-muted italic bg-surface px-2.5 py-1 rounded-full border border-white/10">{msg.content}</span>
      </div>
    );
  }
  return (
    <div className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      {!isUser && (
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-none ${msg.sender === "human" ? "bg-emerald-600 text-white" : "bg-primary/20 text-primary"}`}>
          {msg.sender === "human" ? "R" : "AI"}
        </div>
      )}
      <div className={`max-w-[80%] flex flex-col gap-0.5 ${isUser ? "items-end" : "items-start"}`}>
        <div className={[
          "px-3 py-2 text-sm leading-relaxed break-words rounded-2xl",
          isUser
            ? "bg-primary text-white rounded-br-[4px]"
            : msg.sender === "human"
            ? "bg-emerald-600 text-white rounded-bl-[4px]"
            : "bg-surface border border-white/10 text-fg rounded-bl-[4px]",
        ].join(" ")}>
          {msg.content}
        </div>
        <span className="text-[10px] text-muted px-1">{fmtTime(msg.ts)}</span>
      </div>
    </div>
  );
}

// ---- Inline chat panel (no FAB, no floating) ----
function InlineChat({ label, demoSuffix }: { label: string; demoSuffix: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const sidRef = useRef<string>("");
  const greetedRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const addMsg = useCallback((m: Omit<Msg, "id">) => {
    setMsgs((prev) => [...prev, { ...m, id: genId() }]);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(buildWsUrl(sidRef.current));
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => { setConnected(false); setTimeout(connect, 3000); };
    ws.onerror = () => ws.close();

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { type?: string; sender: Sender; content: string; ts: number };
        if (data.type === "typing") {
          setTyping(true);
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => setTyping(false), 5000);
          return;
        }
        if (data.type !== "msg") return;
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        setTyping(false);
        if (!greetedRef.current && data.sender === "agent") {
          greetedRef.current = true;
        }
        addMsg({ sender: data.sender, content: data.content, ts: data.ts ?? Date.now() / 1000 });
      } catch { /* ignore */ }
    };
  }, [addMsg]);

  useEffect(() => {
    // Stable demo session IDs per page session, keyed by suffix
    const stored = sessionStorage.getItem(`demo_sid_${demoSuffix}`);
    const sid = stored ?? `demo-${demoSuffix}-${genId()}`;
    if (!stored) sessionStorage.setItem(`demo_sid_${demoSuffix}`, sid);
    sidRef.current = sid;
    connect();
    return () => wsRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || wsRef.current?.readyState !== WebSocket.OPEN) return;
    addMsg({ sender: "user", content: text, ts: Date.now() / 1000 });
    wsRef.current.send(JSON.stringify({ type: "msg", content: text }));
    setDraft("");
    setTyping(true);
  }

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-surface overflow-hidden h-[480px]">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-white/10 flex items-center gap-3">
        <div className="relative">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white text-[10px] font-bold">AI</div>
          <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-surface ${connected ? "bg-emerald-400" : "bg-amber-400"}`} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-fg">Ray&apos;s AI — {label}</p>
          <p className="text-[11px] text-muted">{connected ? "Online" : "Connecting…"}</p>
        </div>
        <span className="text-[10px] text-muted px-2 py-1 rounded-full border border-white/10 bg-white/5">Live session</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {msgs.length === 0 && !typing && (
          <p className="text-xs text-muted text-center pt-8">
            {connected ? "Say hi to start the demo →" : "Connecting to chat backend…"}
          </p>
        )}
        {msgs.map((m) => <Bubble key={m.id} msg={m} />)}
        {typing && <TypingDots />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-none border-t border-white/10 px-3 py-3">
        <form onSubmit={send} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={connected ? "Try asking about DataForge, Ray's skills…" : "Connecting…"}
            disabled={!connected}
            className="flex-1 bg-bg border border-white/20 rounded-xl px-3.5 py-2.5 text-sm text-fg placeholder:text-muted outline-none focus:border-primary transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!connected || !draft.trim()}
            className="flex-none bg-primary hover:opacity-90 disabled:opacity-40 text-white rounded-xl w-10 h-10 flex items-center justify-center transition-opacity"
            aria-label="Send"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
          </button>
        </form>
      </div>
    </div>
  );
}

// ---- Tech stack cards ----
const TECH_CARDS = [
  {
    icon: "⚡",
    title: "FastAPI + WebSockets",
    body: "Async Python backend. Two WS routes: /ws/{session_id} for visitors, /ws/admin for Raymond. Route ordering matters — /ws/admin must be registered first or every admin connection falls into the visitor handler.",
  },
  {
    icon: "📡",
    title: "Redis Pub/Sub",
    body: "Fan-out layer between the admin WS and visitor WS connections. Two channels: chat:admin (all messages) and chat:session:{id} (human replies to specific visitors). asyncio.Lock prevents concurrent WS frame corruption.",
  },
  {
    icon: "🤖",
    title: "Groq LLM (llama-3.3-70b)",
    body: "Javi, the AI, is powered by Groq's ultra-fast inference. Two tools: generate_pipeline_token (issues DataForge access) and escalate_to_human (pings Discord + flags session for admin takeover).",
  },
  {
    icon: "🔁",
    title: "BackgroundTasks",
    body: "FastAPI BackgroundTasks drive the typing → farewell sequence on admin takeover and the LLM re-announce on release. The HTTP response returns immediately; the 1.8 s delay + message happen asynchronously.",
  },
  {
    icon: "🔐",
    title: "Fernet Encryption at Rest",
    body: "backend/app/core/*.py files are encrypted in GitHub after every deploy. Key = SHA-256(ENCRYPTION_KEY) → base64url → Fernet. A startup script decrypts them in the running container. Magic header detects state.",
  },
  {
    icon: "🐳",
    title: "Docker + GitHub Actions",
    body: "Full docker-compose setup with nginx reverse proxy. CI deploys on push to main, then a second workflow encrypts the core files with [skip ci]. SQLite in dev, PostgreSQL in production via Alembic migrations.",
  },
];

// ---- Page ----
export default function ChatDemoPage() {
  const [tip, setTip] = useState(0);
  const tips = [
    "Ask about Ray's projects or background",
    "Ask 'How does this chat work?'",
    "Ask for a DataForge pipeline token",
    "Ask to speak to Raymond directly",
  ];

  useEffect(() => {
    const t = setInterval(() => setTip((n) => (n + 1) % tips.length), 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="container-x py-16 space-y-16">
      {/* Back link */}
      <Link href="/#projects" className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg transition-colors">
        ← Back to portfolio
      </Link>

      {/* Hero */}
      <div className="text-center space-y-4 max-w-2xl mx-auto">
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">Live demo</span>
        <h1 className="font-heading font-bold text-4xl md:text-5xl">raybags-chat</h1>
        <p className="text-muted leading-relaxed">
          A production-grade real-time chat system built with FastAPI WebSockets, Redis pub/sub, and a Groq-powered AI agent.
          Both windows below are live — connected to the same backend you&apos;d use on the main site.
        </p>
        <div className="inline-flex items-center gap-2 text-sm text-muted border border-white/10 px-4 py-2 rounded-full bg-surface">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Try: <span className="text-primary italic transition-all duration-500">{tips[tip]}</span>
        </div>
      </div>

      {/* Two chat windows */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide px-1">Session A</p>
          <InlineChat label="Session A" demoSuffix="a" />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide px-1">Session B</p>
          <InlineChat label="Session B" demoSuffix="b" />
        </div>
      </div>

      {/* Tech overview */}
      <div className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="font-heading font-bold text-2xl">How it&apos;s built</h2>
          <p className="text-muted text-sm">Every component is production-grade — this isn&apos;t a mock.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TECH_CARDS.map((card) => (
            <div key={card.title} className="rounded-2xl border border-white/10 bg-surface p-5 space-y-2 hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{card.icon}</span>
                <h3 className="font-semibold text-sm text-fg">{card.title}</h3>
              </div>
              <p className="text-xs text-muted leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Flow diagram (text-based) */}
      <div className="rounded-2xl border border-white/10 bg-surface p-6 space-y-4 max-w-3xl mx-auto">
        <h2 className="font-heading font-semibold text-lg">Message flow</h2>
        <div className="font-mono text-xs text-muted space-y-1 leading-relaxed">
          <p><span className="text-sky-400">Visitor</span>  →  WS /ws/&#123;session_id&#125;  →  <span className="text-primary">FastAPI</span>  →  Groq LLM</p>
          <p className="pl-8 text-white/30">↕ Redis pub/sub (chat:admin)</p>
          <p><span className="text-emerald-400">Admin</span>    →  WS /ws/admin       →  <span className="text-primary">FastAPI</span>  →  DB save</p>
          <p className="pl-8 text-white/30">↕ Redis publish (chat:session:&#123;id&#125;)</p>
          <p><span className="text-sky-400">Visitor</span>  ←  _redis_listener     ←  <span className="text-primary">FastAPI</span>  ←  human reply</p>
        </div>
        <p className="text-xs text-muted border-t border-white/10 pt-4">
          Admin takeover: <span className="text-fg">BackgroundTasks</span> → typing event → 1.8 s → farewell message published via Redis to visitor.
          Route ordering: <span className="text-rose-400">/ws/admin</span> registered before <span className="text-rose-400">/ws/&#123;session_id&#125;</span> — FastAPI matches literals first.
        </p>
      </div>

      {/* CTA */}
      <div className="text-center space-y-4">
        <p className="text-muted text-sm">Want to use a similar stack or discuss the architecture?</p>
        <a
          href="mailto:baguma.github@gmail.com"
          className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          Reach out to Ray
        </a>
      </div>
    </main>
  );
}
