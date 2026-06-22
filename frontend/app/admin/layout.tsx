"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/store";
import { ToastProvider } from "@/components/admin/Toast";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/site", label: "Site & Contact" },
  { href: "/admin/sections", label: "Sections / Tabs" },
  { href: "/admin/theme", label: "Theme" },
  { href: "/admin/hero", label: "Hero" },
  { href: "/admin/about", label: "About" },
  { href: "/admin/projects", label: "Projects" },
  { href: "/admin/skills", label: "Skills" },
  { href: "/admin/blog", label: "Blog" },
  { href: "/admin/recommendations", label: "Testimonials" },
  { href: "/admin/experience", label: "Experience" },
  { href: "/admin/education", label: "Education" },
  { href: "/admin/certifications", label: "Certifications" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/flags", label: "Feature Flags" },
  { href: "/admin/tokens", label: "Access Tokens" },
  { href: "/admin/logs", label: "Logs" },
  { href: "/admin/crawlers", label: "Crawlers" },
  { href: "/admin/crawler-profiles", label: "Crawler Profiles" },
  { href: "/admin/agents", label: "AI Agents" },
  { href: "/admin/scheduler", label: "Scheduler" },
  { href: "/admin/streams", label: "Stream Pipeline" },
  { href: "/admin/storage", label: "Storage (UDE)" },
  { href: "/admin/docs", label: "Documentation" },
  { href: "/admin/account", label: "Account" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { token, email, logout } = useAuth();
  const isLogin = pathname === "/admin/login" || pathname === "/admin/reset-password";

  // Wait for Zustand to rehydrate from localStorage before deciding to redirect.
  // Without this, every hard refresh shows the login page briefly then bounces back.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  useEffect(() => {
    if (hydrated && !token && !isLogin) router.replace("/admin/login");
  }, [hydrated, token, isLogin, router]);

  if (isLogin) return <ToastProvider>{children}</ToastProvider>;
  // Render nothing until hydration — avoids flash-redirect on refresh
  if (!hydrated || !token) return null;

  return (
    <ToastProvider>
    <div className="min-h-screen grid grid-cols-[220px_1fr]">
      <aside className="border-r border-white/10 bg-surface p-4 flex flex-col">
        <div className="font-heading font-bold text-primary mb-6">Admin</div>
        <nav className="space-y-1 text-sm flex-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`block rounded-theme px-3 py-2 transition-colors ${
                pathname === n.href ? "bg-primary text-white" : "hover:bg-white/5"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="text-xs text-muted mt-4">
          <div className="truncate mb-2">{email}</div>
          <button onClick={logout} className="hover:text-primary">
            Log out
          </button>
          <Link href="/" className="block mt-1 hover:text-primary">
            ← View site
          </Link>
        </div>
      </aside>
      <main className="p-8 overflow-auto">{children}</main>
    </div>
    </ToastProvider>
  );
}
