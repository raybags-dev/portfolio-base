"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import type { Bootstrap, Project, Skill } from "@/lib/types";
import { useUI } from "@/lib/store";
import NewsTicker from "@/components/NewsTicker";

// --- shared building blocks ---
function Reveal({
  children,
  enabled,
  delay = 0,
  as = "div",
  className,
}: {
  children: React.ReactNode;
  enabled: boolean;
  delay?: number;
  as?: "div" | "li" | "span";
  className?: string;
}) {
  if (!enabled) return className ? <div className={className}>{children}</div> : <>{children}</>;
  const Tag = motion[as] as typeof motion.div;
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Tag>
  );
}

export function Section({
  id,
  title,
  children,
  bgImageDark,
  bgImageLight,
  isDark,
}: {
  id?: string;
  title?: string;
  children: React.ReactNode;
  bgImageDark?: string | null;
  bgImageLight?: string | null;
  isDark?: boolean;
}) {
  const activeImage = isDark ? bgImageDark : bgImageLight;
  const hasImage = !!activeImage;

  return (
    <section
      id={id}
      className="relative border-t border-white/5 scroll-mt-20 min-h-[60vh] flex flex-col justify-center"
    >
      {hasImage && (
        <>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url("${activeImage}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundAttachment: "fixed",
              opacity: isDark ? 0.14 : 0.10,
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: isDark
                ? "linear-gradient(to bottom, var(--color-bg) 0%, transparent 22%, transparent 78%, var(--color-bg) 100%)"
                : "linear-gradient(to bottom, var(--color-bg) 0%, rgba(255,255,255,0.6) 22%, rgba(255,255,255,0.6) 78%, var(--color-bg) 100%)",
            }}
          />
        </>
      )}
      <div className={`container-x py-20 lg:py-32 ${hasImage ? "relative z-10" : ""}`}>
        {title && (
          <h2 className="text-2xl sm:text-3xl font-heading font-bold mb-8">{title}</h2>
        )}
        {children}
      </div>
    </section>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-theme bg-surface shadow-card p-5 sm:p-7 border border-white/5 ${className}`}>
      {children}
    </div>
  );
}

// --- Project Detail Modal ---
function ProjectDetailModal({
  project,
  launchUrl,
  onClose,
}: {
  project: Project;
  launchUrl: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
        className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-theme bg-surface border border-white/10 shadow-2xl"
      >
        {project.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.cover_image_url}
            alt={project.title}
            className="w-full h-48 object-cover rounded-t-theme"
          />
        )}
        <div className="p-6 sm:p-8">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-2xl leading-none text-muted hover:text-fg transition-colors"
            aria-label="Close"
          >×</button>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h2 className="font-heading font-bold text-xl">{project.title}</h2>
            {project.is_featured && (
              <span className="text-xs rounded-full bg-accent/20 text-accent px-2 py-0.5">Featured</span>
            )}
            {project.status && project.status !== "hidden" && (
              <span className="text-xs rounded-full border border-white/15 px-2 py-0.5 text-muted capitalize">
                {project.status}
              </span>
            )}
          </div>

          {(project.description || project.summary) && (
            <p className="text-sm text-muted mb-4 leading-relaxed whitespace-pre-line">
              {project.description || project.summary}
            </p>
          )}

          {project.tech_tags && project.tech_tags.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Built with</h3>
              <div className="flex flex-wrap gap-1.5">
                {project.tech_tags.map((t) => (
                  <span key={t} className="text-xs rounded-full border border-primary/40 text-primary px-2.5 py-0.5">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {project.github_url && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">How to run</h3>
              <p className="text-sm text-secondary">
                Clone the repo and follow the README instructions.{" "}
                <a href={project.github_url} target="_blank" rel="noopener noreferrer"
                  className="text-primary hover:underline">
                  View on GitHub ↗
                </a>
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-white/5">
            {launchUrl && (
              <a href={launchUrl} target={launchUrl.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
                onClick={onClose}
                className="rounded-theme bg-primary text-white text-sm font-medium px-4 py-2 hover:opacity-90 transition-opacity">
                {project.service_key ? "Launch ↗" : "Live Demo ↗"}
              </a>
            )}
            {project.github_url && (
              <a href={project.github_url} target="_blank" rel="noopener noreferrer"
                className="rounded-theme border border-white/15 text-sm px-4 py-2 hover:bg-white/5 transition-colors">
                View Code ↗
              </a>
            )}
            {project.demo_url && project.demo_url !== launchUrl && (
              <a href={project.demo_url} target="_blank" rel="noopener noreferrer"
                className="rounded-theme border border-white/15 text-sm px-4 py-2 hover:bg-white/5 transition-colors">
                Demo ↗
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// --- Hero ---
export function Hero({ data }: { data: Bootstrap }) {
  const h = data.hero;
  const t = data.theme;
  const storeMode = useUI((s) => s.mode);
  const mode = storeMode ?? t.default_mode;
  const isDark = mode === "dark";

  const [scrolled, setScrolled] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 60);
      setScrollPct(Math.min(1, y / (window.innerHeight * 0.75)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Preload both theme images on mount so theme switches are instant.
  useEffect(() => {
    [h.background_image_url_dark, h.background_image_url_light, h.background_image_url]
      .filter(Boolean)
      .forEach((src) => {
        const img = new window.Image();
        img.src = src as string;
      });
  }, [h.background_image_url_dark, h.background_image_url_light, h.background_image_url]);

  if (!h.is_visible) return null;

  // Per-theme image: dark-specific → light-specific → generic fallback.
  const activeImageUrl = isDark
    ? (h.background_image_url_dark || h.background_image_url || null)
    : (h.background_image_url_light || h.background_image_url || null);

  const hasImage = h.background_mode === "image" && !!activeImageUrl;
  const opacity = h.background_opacity ?? 0.2;
  const grayscale = h.img_grayscale ?? 0;
  const invert = h.img_invert ?? false;
  const imgFilter =
    [grayscale > 0 && `grayscale(${grayscale})`, invert && "invert(1)"]
      .filter(Boolean)
      .join(" ") || "none";

  let bgStyle: React.CSSProperties | undefined;
  if (!hasImage) {
    if (h.background_mode === "color" && h.background_color) {
      bgStyle = { backgroundColor: h.background_color };
    } else if (isDark) {
      bgStyle = {
        backgroundImage:
          "radial-gradient(1200px 500px at 20% -10%, var(--color-primary), transparent), radial-gradient(900px 500px at 90% 10%, var(--color-secondary), transparent)",
      };
    } else {
      // Light mode: clean white base with barely-there brand-color blush.
      // #ffffffcc = rgba(255,255,255,0.8) — used as the dominant stop so dark
      // text reads perfectly against the near-white surface.
      bgStyle = {
        backgroundImage:
          "radial-gradient(ellipse 1400px 700px at 15% -5%, rgba(var(--primary-rgb, 204 2 2) / 0.07), transparent 65%), " +
          "radial-gradient(ellipse 1000px 600px at 92% 8%, rgba(var(--primary-rgb, 204 2 2) / 0.05), transparent 65%), " +
          "linear-gradient(175deg, #ffffff 0%, #ffffffcc 40%, #f8f8fb 100%)",
      };
    }
  }

  const shapeClass =
    h.avatar_shape === "rounded"
      ? "rounded-theme"
      : h.avatar_shape === "circle"
        ? "rounded-full"
        : "";
  const showAvatar = h.avatar_url && h.avatar_shape !== "none";

  return (
    <section
      className="min-h-screen flex items-center relative overflow-hidden"
      style={!hasImage ? bgStyle : undefined}
    >
      {/* Background image — opacity-only, no destructive colour filters */}
      {hasImage && (
        <div
          className="absolute inset-[-6%]"
          style={{
            backgroundImage: `url("${activeImageUrl}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity,
            filter: imgFilter,
            transform: `scale(${1 + scrollPct * 0.08})`,
            transformOrigin: "center center",
            willChange: "transform",
          }}
        />
      )}

      {/* Depth overlay — only in dark mode; light mode has white bg so this gradient just muddies it */}
      {hasImage && isDark && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, var(--color-bg) 0%, rgba(0,0,0,0.4) 50%, var(--color-bg) 100%)",
            opacity: 0.8,
          }}
        />
      )}

      {/* Scroll veil — bg colour rises from bottom as user scrolls */}
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background: "linear-gradient(to top, var(--color-bg) 0%, transparent 60%)",
          opacity: scrollPct * 0.9,
        }}
      />

      {/* Subtle dot grid — data-pipeline aesthetic */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--color-primary) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          opacity: 0.04,
        }}
      />

      {/* Content */}
      <div className="container-x relative z-10 py-24">
        <Reveal enabled={t.animations_enabled}>
          <div className="flex flex-col lg:flex-row items-center gap-14">
            {/* Avatar */}
            {showAvatar && (
              <div className="shrink-0 relative">
                <div
                  className="absolute rounded-full border border-primary/15 pointer-events-none"
                  style={{ inset: "-14px" }}
                />
                <div
                  className="absolute rounded-full border border-primary/[0.08] pointer-events-none"
                  style={{ inset: "-28px" }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={h.avatar_url as string}
                  alt={h.name || "Profile"}
                  className={`relative z-10 h-44 w-44 lg:h-52 lg:w-52 object-cover ring-2 ring-primary/30 shadow-2xl shadow-primary/10 ${shapeClass}`}
                />
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-white/10 backdrop-blur-sm text-xs font-medium whitespace-nowrap z-20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span className="text-muted">Available for hire</span>
                </div>
              </div>
            )}

            {/* Text */}
            <div className="flex-1 text-left">
              {h.name && (
                <div className="inline-flex items-center gap-2 mb-5 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/[0.08] text-primary text-sm font-medium">
                  <span className="font-mono text-xs">◈</span>
                  {h.name}
                </div>
              )}

              {h.title && (
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading font-extrabold leading-[1.1] mb-4 tracking-tight">
                  {h.title}
                </h1>
              )}

              {/* Accent bar */}
              <div className="flex items-center gap-3 mb-6 justify-start">
                <div className="h-0.5 w-10 bg-primary rounded-full" />
                <div className="h-0.5 w-5 bg-primary/40 rounded-full" />
                <div className="h-0.5 w-2 bg-primary/20 rounded-full" />
              </div>

              {h.subtitle && (
                <p className="text-base sm:text-lg text-muted max-w-xl leading-relaxed mb-9">
                  {h.subtitle}
                </p>
              )}

              {h.cta_text && h.cta_url && (
                <a
                  href={h.cta_url}
                  className="inline-flex items-center gap-2 rounded-theme bg-primary text-white font-medium px-7 py-3 hover:opacity-90 transition-opacity"
                >
                  {h.cta_text}
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 8l4 4m0 0l-4 4m4-4H3"
                    />
                  </svg>
                </a>
              )}
            </div>
          </div>
        </Reveal>
      </div>

      {/* Scroll indicator */}
      <div
        className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none transition-opacity duration-500"
        style={{ opacity: scrolled ? 0 : 1 }}
      >
        <span className="text-xs uppercase tracking-[0.2em] text-primary/80 font-semibold">
          Scroll
        </span>
        <svg
          className="w-10 h-10 text-primary animate-bounce"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      <NewsTicker />
    </section>
  );
}

