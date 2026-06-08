"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { Section, SiteConfiguration, Theme } from "@/lib/types";
import { buildNavItems } from "@/lib/nav";
import { useUI } from "@/lib/store";

function ThemeToggle({ theme }: { theme: Theme }) {
  const mode = useUI((s) => s.mode) ?? theme.default_mode;
  const toggle = useUI((s) => s.toggleMode);
  return (
    <button
      onClick={() => toggle(theme.default_mode)}
      aria-label="Toggle dark / light mode"
      className="rounded-theme border border-white/15 px-3 py-1.5 hover:border-primary transition-colors"
    >
      {mode === "dark" ? "☀ Light" : "☾ Dark"}
    </button>
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
  const [open, setOpen] = useState(false);
  const items = buildNavItems(sections);

  // Close drawer on route change + lock scroll while open + ESC to close.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (item: { href: string; isAnchor: boolean }) =>
    !item.isAnchor && pathname === item.href;

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

        {/* desktop */}
        <div className="hidden md:flex items-center gap-5 text-sm">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`transition-colors hover:text-primary ${
                isActive(item) ? "text-primary" : ""
              }`}
            >
              {item.label}
            </Link>
          ))}
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

      {/* mobile drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="absolute right-0 top-0 h-full w-72 max-w-[80%] bg-surface border-l border-white/10 p-6 flex flex-col"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-center justify-between mb-6">
                <span className="font-heading font-bold text-primary">{site.site_name}</span>
                <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-2xl leading-none text-muted hover:text-fg">
                  ×
                </button>
              </div>
              <nav className="flex flex-col gap-1">
                {items.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`rounded-theme px-3 py-3 text-base transition-colors hover:bg-white/5 ${
                      isActive(item) ? "text-primary bg-white/5" : ""
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
