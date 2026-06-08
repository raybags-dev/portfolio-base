"use client";
import Link from "next/link";
import type { Section, SiteConfiguration, Theme } from "@/lib/types";
import { useUI } from "@/lib/store";

export default function Nav({
  site,
  theme,
  sections,
}: {
  site: SiteConfiguration;
  theme: Theme;
  sections: Section[];
}) {
  const mode = useUI((s) => s.mode) ?? theme.default_mode;
  const toggle = useUI((s) => s.toggleMode);

  const navItems = sections
    .filter((s) => s.enabled && s.in_nav && s.key !== "hero")
    .sort((a, b) => a.order - b.order);

  return (
    <header className="sticky top-0 z-40 backdrop-blur border-b border-white/10 bg-bg/70">
      <nav className="container-x flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2 font-heading font-bold text-lg">
          {site.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.logo_url} alt={site.site_name} className="h-8 w-auto" />
          ) : (
            <span className="text-primary">{site.site_name}</span>
          )}
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {navItems.map((s) =>
            s.key === "contact" ? (
              <Link
                key={s.key}
                href="/contact"
                className="hover:text-primary transition-colors hidden sm:inline"
              >
                {s.label}
              </Link>
            ) : (
              <a
                key={s.key}
                href={`#${s.key}`}
                className="hover:text-primary transition-colors hidden sm:inline"
              >
                {s.label}
              </a>
            ),
          )}
          <button
            onClick={() => toggle(theme.default_mode)}
            aria-label="Toggle theme"
            className="rounded-theme border border-white/15 px-3 py-1.5 hover:border-primary transition-colors"
          >
            {mode === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
        </div>
      </nav>
    </header>
  );
}
