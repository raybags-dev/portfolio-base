"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
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

export function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="container-x py-16 border-t border-white/5 scroll-mt-20">
      {title && (
        <h2 className="text-2xl sm:text-3xl font-heading font-bold mb-8">{title}</h2>
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

// --- Hero (fixed background logic + profile avatar) ---
export function Hero({ data }: { data: Bootstrap }) {
  const h = data.hero;
  const t = data.theme;
  if (!h.is_visible) return null;

  let background: React.CSSProperties;
  if (h.background_mode === "image" && h.background_image_url) {
    background = {
      backgroundImage: `linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.75)), url("${h.background_image_url}")`,
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

  const shapeClass =
    h.avatar_shape === "rounded"
      ? "rounded-theme"
      : h.avatar_shape === "circle"
        ? "rounded-full"
        : "";
  const showAvatar = h.avatar_url && h.avatar_shape !== "none";

  const hasImage = h.background_mode === "image" && !!h.background_image_url;
  const textShadow = hasImage ? "0 1px 4px rgba(0,0,0,0.7)" : undefined;

  return (
    <section className="min-h-[80vh] flex items-center" style={background}>
      <div className="container-x">
        <Reveal enabled={t.animations_enabled}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-8">
            {showAvatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={h.avatar_url as string}
                alt={h.name || "Profile"}
                className={`h-32 w-32 sm:h-40 sm:w-40 object-cover ring-4 ring-primary/40 shadow-card ${shapeClass}`}
              />
            )}
            <div style={{ textShadow }}>
              {h.name && (
                <p className={`font-medium mb-3 ${hasImage ? "text-primary" : "text-primary"}`}>
                  {h.name}
                </p>
              )}
              {h.title && (
                <h1
                  className="text-4xl sm:text-6xl font-heading font-extrabold max-w-3xl leading-tight"
                  style={hasImage ? { color: "white" } : undefined}
                >
                  {h.title}
                </h1>
              )}
              {h.subtitle && (
                <p className={`mt-5 text-lg max-w-2xl ${hasImage ? "text-white/80" : "text-muted"}`}>
                  {h.subtitle}
                </p>
              )}
              {h.cta_text && h.cta_url && (
                <a
                  href={h.cta_url}
                  className="inline-block mt-8 rounded-theme bg-primary text-white font-medium px-6 py-3 hover:opacity-90 transition-opacity"
                >
                  {h.cta_text}
                </a>
              )}
            </div>
          </div>
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
  const groups = data.skills.reduce<Record<string, typeof data.skills>>((acc, s) => {
    const k = s.category || "General";
    (acc[k] ||= []).push(s);
    return acc;
  }, {});
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

// --- Projects (with search + tag filter) ---
export function Projects({ data }: { data: Bootstrap }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);

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
        {filtered.map((p, i) => (
          <Reveal key={p.id} enabled={data.theme.animations_enabled} delay={i * 0.04}>
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
                  {p.tech_tags.map((t) => (
                    <span
                      key={t}
                      className="text-xs rounded-full border border-white/15 px-2 py-0.5 text-secondary"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-3 text-sm">
                {p.github_url && (
                  <a href={p.github_url} className="text-primary hover:underline">Code</a>
                )}
                {p.demo_url && (
                  <a href={p.demo_url} className="text-primary hover:underline">Demo</a>
                )}
              </div>
            </Card>
          </Reveal>
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="text-muted text-sm">No projects match your search.</p>
      )}
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

// --- Experience ---
export function Experience({ data }: { data: Bootstrap }) {
  if (data.experiences.length === 0) return null;
  return (
    <Section id="experience" title="Experience">
      <div className="space-y-6">
        {data.experiences.map((e) => (
          <Card key={e.id}>
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
      </div>
    </Section>
  );
}

// --- Education ---
export function Education({ data }: { data: Bootstrap }) {
  if (data.education.length === 0) return null;
  return (
    <Section id="education" title="Education">
      <div className="space-y-6">
        {data.education.map((ed) => (
          <Card key={ed.id}>
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
        ))}
      </div>
    </Section>
  );
}

// --- Certifications ---
export function Certifications({ data }: { data: Bootstrap }) {
  if (data.certifications.length === 0) return null;
  return (
    <Section id="certifications" title="Certifications">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {data.certifications.map((c) => (
          <Card key={c.id}>
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
        ))}
      </div>
    </Section>
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
          <div>
            <h4 className="font-heading font-semibold mb-3 text-sm uppercase tracking-wide text-muted">
              Navigation
            </h4>
            <ul className="space-y-2 text-sm">
              {navLinks.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="hover:text-primary transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* contact + socials */}
        <div>
          <h4 className="font-heading font-semibold mb-3 text-sm uppercase tracking-wide text-muted">
            Contact
          </h4>
          <ul className="space-y-2 text-sm">
            {site.contact_email && (
              <li>
                <a href={`mailto:${site.contact_email}`} className="hover:text-primary">
                  {site.contact_email}
                </a>
              </li>
            )}
            {site.phone && (
              <li>
                <a href={`tel:${site.phone}`} className="hover:text-primary">{site.phone}</a>
              </li>
            )}
          </ul>
          {socials.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {socials.map((s) => (
                <a
                  key={s.id}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-theme border border-white/15 px-3 py-1.5 text-xs hover:border-primary transition-colors"
                >
                  {s.label || s.platform}
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
