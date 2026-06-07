"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getBootstrap } from "@/lib/api";

export default function AdminDashboard() {
  const { data } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });

  const stats = [
    { label: "Projects", value: data?.projects.length ?? "—" },
    { label: "Skills", value: data?.skills.length ?? "—" },
    { label: "Recommendations", value: data?.recommendations.length ?? "—" },
    {
      label: "Enabled flags",
      value: data
        ? Object.values(data.feature_flags).filter(Boolean).length
        : "—",
    },
    { label: "Live modules", value: data?.microservices.length ?? "—" },
  ];

  return (
    <div>
      <h1 className="font-heading font-bold text-2xl mb-6">Dashboard</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="rounded-theme bg-surface border border-white/10 p-4">
            <div className="text-3xl font-bold text-primary">{s.value}</div>
            <div className="text-sm text-muted">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="rounded-theme border border-white/10 p-5 text-sm text-muted">
        <p className="mb-2">
          Edit content, theme, and modules from the sidebar. Everything you change
          here updates the public site immediately — no redeploy.
        </p>
        <div className="flex gap-3 mt-3">
          <Link href="/admin/flags" className="text-primary hover:underline">Feature flags →</Link>
          <Link href="/admin/theme" className="text-primary hover:underline">Theme →</Link>
        </div>
        <p className="mt-4 text-xs">
          More entity editors (projects, blog, recommendations, crawlers, agents,
          reports) plug in here — the API CRUD already exists for them.
        </p>
      </div>
    </div>
  );
}
