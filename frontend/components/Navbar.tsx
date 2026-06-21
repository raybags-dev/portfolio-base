"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { Section, SiteConfiguration, Theme } from "@/lib/types";
import { buildNavItems, type NavItem } from "@/lib/nav";
import { useUI } from "@/lib/store";

const MAX_VISIBLE = 4; // links shown inline; the rest go under "Explore"

function ThemeToggle({ theme }: { theme: Theme }) {
  const mode = useUI((s) => s.mode) ?? theme.default_mode;
  const toggle = useUI((s) => s.toggleMode);
  return (
    <button
      onClick={() => toggle(theme.default_mode)}
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={mode === "dark" ? "Light mode" : "Dark mode"}
      className="grid h-9 w-9 place-items-center rounded-full border border-white/15 hover:border-primary transition-colors text-lg"
    >
      {mode === "dark" ? "☀" : "☾"}
    </button>
  );
}

function scrollTo(key: string) {
  const el = document.getElementById(key);
  if (el) {
    el.scrollIntoView({ behavior: "smooth" });
    window.history.replaceState(null, "", `/#${key}`);
  } else {
    // Not on a page that has this section — navigate to root first.
    window.location.href = `/#${key}`;
  }
}

function NavLink({
  item,
  active,
  onNavigate,
  className,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const base = `transition-colors hover:text-primary whitespace-nowrap ${active ? "text-primary" : ""} ${className ?? ""}`;
  const shadow: React.CSSProperties = { textShadow: "0 0 6px rgba(255,255,255,0.9), 0 0 12px rgba(255,255,255,0.5)" };
  if (item.isAnchor) {
    return (
      <a
        href={`/#${item.key}`}
        onClick={(e) => {
          e.preventDefault();
          scrollTo(item.key);
          onNavigate?.();
        }}
        className={base}
        style={shadow}
      >
        {item.label}
      </a>
    );
  }
  return (
    <Link href={item.href} onClick={onNavigate} className={base} style={shadow}>
      {item.label}
    </Link>
  );
}

export default function Navbar({
  site,
  theme,
  sections,
}: {
  site: SiteConfiguration;
  theme: Theme;
  sections: Section[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // mobile drawer
  const [explore, setExplore] = useState(false); // desktop dropdown
  const exploreRef = useRef<HTMLDivElement>(null);
  const items = buildNavItems(sections);

  const visible = items.slice(0, MAX_VISIBLE);
  const overflow = items.slice(MAX_VISIBLE);

  useEffect(() => {
    setOpen(false);
    setExplore(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); setExplore(false); }
    }
    function onClick(e: MouseEvent) {
      if (exploreRef.current && !exploreRef.current.contains(e.target as Node)) {
        setExplore(false);
      }
    }
    function onScrollIntent() { setOpen(false); }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);

    if (open) {
      const y = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
      document.body.style.top = `-${y}px`;
      // Dismiss drawer when user scrolls (wheel or touch swipe)
      window.addEventListener("wheel", onScrollIntent, { passive: true });
      window.addEventListener("touchmove", onScrollIntent, { passive: true });
    } else {
      const top = document.body.style.top;
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.top = "";
      if (top) window.scrollTo(0, -parseInt(top, 10));
    }

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("wheel", onScrollIntent);
      window.removeEventListener("touchmove", onScrollIntent);
    };
  }, [open]);

  const active = (item: NavItem) => !item.isAnchor && pathname === item.href;

  return (
    <header className="sticky top-0 z-40 backdrop-blur border-b border-white/10 bg-bg/80">
      <nav className="container-x flex items-center justify-between h-16 gap-4">
        <Link href="/" className="flex items-center gap-2 font-heading font-bold text-lg shrink-0">
          {site.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.logo_url} alt={site.site_name} className="h-12 w-auto" style={{ borderRadius: "50%" }} />
          ) : (
            <span className="text-primary">{site.site_name}</span>
          )}
        </Link>

        {/* desktop */}
        <div className="hidden md:flex items-center gap-5 text-sm min-w-0">
          {visible.map((item) => (
            <NavLink key={item.key} item={item} active={active(item)} onNavigate={() => setExplore(false)} />
          ))}

          {overflow.length > 0 && (
            <div className="relative" ref={exploreRef}>
              <button
                onClick={() => setExplore((v) => !v)}
                aria-expanded={explore}
                className="flex items-center gap-1 hover:text-primary transition-colors"
              >
                Explore <span className="text-xs">▾</span>
              </button>
              <AnimatePresence>
                {explore && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="absolute right-0 mt-2 w-52 rounded-theme border border-white/10 bg-surface shadow-card p-1.5"
                    style={{ backgroundColor: "var(--color-surface)" }}
                  >
                    {overflow.map((item) => (
                      <NavLink
                        key={item.key}
                        item={item}
                        active={active(item)}
                        onNavigate={() => setExplore(false)}
                        className="block rounded-theme px-3 py-2 hover:bg-white/5"
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <ThemeToggle theme={theme} />
        </div>

        {/* mobile trigger */}
        <div className="md:hidden flex items-center gap-3">
          <ThemeToggle theme={theme} />
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="flex flex-col gap-1.5 p-2"
          >
            <span className="block h-0.5 w-6 bg-fg" />
            <span className="block h-0.5 w-6 bg-fg" />
            <span className="block h-0.5 w-6 bg-fg" />
          </button>
        </div>
      </nav>

      {/* mobile drawer — opaque, blurred, full height, above everything */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[80] md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="fixed right-0 top-0 h-[100dvh] w-72 max-w-[82%] border-l border-white/10 p-6 flex flex-col backdrop-blur-2xl shadow-2xl"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-surface) 96%, transparent)" }}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-center justify-between mb-6">
                <span className="font-heading font-bold text-primary">{site.site_name}</span>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="text-2xl leading-none text-muted hover:text-fg"
                >
                  ×
                </button>
              </div>
              <nav className="flex flex-col gap-1 overflow-hidden">
                {items.map((item) => (
                  <NavLink
                    key={item.key}
                    item={item}
                    active={active(item)}
                    onNavigate={() => setOpen(false)}
                    className="rounded-theme px-3 py-3 text-base hover:bg-white/10"
                  />
                ))}
              </nav>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
