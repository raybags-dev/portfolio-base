"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listSections, updateSection, resetSections } from "@/lib/api";
import { useAuth } from "@/lib/store";
import type { Section } from "@/lib/types";
import { Toggle } from "@/components/ui/Toggle";
import { ResetConfirm } from "@/components/admin/ResetConfirm";
import { useToast } from "@/components/ui/Toast";

export default function SectionsAdmin() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const toast = useToast();
  const { data: sections = [] } = useQuery({ queryKey: ["sections"], queryFn: listSections });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["sections"] });
    qc.invalidateQueries({ queryKey: ["bootstrap"] });
  };
  const mut = useMutation({
    mutationFn: ({ key, body }: { key: string; body: Record<string, unknown> }) =>
      updateSection(token, key, body),
    onSuccess: () => { toast.success("Section updated"); refresh(); },
    onError: (err) => toast.error("Failed to update section", err),
  });

  const sorted = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="font-heading font-bold text-2xl">Sections &amp; Tabs</h1>
          <p className="text-muted text-sm mt-1">
            Show/hide any section and control whether it appears in the nav. No redeploy needed.
          </p>
        </div>
        <ResetConfirm
          onReset={() => resetSections(token)}
          invalidateKeys={[["sections"], ["bootstrap"]]}
        />
      </div>
      <div className="space-y-2 mt-6">
        {sorted.map((s: Section) => (
          <div
            key={s.key}
            className={`flex items-center justify-between rounded-theme bg-surface border px-4 py-3 transition-opacity ${
              s.enabled ? "border-white/10" : "border-white/5 opacity-50 grayscale"
            }`}
          >
            <div>
              <span className="font-medium">{s.label}</span>{" "}
              <span className="text-xs text-muted">#{s.key}</span>
              {!s.is_removable && (
                <span className="ml-2 text-xs text-muted">(core)</span>
              )}
              {!s.enabled && (
                <span className="ml-2 text-xs text-orange-400/70">(hidden)</span>
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
