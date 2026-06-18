"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Recommendation } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";

const AUTO_MS = 4500;
const BRIEF = 180;

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
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={rec.avatar_url}
        alt={rec.author_name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="rounded-full object-cover ring-2 ring-primary/40 flex-shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full grid place-items-center bg-primary/20 text-primary font-bold flex-shrink-0"
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToCard = (n: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.children[n] as HTMLElement | undefined;
    if (!card) return;
    // Scroll only horizontally within the snap container — never touch page scroll
    el.scrollTo({
      left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2,
      behavior: "smooth",
    });
  };

  const goTo = useCallback(
    (target: number) => {
      const n = ((target % items.length) + items.length) % items.length;
      setIndex(n);
      scrollToCard(n);
    },
    [items.length],
  );

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = () => goTo(index - 1);

  useEffect(() => {
    if (paused || selected || items.length <= 1) return;
    const t = setInterval(next, AUTO_MS);
    return () => clearInterval(t);
  }, [paused, selected, items.length, next]);

  if (items.length === 0) return null;

  return (
    <>
      {/* Preload all avatar images immediately so the rounded box is never empty */}
      <div className="hidden" aria-hidden="true">
        {items.map(
          (r) =>
            r.avatar_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={r.id} src={r.avatar_url} alt="" fetchPriority="high" />
            ),
        )}
      </div>

      <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className="relative">
          <button
            aria-label="Previous"
            onClick={prev}
            className="absolute left-[2%] top-1/2 -translate-y-1/2 z-10 h-14 w-14 sm:h-16 sm:w-16 text-3xl sm:text-4xl rounded-2xl border border-white/15 bg-surface/80 backdrop-blur-sm hover:border-primary hover:text-primary transition-colors"
          >
            ‹
          </button>

          {/* Scroll-snap track: 88% wide cards → 6% peeks on each side */}
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-1"
            style={{ scrollbarWidth: "none" }}
          >
            {items.map((rec, i) => (
              <button
                key={rec.id}
                type="button"
                onClick={() => setSelected(rec)}
                className={`relative flex-none w-[88%] snap-center text-left rounded-2xl bg-surface border shadow-card
                  p-6 sm:p-10 flex flex-col hover:border-primary/50 hover:shadow-lg transition-all
                  ${i === index ? "border-white/20 opacity-100" : "border-white/5 opacity-50 scale-[0.98]"}`}
              >
                <div className="absolute top-5 right-5">
                  <LinkedInIcon url={rec.linkedin_url} />
                </div>
                <div className="flex items-start gap-4 mb-4 pr-8">
                  <Avatar rec={rec} size={64} />
                  <div className="min-w-0">
                    <div className="font-heading font-semibold truncate">{rec.author_name}</div>
                    <div className="text-sm text-muted truncate">
                      {[rec.position, rec.company].filter(Boolean).join(" · ")}
                    </div>
                    <Stars n={rec.stars} />
                  </div>
                </div>
                <p className="text-muted italic leading-relaxed text-sm sm:text-base">
                  &ldquo;
                  {rec.quote.length > BRIEF
                    ? rec.quote.slice(0, BRIEF).trimEnd() + "…"
                    : rec.quote}
                  &rdquo;
                </p>
                <span className="mt-4 inline-block text-xs text-primary">
                  Click to read full →
                </span>
              </button>
            ))}
          </div>

          <button
            aria-label="Next"
            onClick={next}
            className="absolute right-[2%] top-1/2 -translate-y-1/2 z-10 h-14 w-14 sm:h-16 sm:w-16 text-3xl sm:text-4xl rounded-2xl border border-white/15 bg-surface/80 backdrop-blur-sm hover:border-primary hover:text-primary transition-colors"
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
              onClick={() => goTo(i)}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-6 bg-primary" : "w-2 bg-white/25"
              }`}
            />
          ))}
        </div>
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
            <p className="leading-relaxed whitespace-pre-line">&ldquo;{selected.quote}&rdquo;</p>
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
    </>
  );
}
