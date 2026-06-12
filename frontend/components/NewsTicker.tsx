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
  const tickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await getNewsFeed(60);
        if (alive && data.length > 0) setItems(data);
      } catch {
        // News feed unavailable — ticker stays hidden
      }
    }
    load();
    const interval = setInterval(load, 5 * 60 * 1000); // refresh every 5 min
    return () => { alive = false; clearInterval(interval); };
  }, []);

  if (items.length === 0) return null;

  // Duplicate items so the scroll loops seamlessly
  const doubled = [...items, ...items];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center overflow-hidden"
      style={{
        background: "rgba(10, 10, 15, 0.96)",
        borderTop: "1px solid rgba(37, 99, 235, 0.35)",
        height: "32px",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Label */}
      <div
        className="shrink-0 flex items-center gap-1.5 px-3 text-xs font-bold tracking-widest"
        style={{ color: "#ef4444", borderRight: "1px solid rgba(255,255,255,0.1)", height: "100%" }}
      >
        <span
          className="inline-block w-2 h-2 rounded-full bg-red-500"
          style={{ animation: "pulse 1.4s ease-in-out infinite" }}
        />
        LIVE
      </div>

      {/* Scrolling track */}
      <div
        className="flex-1 overflow-hidden relative"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div
          ref={tickerRef}
          className="flex items-center whitespace-nowrap"
          style={{
            animation: paused
              ? "none"
              : `ticker ${Math.max(60, items.length * 8)}s linear infinite`,
            gap: 0,
          }}
        >
          {doubled.map((item, i) => (
            <span key={`${item.id}-${i}`} className="inline-flex items-center">
              {item.category && (
                <span
                  className="inline-block text-xs font-bold mr-1.5 ml-6"
                  style={{ color: "#2563eb" }}
                >
                  {item.category.toUpperCase()}
                </span>
              )}
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs hover:text-blue-400 transition-colors"
                  style={{ color: "rgba(255,255,255,0.88)" }}
                >
                  {item.title}
                </a>
              ) : (
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.88)" }}>
                  {item.title}
                </span>
              )}
              <span className="mx-4 text-white/20 select-none">·</span>
            </span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%        { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
