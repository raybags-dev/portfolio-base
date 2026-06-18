"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBootstrap, updateHero, resetHero } from "@/lib/api";
import { useAuth } from "@/lib/store";
import type { Hero } from "@/lib/types";
import { ImageInput } from "@/components/ui/ImageInput";
import { ResetConfirm } from "@/components/admin/ResetConfirm";
import { useToast } from "@/components/ui/Toast";

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
  const text = (label: string, k: keyof Hero) => (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input
        value={(form[k] as string) || ""}
        onChange={(e) => set(k, e.target.value)}
        className="w-full mt-1 rounded-theme bg-bg border border-white/15 px-3 py-2"
      />
    </label>
  );

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-heading font-bold text-2xl mb-2">Hero</h1>
        <ResetConfirm
          onReset={() => resetHero(token).then((h) => { setForm(h); })}
          invalidateKeys={[["bootstrap"]]}
        />
      </div>
      {text("Name", "name")}
      {text("Title", "title")}
      {text("Subtitle", "subtitle")}
      {text("CTA text", "cta_text")}
      {text("CTA url", "cta_url")}

      <ImageInput
        label="Background image"
        value={(form.background_image_url as string) || ""}
        onChange={(v) => set("background_image_url", v)}
      />
      <label className="block">
        <span className="text-sm">Background mode (fallback when no image is set)</span>
        <select
          value={form.background_mode || "gradient"}
          onChange={(e) => set("background_mode", e.target.value)}
          className="w-full mt-1 rounded-theme bg-bg border border-white/15 px-3 py-2"
        >
          <option value="gradient">gradient</option>
          <option value="image">image</option>
          <option value="color">color</option>
        </select>
      </label>

      <ImageInput
        label="Profile photo (of you)"
        value={(form.avatar_url as string) || ""}
        onChange={(v) => set("avatar_url", v)}
      />
      <label className="block">
        <span className="text-sm">Profile photo shape</span>
        <select
          value={(form.avatar_shape as string) || "circle"}
          onChange={(e) => set("avatar_shape", e.target.value)}
          className="w-full mt-1 rounded-theme bg-bg border border-white/15 px-3 py-2"
        >
          <option value="circle">circle</option>
          <option value="rounded">rounded</option>
          <option value="none">none (hide)</option>
        </select>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!form.is_visible}
          onChange={(e) => set("is_visible", e.target.checked)}
        />
        <span className="text-sm">Visible</span>
      </label>
      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="rounded-theme bg-primary text-white px-5 py-2.5 font-medium hover:opacity-90 disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : "Save hero"}
      </button>
    </div>
  );
}