// --- About ---
export function About({ data }: { data: Bootstrap }) {
  const a = data.about;
  const animated = data.theme.animations_enabled;
  if (!a.is_visible || (!a.biography && !a.description)) return null;
  return (
    <Section id="about" title={a.heading || "About"}>
      <div className="grid md:grid-cols-3 gap-8 items-start">
        {a.image_url && (
          <Reveal enabled={animated}>
            <div
              className="rounded-theme p-[3px]"
              style={{ boxShadow: "0 0 0 1px rgba(128,128,128,0.25), 0 0 0 5px rgba(128,128,128,0.07)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.image_url}
                alt={a.heading || "About"}
                className="rounded-theme w-full object-cover shadow-card"
              />
            </div>
          </Reveal>
        )}
        <Reveal
          enabled={animated}
          delay={0.1}
          className={a.image_url ? "md:col-span-2" : "md:col-span-3"}
        >
          <div>
            {a.biography && <p className="text-lg mb-4">{a.biography}</p>}
            {a.description && <p className="text-muted">{a.description}</p>}
            {a.highlights && a.highlights.length > 0 && (
              <ul className="mt-5 grid sm:grid-cols-2 gap-2">
                {a.highlights.map((hl, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-primary">▹</span>
                    <span>{hl}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

// --- Skills ---

const CATEGORY_ORDER = [
  "Core Data Engineering",
  "Streaming & Events",
  "Languages & Backend",
  "Specialized Engineering",
  "Frontend & Design",
];

function GitHubIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function SkillDetailModal({
  cat,
  skills,
  onClose,
}: {
  cat: string;
  skills: Skill[];
  onClose: () => void;
}) {
  const first = skills[0];
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
        className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-theme bg-surface border border-white/10 shadow-2xl p-6 sm:p-8"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-2xl leading-none text-muted hover:text-fg transition-colors"
          aria-label="Close"
        >×</button>
        <h2 className="font-heading font-bold text-xl mb-1">{cat}</h2>
        {first?.subheading && (
          <p className="text-sm text-secondary mb-3">{first.subheading}</p>
        )}
        {first?.description && (
          <p className="text-muted text-sm leading-relaxed mb-5">{first.description}</p>
        )}
        <div className="mb-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Technologies</h3>
          <div className="flex flex-wrap gap-2">
            {skills.map((s) => (
              <span key={s.id} className="text-xs font-medium px-2.5 py-1 rounded-full border border-primary/40 text-primary bg-primary/5">
                {s.name}
              </span>
            ))}
          </div>
        </div>
        {first?.github_url && (
          <a
            href={first.github_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <GitHubIcon />
            View on GitHub ↗
          </a>
        )}
      </motion.div>
    </div>
  );
}

export function Skills({ data }: { data: Bootstrap }) {
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const animated = data.theme.animations_enabled;
  const storeMode = useUI((s) => s.mode);
  const isDark = (storeMode ?? data.theme.default_mode) === "dark";
  const sec = data.sections.find((s) => s.key === "skills");

  if (data.skills.length === 0) return null;

  const groups = data.skills.reduce<Record<string, Skill[]>>((acc, s) => {
    const k = s.category || "General";
    (acc[k] ||= []).push(s);
    return acc;
  }, {});

  const orderedEntries = [
    ...CATEGORY_ORDER.filter((c) => groups[c]).map((c) => [c, groups[c]] as const),
    ...Object.entries(groups).filter(([c]) => !CATEGORY_ORDER.includes(c)),
  ];

  const selectedSkills = selectedCat ? (groups[selectedCat] ?? []) : [];

  return (
    <Section id="skills" title="Skills" bgImageDark={sec?.background_image_url_dark} bgImageLight={sec?.background_image_url_light} isDark={isDark}>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {orderedEntries.map(([cat, skills], i) => {
          const first = skills[0];
          return (
            <Reveal key={cat} enabled={animated} delay={i * 0.06}>
              <Card className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-heading font-bold text-base leading-snug">{cat}</h3>
                    {first?.subheading && (
                      <p className="text-xs text-secondary mt-1 leading-snug">{first.subheading}</p>
                    )}
                  </div>
                  {first?.github_url && (
                    <a
                      href={first.github_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`GitHub repo for ${cat}`}
                      className="text-muted hover:text-primary transition-colors shrink-0 mt-0.5"
                    >
                      <GitHubIcon />
                    </a>
                  )}
                </div>
                {/* Tech badges */}
                <div className="flex flex-wrap gap-2 flex-1 content-start mb-4">
                  {skills.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center justify-center text-xs font-medium px-3 py-1 rounded-full border border-white/10 bg-white/5 text-fg hover:border-primary/40 hover:text-primary transition-colors"
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
                {/* Details button — same weight as project CTA */}
                <div className="mt-auto flex flex-col items-center pt-2">
                  <button
                    onClick={() => setSelectedCat(cat)}
                    className="w-[72%] rounded-theme border border-primary/40 text-primary text-sm font-medium py-2.5 hover:bg-primary hover:text-white transition-colors"
                  >
                    Details →
                  </button>
                </div>
              </Card>
            </Reveal>
          );
        })}
      </div>

      <AnimatePresence>
        {selectedCat && (
          <SkillDetailModal
            cat={selectedCat}
            skills={selectedSkills}
            onClose={() => setSelectedCat(null)}
          />
        )}
      </AnimatePresence>
    </Section>
  );
}

const SERVICE_KEY_ROUTES: Record<string, string> = {
  "hotel-reviews": "/hotel-reviews",
  "jobs": "/job-analytics",
};

// --- Projects (with search + tag filter) ---
export function Projects({ data }: { data: Bootstrap }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const serviceUrlMap = useMemo(() => {
    const m: Record<string, string> = { ...SERVICE_KEY_ROUTES };
    data.microservices.forEach((s) => { if (s.key && s.base_url) m[s.key] = s.base_url; });
    return m;
  }, [data.microservices]);

  // Auto-close project modal when user scrolls the page body
  useEffect(() => {
    if (!selectedProject) return;
    function onScroll() { setSelectedProject(null); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [selectedProject]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    data.projects.forEach((p) => (p.tech_tags || []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [data.projects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...data.projects]
      .sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || a.order - b.order)
      .filter((p) => {
        const matchesTag = !tag || (p.tech_tags || []).includes(tag);
        const matchesQuery =
          !q ||
          p.title.toLowerCase().includes(q) ||
          (p.summary || "").toLowerCase().includes(q) ||
          (p.tech_tags || []).some((t) => t.toLowerCase().includes(q));
        return matchesTag && matchesQuery;
      });
  }, [data.projects, query, tag]);

  if (data.projects.length === 0) return null;

  return (
    <Section id="projects" title="Projects">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects…"
          className="rounded-theme bg-surface border border-white/15 px-4 py-2 w-full sm:w-72 outline-none focus:border-primary"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTag(null)}
            className={`text-xs rounded-full px-3 py-1 border ${
              tag === null ? "border-primary text-primary" : "border-white/15 text-muted"
            }`}
          >
            All
          </button>
          {allTags.map((tg) => (
            <button
              key={tg}
              onClick={() => setTag(tg === tag ? null : tg)}
              className={`text-xs rounded-full px-3 py-1 border ${
                tag === tg ? "border-primary text-primary" : "border-white/15 text-muted"
              }`}
            >
              {tg}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((p, i) => {
          const launchUrl = p.service_key
            ? (serviceUrlMap[p.service_key] || null)
            : (p.demo_url || null);
          const launchLabel = p.service_key ? "Launch ↗" : "Demo ↗";
          const btnCls = "w-[72%] block text-center rounded-theme text-sm font-medium py-2.5 transition-opacity";
          return (
            <Reveal key={p.id} enabled={data.theme.animations_enabled} delay={i * 0.04}>
              <Card>
                {/* Clickable body — opens detail modal */}
                <div
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for ${p.title}`}
                  onClick={() => setSelectedProject(p)}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedProject(p)}
                >
                  {p.cover_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.cover_image_url}
                      alt={p.title}
                      className="rounded-theme w-full h-40 object-cover mb-4"
                    />
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-heading font-semibold">{p.title}</h3>
                    {p.is_featured && (
                      <span className="text-xs rounded-full bg-accent/20 text-accent px-2 py-0.5">
                        Featured
                      </span>
                    )}
                  </div>
                  {p.summary && <p className="text-sm text-muted mb-3">{p.summary}</p>}
                  {p.tech_tags && p.tech_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {p.tech_tags.map((t) => (
                        <span key={t} className="text-xs rounded-full border border-white/15 px-2 py-0.5 text-secondary">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {/* Buttons — click does NOT open modal */}
                <div className="mt-auto pt-4 flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {!launchUrl ? (
                    <span className={`${btnCls} border border-white/10 text-muted cursor-not-allowed select-none`}>
                      Coming soon
                    </span>
                  ) : launchUrl.startsWith("http") ? (
                    <a href={launchUrl} target="_blank" rel="noopener noreferrer"
                      className={`${btnCls} bg-primary text-white hover:opacity-90`}>
                      {launchLabel}
                    </a>
                  ) : (
                    <a href={launchUrl} className={`${btnCls} bg-primary text-white hover:opacity-90`}>
                      {launchLabel}
                    </a>
                  )}
                  {p.github_url && (
                    <a href={p.github_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-muted hover:text-primary transition-colors">
                      View code ↗
                    </a>
                  )}
                </div>
              </Card>
            </Reveal>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <p className="text-muted text-sm">No projects match your search.</p>
      )}

      <AnimatePresence>
        {selectedProject && (
          <ProjectDetailModal
            project={selectedProject}
            launchUrl={
              selectedProject.service_key
                ? (serviceUrlMap[selectedProject.service_key] || null)
                : (selectedProject.demo_url || null)
            }
            onClose={() => setSelectedProject(null)}
          />
        )}
      </AnimatePresence>
    </Section>
  );
}

// --- Data Platform / microservices ---
export function Services({ data }: { data: Bootstrap }) {
  const animated = data.theme.animations_enabled;
  if (data.microservices.length === 0) return null;
  return (
    <Section id="platform" title="Data Platform">
      <Reveal enabled={animated}>
        <p className="text-muted mb-6 max-w-2xl">
          Live data-engineering modules — each toggled at runtime via feature flags.
        </p>
      </Reveal>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {data.microservices.map((m, i) => (
          <Reveal key={m.id} enabled={animated} delay={i * 0.06}>
            <Card>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-heading font-semibold">{m.name}</h3>
                <span className="text-xs rounded-full bg-primary/15 text-primary px-2 py-0.5">
                  {m.status}
                </span>
              </div>
              {m.description && <p className="text-sm text-muted">{m.description}</p>}
              {m.base_url && (
                <a
                  href={m.base_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Launch ↗
                </a>
              )}
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// --- Experience ---
export function Experience({ data }: { data: Bootstrap }) {
  const animated = data.theme.animations_enabled;
  const storeMode = useUI((s) => s.mode);
  const isDark = (storeMode ?? data.theme.default_mode) === "dark";
  const sec = data.sections.find((s) => s.key === "experience");
  if (data.experiences.length === 0) return null;
  return (
    <Section id="experience" title="Experience" bgImageDark={sec?.background_image_url_dark} bgImageLight={sec?.background_image_url_light} isDark={isDark}>
      <div className="space-y-6">
        {data.experiences.map((e, i) => (
          <Reveal key={e.id} enabled={animated} delay={i * 0.06}>
            <Card>
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-heading font-semibold">
                  {e.role} {e.company && <span className="text-muted">· {e.company}</span>}
                </h3>
                <span className="text-sm text-muted">
                  {[e.start_date, e.is_current ? "Present" : e.end_date].filter(Boolean).join(" — ")}
                </span>
              </div>
              {e.description && <p className="text-sm text-muted mt-2">{e.description}</p>}
              {e.highlights && e.highlights.length > 0 && (
                <ul className="mt-2 text-sm list-disc list-inside text-muted">
                  {e.highlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              )}
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// --- Education ---
export function Education({ data }: { data: Bootstrap }) {
  const animated = data.theme.animations_enabled;
  if (data.education.length === 0) return null;
  return (
    <Section id="education" title="Education">
      <div className="space-y-6">
        {data.education.map((ed, i) => (
          <Reveal key={ed.id} enabled={animated} delay={i * 0.06}>
            <Card>
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-heading font-semibold">
                  {ed.degree} {ed.institution && <span className="text-muted">· {ed.institution}</span>}
                </h3>
                <span className="text-sm text-muted">
                  {[ed.start_date, ed.end_date].filter(Boolean).join(" — ")}
                </span>
              </div>
              {ed.field_of_study && (
                <p className="text-sm text-secondary mt-1">{ed.field_of_study}</p>
              )}
              {ed.description && <p className="text-sm text-muted mt-2">{ed.description}</p>}
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// --- Certifications ---
export function Certifications({ data }: { data: Bootstrap }) {
  const animated = data.theme.animations_enabled;
  if (data.certifications.length === 0) return null;
  return (
    <Section id="certifications" title="Certifications">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {data.certifications.map((c, i) => (
          <Reveal key={c.id} enabled={animated} delay={i * 0.05}>
            <Card>
              <div className="flex items-center gap-3">
                {c.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image_url} alt={c.name} className="h-12 w-12 object-contain rounded" />
                )}
                <div>
                  <h3 className="font-heading font-semibold">{c.name}</h3>
                  {c.issuer && <p className="text-sm text-muted">{c.issuer}</p>}
                  {c.issue_date && <p className="text-xs text-muted">{c.issue_date}</p>}
                </div>
              </div>
              {c.credential_url && (
                <a href={c.credential_url} className="mt-3 inline-block text-primary hover:underline text-sm">
                  View credential →
                </a>
              )}
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function PlatformIcon({ platform }: { platform: string }) {
  const p = platform.toLowerCase();
  if (p === "github")
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
    );
  if (p === "linkedin")
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
      </svg>
    );
  if (p === "twitter" || p === "x")
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  // generic external link
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}

// --- Footer (brand + nav + contact + socials) ---
export function Footer({ data }: { data: Bootstrap }) {
  const site = data.site_configuration;
  const socials = data.social_links.filter((s) => s.is_visible);
  const enabled = new Set(data.sections.filter((s) => s.enabled).map((s) => s.key));
  const year = new Date().getFullYear();

  // Build footer nav from what actually exists, so there are no dead links.
  const navLinks: { label: string; href: string }[] = [];
  if (enabled.has("about")) navLinks.push({ label: "About", href: "/#about" });
  if (data.resume?.is_public && data.resume.pdf_url)
    navLinks.push({ label: "Resume", href: data.resume.pdf_url });
  if (enabled.has("projects")) navLinks.push({ label: "Portfolio", href: "/#projects" });
  if (enabled.has("blog")) navLinks.push({ label: "Blog", href: "/blog" });
  if (enabled.has("contact")) navLinks.push({ label: "Contact", href: "/contact" });

  return (
    <footer className="border-t border-white/10 bg-surface/40">
      <div className="container-x py-14 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        {/* brand */}
        <div>
          <div className="font-heading font-bold text-lg">
            {site.site_name}
            <span className="text-primary">™</span>
          </div>
          {site.tagline && <p className="text-muted text-sm mt-3 max-w-sm">{site.tagline}</p>}
          {site.location_address && (
            <p className="text-muted text-sm mt-3">{site.location_address}</p>
          )}
        </div>

        {/* navigation */}
        {navLinks.length > 0 && (
          <div className="flex flex-col items-center md:items-start">
            <h4 className="font-heading font-semibold mb-3 text-sm uppercase tracking-wide text-muted">
              Navigation
            </h4>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 w-full">
              {navLinks.map((l) =>
                l.href.startsWith("/#") ? (
                  <a
                    key={l.label}
                    href={l.href}
                    onClick={(e) => {
                      const id = l.href.slice(2);
                      const el = document.getElementById(id);
                      if (el) {
                        e.preventDefault();
                        el.scrollIntoView({ behavior: "smooth" });
                        window.history.replaceState(null, "", l.href);
                      }
                    }}
                    className="flex items-center justify-center w-full sm:w-auto rounded-full border border-white/15 px-4 py-1.5 text-sm hover:border-primary hover:text-primary transition-colors"
                  >
                    {l.label}
                  </a>
                ) : (
                  <Link
                    key={l.label}
                    href={l.href}
                    className="flex items-center justify-center w-full sm:w-auto rounded-full border border-white/15 px-4 py-1.5 text-sm hover:border-primary hover:text-primary transition-colors"
                  >
                    {l.label}
                  </Link>
                )
              )}
            </div>
          </div>
        )}

        {/* contact + socials */}
        <div className="flex flex-col items-center md:items-start">
          <h4 className="font-heading font-semibold mb-3 text-sm uppercase tracking-wide text-muted">
            Contact
          </h4>
          <ul className="flex flex-col gap-2 w-full text-sm">
            {site.contact_email && (
              <li>
                <a href={`mailto:${site.contact_email}`} className="flex items-center gap-2 justify-center md:justify-start w-full rounded-full border border-white/15 px-4 py-1.5 hover:border-primary hover:text-primary transition-colors">
                  <svg className="w-4 h-4 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>
                  <span className="truncate">{site.contact_email}</span>
                </a>
              </li>
            )}
            {site.phone && (
              <li>
                <a href={`tel:${site.phone}`} className="flex items-center gap-2 justify-center md:justify-start w-full rounded-full border border-white/15 px-4 py-1.5 hover:border-primary hover:text-primary transition-colors">
                  <svg className="w-4 h-4 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.73h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.34a16 16 0 0 0 5.76 5.76l1.7-1.71a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  <span>{site.phone}</span>
                </a>
              </li>
            )}
            {site.location_address && (
              <li>
                <div className="flex items-center gap-2 justify-center md:justify-start w-full rounded-full border border-white/15 px-4 py-1.5 text-muted">
                  <svg className="w-4 h-4 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <span className="truncate">{site.location_address}</span>
                </div>
              </li>
            )}
          </ul>
          {socials.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 mt-4 w-full">
              {socials.map((s) => (
                <a
                  key={s.id}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full sm:w-auto rounded-full border border-white/15 px-3 py-1.5 text-xs hover:border-primary hover:text-primary transition-colors"
                >
                  <PlatformIcon platform={s.platform} />
                  <span>{s.label || s.platform}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="container-x py-5 border-t border-white/5 text-muted text-xs">
        © 2020–{year} {site.site_name}. All rights reserved.
      </div>
    </footer>
  );
}
