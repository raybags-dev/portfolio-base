"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBootstrap, updateTheme } from "@/lib/api";
import { useAuth } from "@/lib/store";
import type { Theme } from "@/lib/types";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/admin/Toast";

// Theme is intentionally simple: the site ships with one carefully-designed
// palette. Admins choose the default mode (dark/light) and toggle motion —
// no per-colour editing. Visitors can still flip dark/light on the site.
export default function ThemePage() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const [form, setForm] = useState<Partial<Theme>>({});

  useEffect(() => {
    if (data?.theme) setForm(data.theme);
  }, [data?.theme]);

  const save = useMutation({
    mutationFn: (patch: Partial<Theme>) => updateTheme(token, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("Theme updated");
    },
    onError: (e) => toast.error("Could not save theme", e),
  });

  const set = (patch: Partial<Theme>) => {
    setForm((f) => ({ ...f, ...patch }));
    save.mutate(patch);
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl mb-1">Theme</h1>
        <p className="text-muted text-sm">
          Dark and light modes only — the palette is part of the site&apos;s identity.
        </p>
      </div>

      <div>
        <span className="text-sm font-medium">Default mode</span>
        <div className="mt-2 flex gap-2">
          {(["dark", "light"] as const).map((m) => (
            <button
              key={m}
              onClick={() => set({ default_mode: m })}
              className={`rounded-theme px-5 py-2.5 border capitalize transition-colors ${
                (form.default_mode || "dark") === m
                  ? "border-primary text-primary bg-primary/10"
                  : "border-white/15 text-muted hover:border-white/30"
              }`}
            >
              {m === "dark" ? "☾ Dark" : "☀ Light"}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted mt-2">
          The starting mode for new visitors. They can still toggle it themselves.
        </p>
      </div>

      <div className="space-y-3 pt-2">
        <label className="flex items-center justify-between">
          <span className="text-sm">Animations</span>
          <Toggle
            checked={!!form.animations_enabled}
            onChange={(v) => set({ animations_enabled: v })}
          />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm">Parallax hero background</span>
          <Toggle
            checked={!!form.parallax_enabled}
            onChange={(v) => set({ parallax_enabled: v })}
          />
        </label>
      </div>
    </div>
  );
}
