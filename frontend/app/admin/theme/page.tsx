"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBootstrap, updateTheme } from "@/lib/api";
import { useAuth } from "@/lib/store";
import type { Theme } from "@/lib/types";

const COLOR_FIELDS: (keyof Theme)[] = [
  "primary_color",
  "secondary_color",
  "accent_color",
  "background_dark",
  "background_light",
  "text_dark",
  "text_light",
];

export default function ThemePage() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const [form, setForm] = useState<Partial<Theme>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.theme) setForm(data.theme);
  }, [data?.theme]);

  const save = useMutation({
    mutationFn: () => updateTheme(token, form),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const set = (k: keyof Theme, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading font-bold text-2xl mb-6">Theme</h1>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {COLOR_FIELDS.map((k) => (
          <label key={k} className="flex items-center justify-between gap-3 rounded-theme bg-surface border border-white/10 px-3 py-2">
            <span className="text-sm capitalize">{k.replace(/_/g, " ")}</span>
            <input
              type="color"
              value={(form[k] as string) || "#000000"}
              onChange={(e) => set(k, e.target.value)}
              className="h-8 w-12 bg-transparent"
            />
          </label>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <label className="block">
          <span className="text-sm">Default mode</span>
          <select
            value={form.default_mode || "dark"}
            onChange={(e) => set("default_mode", e.target.value)}
            className="w-full mt-1 rounded-theme bg-bg border border-white/15 px-3 py-2"
          >
            <option value="dark">dark</option>
            <option value="light">light</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm">Border radius</span>
          <input
            value={form.border_radius || ""}
            onChange={(e) => set("border_radius", e.target.value)}
            className="w-full mt-1 rounded-theme bg-bg border border-white/15 px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!form.animations_enabled}
            onChange={(e) => set("animations_enabled", e.target.checked)}
          />
          <span className="text-sm">Animations enabled</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!form.parallax_enabled}
            onChange={(e) => set("parallax_enabled", e.target.checked)}
          />
          <span className="text-sm">Parallax enabled</span>
        </label>
      </div>

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="rounded-theme bg-primary text-white px-5 py-2.5 font-medium hover:opacity-90 disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : saved ? "Saved ✓" : "Save theme"}
      </button>
    </div>
  );
}
