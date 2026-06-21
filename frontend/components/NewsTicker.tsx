"use client";

import { useEffect, useRef, useState } from "react";
import { getNewsFeed } from "@/lib/api";

interface NewsItem {
  id: number;
  title: string;
  url: string | null;
  category: string | null;
  source: string;
}

export default function NewsTicker() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await getNewsFeed(80);
        if (alive && data.length > 0) setItems(data);
      } catch {
        // Feed unavailable — stay hidden
      }
    }
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    function onScroll() {
      const atTop = window.scrollY < 120;
      setVisible(atTop);
      if (!atTop) setOpen(false);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (items.length === 0) return null;

  const doubled = [...items, ...items];
  const duration = Math.max(5, items.length * 0.7);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        height: "34px",
        background: "rgba(0,0,0,0.72)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        opacity: visible ? 1 : 0.01,
        transition: "opacity 0.4s ease",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* LIVE chip — always visible, click to toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Collapse news" : "Expand news"}
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingInline: 12,
          height: "100%",
          background: "none",
          border: "none",
          borderRight: "1px solid rgba(255,255,255,0.1)",
          cursor: "pointer",
          color: "#ef4444",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.15em",
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#ef4444",
            animation: "nt-pulse 1.4s ease-in-out infinite",
            flexShrink: 0,
          }}
        />
        LIVE
        <span
          style={{
            display: "inline-block",
            marginLeft: 4,
            color: "rgba(255,255,255,0.6)",
            fontSize: 12,
            animation: open ? "none" : "nt-arrow 1.2s ease-in-out infinite",
          }}
        >
          {open ? "×" : "→"}
        </span>
      </button>

      {/* Scrolling track — slides in/out */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          maxWidth: open ? "100vw" : "0px",
          transition: "max-width 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            whiteSpace: "nowrap",
            animation: paused ? "none" : `nt-scroll ${duration}s linear infinite`,
          }}
        >
          {doubled.map((item, i) => (
            <span
              key={`${item.id}-${i}`}
              style={{ display: "inline-flex", alignItems: "center" }}
            >
              {item.category && (
                <span
                  style={{
                    color: "#3b82f6",
                    fontSize: 9,
                    fontWeight: 700,
                    marginRight: 5,
                    marginLeft: 22,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  {item.category}
                </span>
              )}
              {!item.category && <span style={{ marginLeft: 22 }} />}
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, textDecoration: "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#60a5fa")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.85)")}
                >
                  {item.title}
                </a>
              ) : (
                <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 12 }}>{item.title}</span>
              )}
              <span style={{ margin: "0 10px", color: "rgba(255,255,255,0.18)", fontSize: 10 }}>◆</span>
            </span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes nt-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes nt-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.25; }
        }
        @keyframes nt-arrow {
          0%, 100% { transform: translateX(0); opacity: 0.6; }
          50%       { transform: translateX(5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
