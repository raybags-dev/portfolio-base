"use client";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Recommendation } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";

const AUTO_MS = 4000;
const BRIEF = 160;

function Stars({ n }: { n: number }) {
  return <span className="text-accent">{"★".repeat(Math.max(0, Math.min(5, n)))}</span>;
}

function LinkedInIcon({ url }: { url?: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label="View recommendation on LinkedIn"
      className="text-[#0A66C2] hover:opacity-80 transition-opacity"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
      </svg>
    </a>
  );
}

function Avatar({ rec, size }: { rec: Recommendation; size: number }) {
  if (rec.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={rec.avatar_url}
        alt={rec.author_name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover ring-2 ring-primary/40"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full grid place-items-center bg-primary/20 text-primary font-bold"
    >
      {rec.author_name.charAt(0)}
    </div>
  );
}

export default function RecommendationsCarousel({
  items,
  animated,
}: {
  items: Recommendation[];
  animated: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<Recommendation | null>(null);

  const next = useCallback(
    () => setIndex((i) => (i + 1) % items.length),
    [items.length],
  );
  const prev = () => setIndex((i) => (i - 1 + items.length) % items.length);

  useEffect(() => {
    if (paused || selected || items.length <= 1) return;
    const t = setInterval(next, AUTO_MS);
    return () => clearInterval(t);
  }, [paused, selected, items.length, next]);

  if (items.length === 0) return null;
  const rec = items[index];

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative min-h-[230px] flex items-center justify-center">
        <button
          aria-label="Previous"
          onClick={prev}
          className="absolute left-0 z-10 h-9 w-9 rounded-full border border-white/15 hover:border-primary"
        >
          ‹
        </button>

        <div className="w-full max-w-2xl mx-10">
          <AnimatePresence mode="wait">
            <motion.button
              key={rec.id}
              onClick={() => setSelected(rec)}
              initial={animated ? { opacity: 0, x: 40 } : false}
              animate={{ opacity: 1, x: 0 }}
              exit={animated ? { opacity: 0, x: -40 } : undefined}
              transition={{ duration: 0.4 }}
              className="relative w-full text-left rounded-2xl bg-surface border border-white/10 shadow-card p-6 sm:p-8 hover:border-primary/50 hover:shadow-lg transition-all"
            >
              <div className="absolute top-5 right-5">
                <LinkedInIcon url={rec.linkedin_url} />
              </div>
              <div className="flex items-start gap-4 mb-4 pr-8">
                <Avatar rec={rec} size={56} />
                <div className="min-w-0">
                  <div className="font-heading font-semibold truncate">{rec.author_name}</div>
                  <div className="text-sm text-muted truncate">
                    {[rec.position, rec.company].filter(Boolean).join(" · ")}
                  </div>
                  <Stars n={rec.stars} />
                </div>
              </div>
              <p className="text-muted italic leading-relaxed">
                “{rec.quote.length > BRIEF ? rec.quote.slice(0, BRIEF).trimEnd() + "…" : rec.quote}”
              </p>
              <span className="mt-4 inline-block text-xs text-primary">Click to read full →</span>
            </motion.button>
          </AnimatePresence>
        </div>

        <button
          aria-label="Next"
          onClick={next}
          className="absolute right-0 z-10 h-9 w-9 rounded-full border border-white/15 hover:border-primary"
        >
          ›
        </button>
      </div>

      {/* dots */}
      <div className="flex justify-center gap-2 mt-5">
        {items.map((_, i) => (
          <button
            key={i}
            aria-label={`Go to ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-2 rounded-full transition-all ${
              i === index ? "w-6 bg-primary" : "w-2 bg-white/25"
            }`}
          />
        ))}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div>
            <div className="flex items-center gap-4 mb-4">
              <Avatar rec={selected} size={72} />
              <div>
                <div className="font-heading font-bold text-lg">{selected.author_name}</div>
                <div className="text-muted">
                  {[selected.position, selected.company].filter(Boolean).join(" · ")}
                </div>
                <Stars n={selected.stars} />
              </div>
            </div>
            <p className="leading-relaxed whitespace-pre-line">“{selected.quote}”</p>
            {selected.linkedin_url && (
              <a
                href={selected.linkedin_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block text-primary hover:underline text-sm"
              >
                View LinkedIn profile →
              </a>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
