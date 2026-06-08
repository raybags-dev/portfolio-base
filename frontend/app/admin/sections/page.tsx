"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listSections, updateSection } from "@/lib/api";
import { useAuth } from "@/lib/store";
import type { Section } from "@/lib/types";
import { Toggle } from "@/components/ui/Toggle";

export default function SectionsAdmin() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data: sections = [] } = useQuery({ queryKey: ["sections"], queryFn: listSections });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["sections"] });
    qc.invalidateQueries({ queryKey: ["bootstrap"] });
  };
  const mut = useMutation({
    mutationFn: ({ key, body }: { key: string; body: Record<string, unknown> }) =>
      updateSection(token, key, body),
    onSuccess: refresh,
  });

  const sorted = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading font-bold text-2xl mb-2">Sections &amp; Tabs</h1>
      <p className="text-muted text-sm mb-6">
        Show/hide any section of the site and control whether it appears in the nav.
        Disable a section to remove its tab entirely — no redeploy.
      </p>
      <div className="space-y-2">
        {sorted.map((s: Section) => (
          <div
            key={s.key}
            className="flex items-center justify-between rounded-theme bg-surface border border-white/10 px-4 py-3"
          >
            <div>
              <span className="font-medium">{s.label}</span>{" "}
              <span className="text-xs text-muted">#{s.key}</span>
              {!s.is_removable && (
                <span className="ml-2 text-xs text-muted">(core)</span>
              )}
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">In nav</span>
                <Toggle
                  checked={s.in_nav}
                  onChange={(v) => mut.mutate({ key: s.key, body: { in_nav: v } })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">Enabled</span>
                <Toggle
                  checked={s.enabled}
                  onChange={(v) => mut.mutate({ key: s.key, body: { enabled: v } })}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
