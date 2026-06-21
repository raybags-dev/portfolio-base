"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listSections, updateSection, resetSections } from "@/lib/api";
import { useAuth } from "@/lib/store";
import type { Section } from "@/lib/types";
import { Toggle } from "@/components/ui/Toggle";
import { ResetConfirm } from "@/components/admin/ResetConfirm";
import { useToast } from "@/components/ui/Toast";
import { ImageInput } from "@/components/ui/ImageInput";

export default function SectionsAdmin() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const toast = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
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
          <div key={s.key}>
            <div
              className={`flex items-center justify-between rounded-theme bg-surface border px-4 py-3 transition-opacity ${
                s.enabled ? "border-white/10" : "border-white/5 opacity-50 grayscale"
              } ${expanded === s.key ? "rounded-b-none" : ""}`}
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
              <div className="flex items-center gap-4">
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
                <button
                  onClick={() => setExpanded(expanded === s.key ? null : s.key)}
                  className="text-muted hover:text-fg transition-colors text-sm px-2"
                  title="Set background images"
                  aria-label={expanded === s.key ? "Collapse" : "Background images"}
                >
                  {expanded === s.key ? "▲" : "▼"}
                </button>
              </div>
            </div>
            {expanded === s.key && (
              <div className="rounded-b-theme border border-t-0 border-white/10 bg-surface/50 px-4 py-4 space-y-3">
                <p className="text-xs text-muted">Background images for this section (fixed parallax, per theme).</p>
                <ImageInput
                  label="Dark theme background"
                  value={s.background_image_url_dark || ""}
                  onChange={(v) => mut.mutate({ key: s.key, body: { background_image_url_dark: v || null } })}
                />
                <ImageInput
                  label="Light theme background"
                  value={s.background_image_url_light || ""}
                  onChange={(v) => mut.mutate({ key: s.key, body: { background_image_url_light: v || null } })}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
