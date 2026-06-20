"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBootstrap, updateHero, resetHero } from "@/lib/api";
import { useAuth } from "@/lib/store";
import type { Hero } from "@/lib/types";
import { ImageInput } from "@/components/ui/ImageInput";
import { ResetConfirm } from "@/components/admin/ResetConfirm";
import { useToast } from "@/components/ui/Toast";

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.05,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm">{label}</span>
        <span className="text-xs font-mono text-muted">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary"
      />
      {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
    </label>
  );
}

export default function HeroPage() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const [form, setForm] = useState<Partial<Hero>>({});

  useEffect(() => {
    if (data?.hero) setForm(data.hero);
  }, [data?.hero]);

  const save = useMutation({
    mutationFn: () => updateHero(token, form),
    onSuccess: () => {
      toast.success("Hero saved");
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
    },
    onError: (err) => toast.error("Failed to save hero", err),
  });

  const set = (k: keyof Hero, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const text = (label: string, k: keyof Hero, placeholder?: string) => (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input
        value={(form[k] as string) || ""}
        onChange={(e) => set(k, e.target.value)}
        placeholder={placeholder}
        className="w-full mt-1 rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm"
      />
    </label>
  );

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-heading font-bold text-2xl">Hero</h1>
        <ResetConfirm
          onReset={() => resetHero(token).then((h) => { setForm(h); })}
          invalidateKeys={[["bootstrap"]]}
        />
      </div>

      {/* Text content */}
      <div className="rounded-theme border border-white/10 bg-surface p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Content</h2>
        {text("Your name (shown as name chip)", "name", "e.g. Baguma Raymond")}
        {text("Title / headline", "title", "e.g. Data Engineer")}
        {text("Subtitle / tagline", "subtitle", "e.g. Building scalable pipelines…")}
        {text("CTA button text", "cta_text", "e.g. View my work")}
        {text("CTA button URL", "cta_url", "e.g. #projects")}
      </div>

      {/* Avatar */}
      <div className="rounded-theme border border-white/10 bg-surface p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Profile photo</h2>
        <ImageInput
          label="Avatar image"
          value={(form.avatar_url as string) || ""}
          onChange={(v) => set("avatar_url", v)}
        />
        <label className="block">
          <span className="text-sm">Shape</span>
          <select
            value={(form.avatar_shape as string) || "circle"}
            onChange={(e) => set("avatar_shape", e.target.value)}
            className="w-full mt-1 rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm"
          >
            <option value="circle">Circle</option>
            <option value="rounded">Rounded rectangle</option>
            <option value="none">Hidden (no avatar)</option>
          </select>
        </label>
      </div>

      {/* Background */}
      <div className="rounded-theme border border-white/10 bg-surface p-4 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Background</h2>
        <label className="block">
          <span className="text-sm">Background mode</span>
          <select
            value={form.background_mode || "gradient"}
            onChange={(e) => set("background_mode", e.target.value)}
            className="w-full mt-1 rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm"
          >
            <option value="gradient">Gradient (uses theme colours)</option>
            <option value="image">Image</option>
            <option value="color">Solid colour</option>
          </select>
        </label>
        <ImageInput
          label="Background image (when mode = image)"
          value={(form.background_image_url as string) || ""}
          onChange={(v) => set("background_image_url", v)}
        />

        <Slider
          label="Image opacity"
          value={(form.background_opacity as number) ?? 0.2}
          onChange={(v) => set("background_opacity", v)}
          hint="0 = invisible · 1 = fully opaque. Default 0.2."
        />
        <Slider
          label="Greyscale amount"
          value={(form.img_grayscale as number) ?? 0}
          onChange={(v) => set("img_grayscale", v)}
          hint="0 = full colour · 1 = full greyscale."
        />
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={!!form.img_invert}
            onChange={(e) => set("img_invert", e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          <div>
            <span className="text-sm">Invert image colours</span>
            <p className="text-xs text-muted">Use to convert a dark photo for a light theme.</p>
          </div>
        </label>
      </div>

      {/* Visibility */}
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={!!form.is_visible}
          onChange={(e) => set("is_visible", e.target.checked)}
          className="w-4 h-4 accent-primary"
        />
        <span className="text-sm">Hero section visible</span>
      </label>

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="flex items-center gap-2 rounded-theme bg-primary text-white px-5 py-2.5 font-medium hover:opacity-90 disabled:opacity-50"
      >
        {save.isPending && <Spinner />}
        {save.isPending ? "Saving…" : "Save hero"}
      </button>
    </div>
  );
}
