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

/**
 * Fixed news ticker strip — always glued to the bottom of the viewport,
 * below the navbar. Hides itself if no news items are available.
 */
export default function NewsTicker() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [paused, setPaused] = useState(false);

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

  if (items.length === 0) return null;

  // Duplicate so the scroll loops seamlessly
  const doubled = [...items, ...items];
  // ~2.5s per item — close to real broadcast ticker speed
  const duration = Math.max(18, items.length * 2.5);

  return (
    <div
      className="w-full overflow-hidden flex items-center select-none"
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
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Label chip */}
      <div
        className="shrink-0 flex items-center gap-1.5 px-3 h-full"
        style={{
          borderRight: "1px solid rgba(255,255,255,0.1)",
          color: "#ef4444",
          fontSize: "10px",
          fontWeight: 800,
          letterSpacing: "0.15em",
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
          }}
        />
        LIVE
      </div>

      {/* Scrolling track */}
      <div className="flex-1 overflow-hidden relative">
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
                    fontSize: "9px",
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
                  style={{
                    color: "rgba(255,255,255,0.85)",
                    fontSize: "12px",
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#60a5fa")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.85)")}
                >
                  {item.title}
                </a>
              ) : (
                <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "12px" }}>
                  {item.title}
                </span>
              )}
              <span style={{ margin: "0 10px", color: "rgba(255,255,255,0.18)", fontSize: 10 }}>
                ◆
              </span>
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
      `}</style>
    </div>
  );
}
