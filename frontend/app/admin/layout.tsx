"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/store";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/site", label: "Site & Contact" },
  { href: "/admin/sections", label: "Sections / Tabs" },
  { href: "/admin/theme", label: "Theme" },
  { href: "/admin/hero", label: "Hero" },
  { href: "/admin/skills", label: "Skills" },
  { href: "/admin/recommendations", label: "Recommendations" },
  { href: "/admin/experience", label: "Experience" },
  { href: "/admin/education", label: "Education" },
  { href: "/admin/certifications", label: "Certifications" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/flags", label: "Feature Flags" },
  { href: "/admin/crawlers", label: "Crawlers" },
  { href: "/admin/agents", label: "AI Agents" },
  { href: "/admin/scheduler", label: "Scheduler" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { token, email, logout } = useAuth();
  const isLogin = pathname === "/admin/login";

  useEffect(() => {
    if (!token && !isLogin) router.replace("/admin/login");
  }, [token, isLogin, router]);

  if (isLogin) return <>{children}</>;
  if (!token) return null;

  return (
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
  );
}
