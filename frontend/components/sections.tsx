"use client";
import { motion } from "framer-motion";
import type { Bootstrap } from "@/lib/types";

// --- shared building blocks ---
function Reveal({
  children,
  enabled,
  delay = 0,
}: {
  children: React.ReactNode;
  enabled: boolean;
  delay?: number;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay }}
    >
      {children}
    </motion.div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="container-x py-16 border-t border-white/5">
      {title && (
        <h2 className="text-2xl sm:text-3xl font-heading font-bold mb-8">
          <span className="text-primary">#</span> {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-theme bg-surface shadow-card p-5 border border-white/5">
      {children}
    </div>
  );
}

// --- Hero ---
export function Hero({ data }: { data: Bootstrap }) {
  const h = data.hero;
  const t = data.theme;
  if (!h.is_visible) return null;

  let background: React.CSSProperties = {};
  if (h.background_mode === "image" && h.background_image_url) {
    background = {
      backgroundImage: `linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.75)), url(${h.background_image_url})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundAttachment: t.parallax_enabled ? "fixed" : "scroll",
    };
  } else if (h.background_mode === "color" && h.background_color) {
    background = { backgroundColor: h.background_color };
  } else {
    background = {
      backgroundImage:
        "radial-gradient(1200px 500px at 20% -10%, var(--color-primary), transparent), radial-gradient(900px 500px at 90% 10%, var(--color-secondary), transparent)",
    };
  }

  return (
    <section
      className="min-h-[78vh] flex items-center"
      style={background}
    >
      <div className="container-x">
        <Reveal enabled={t.animations_enabled}>
          {h.name && (
            <p className="text-primary font-medium mb-3">{h.name}</p>
          )}
          {h.title && (
            <h1 className="text-4xl sm:text-6xl font-heading font-extrabold max-w-3xl leading-tight">
              {h.title}
            </h1>
          )}
          {h.subtitle && (
            <p className="mt-5 text-lg text-muted max-w-2xl">{h.subtitle}</p>
          )}
          {h.cta_text && h.cta_url && (
            <a
              href={h.cta_url}
              className="inline-block mt-8 rounded-theme bg-primary text-white font-medium px-6 py-3 hover:opacity-90 transition-opacity"
            >
              {h.cta_text}
            </a>
          )}
        </Reveal>
      </div>
    </section>
  );
}

// --- About ---
export function About({ data }: { data: Bootstrap }) {
  const a = data.about;
  if (!a.is_visible || (!a.biography && !a.description)) return null;
  return (
    <Section id="about" title={a.heading || "About"}>
      <div className="grid md:grid-cols-3 gap-8 items-start">
        {a.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.image_url}
            alt={a.heading || "About"}
            className="rounded-theme w-full object-cover shadow-card"
          />
        )}
        <div className={a.image_url ? "md:col-span-2" : "md:col-span-3"}>
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
      </div>
    </Section>
  );
}

// --- Skills ---
export function Skills({ data }: { data: Bootstrap }) {
  if (data.skills.length === 0) return null;
  const groups = data.skills.reduce<Record<string, typeof data.skills>>(
    (acc, s) => {
      const k = s.category || "General";
      (acc[k] ||= []).push(s);
      return acc;
    },
    {},
  );
  return (
    <Section id="skills" title="Skills">
      <div className="grid md:grid-cols-2 gap-x-10 gap-y-6">
        {Object.entries(groups).map(([cat, skills]) => (
          <div key={cat}>
            <h3 className="font-heading font-semibold mb-3 text-secondary">{cat}</h3>
            <div className="space-y-3">
              {skills.map((s) => (
                <div key={s.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{s.name}</span>
                    <span className="text-muted">{s.proficiency}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(0, Math.min(100, s.proficiency))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// --- Projects ---
export function Projects({ data }: { data: Bootstrap }) {
  if (data.projects.length === 0) return null;
  const projects = [...data.projects].sort(
    (a, b) => Number(b.is_featured) - Number(a.is_featured) || a.order - b.order,
  );
  return (
    <Section id="projects" title="Projects">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((p, i) => (
          <Reveal key={p.id} enabled={data.theme.animations_enabled} delay={i * 0.05}>
            <Card>
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
                  {p.tech_tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs rounded-full border border-white/15 px-2 py-0.5 text-secondary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-3 text-sm">
                {p.github_url && (
                  <a href={p.github_url} className="text-primary hover:underline">
                    Code
                  </a>
                )}
                {p.demo_url && (
                  <a href={p.demo_url} className="text-primary hover:underline">
                    Demo
                  </a>
                )}
              </div>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// --- Data Platform / microservices ---
export function Services({ data }: { data: Bootstrap }) {
  if (data.microservices.length === 0) return null;
  return (
    <Section id="platform" title="Data Platform">
      <p className="text-muted mb-6 max-w-2xl">
        Live data-engineering modules — each toggled at runtime via feature flags.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {data.microservices.map((m) => (
          <Card key={m.id}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-heading font-semibold">{m.name}</h3>
              <span className="text-xs rounded-full bg-primary/15 text-primary px-2 py-0.5">
                {m.status}
              </span>
            </div>
            {m.description && <p className="text-sm text-muted">{m.description}</p>}
          </Card>
        ))}
      </div>
    </Section>
  );
}

// --- Recommendations ---
export function Recommendations({ data }: { data: Bootstrap }) {
  if (data.recommendations.length === 0) return null;
  return (
    <Section id="recommendations" title="Recommendations">
      <div className="grid md:grid-cols-2 gap-6">
        {data.recommendations.map((r) => (
          <Card key={r.id}>
            <p className="text-accent mb-2">{"★".repeat(Math.max(0, Math.min(5, r.stars)))}</p>
            <p className="italic mb-4">“{r.quote}”</p>
            <div className="flex items-center gap-3">
              {r.avatar_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.avatar_url} alt={r.author_name} className="h-10 w-10 rounded-full object-cover" />
              )}
              <div className="text-sm">
                <div className="font-semibold">{r.author_name}</div>
                <div className="text-muted">
                  {[r.position, r.company].filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}

// --- Experience + Education (timeline-ish) ---
export function Experience({ data }: { data: Bootstrap }) {
  if (data.experiences.length === 0 && data.education.length === 0) return null;
  return (
    <Section id="experience" title="Experience">
      <div className="space-y-6">
        {data.experiences.map((e) => (
          <Card key={`exp-${e.id}`}>
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
        ))}
        {data.education.map((ed) => (
          <Card key={`edu-${ed.id}`}>
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="font-heading font-semibold">
                {ed.degree} {ed.institution && <span className="text-muted">· {ed.institution}</span>}
              </h3>
              <span className="text-sm text-muted">
                {[ed.start_date, ed.end_date].filter(Boolean).join(" — ")}
              </span>
            </div>
            {ed.description && <p className="text-sm text-muted mt-2">{ed.description}</p>}
          </Card>
        ))}
      </div>
    </Section>
  );
}

// --- Contact / footer ---
export function Contact({ data }: { data: Bootstrap }) {
  const socials = data.social_links.filter((s) => s.is_visible);
  return (
    <Section id="contact" title="Contact">
      <div className="flex flex-wrap gap-4">
        {socials.map((s) => (
          <a
            key={s.id}
            href={s.url}
            className="rounded-theme border border-white/15 px-4 py-2 hover:border-primary transition-colors"
          >
            {s.label || s.platform}
          </a>
        ))}
        {data.resume.is_public && data.resume.pdf_url && (
          <a
            href={data.resume.pdf_url}
            className="rounded-theme bg-primary text-white px-4 py-2 hover:opacity-90"
          >
            {data.resume.title || "Resume"}
          </a>
        )}
      </div>
      <p className="text-muted text-sm mt-10">
        © {data.site_configuration.site_name}
      </p>
    </Section>
  );
}
