"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBootstrap, updateAbout } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { ImageInput } from "@/components/ui/ImageInput";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/admin/Toast";

export default function AboutAdmin() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });

  const [form, setForm] = useState({
    heading: "",
    biography: "",
    description: "",
    image_url: "",
    highlights: "",
    is_visible: true,
  });

  useEffect(() => {
    const a = data?.about;
    if (a) {
      setForm({
        heading: a.heading || "",
        biography: a.biography || "",
        description: a.description || "",
        image_url: a.image_url || "",
        highlights: (a.highlights || []).join("\n"),
        is_visible: a.is_visible,
      });
    }
  }, [data?.about]);

  const save = useMutation({
    mutationFn: () =>
      updateAbout(token, {
        heading: form.heading,
        biography: form.biography,
        description: form.description,
        image_url: form.image_url,
        highlights: form.highlights.split("\n").map((s) => s.trim()).filter(Boolean),
        is_visible: form.is_visible,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("About section saved");
    },
    onError: (e) => toast.error("Could not save About", e),
  });

  const cls = "w-full mt-1 rounded-theme bg-bg border border-white/15 px-3 py-2";

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-heading font-bold text-2xl mb-2">About</h1>

      <label className="block">
        <span className="text-sm">Heading</span>
        <input value={form.heading} onChange={(e) => setForm({ ...form, heading: e.target.value })} className={cls} />
      </label>
      <label className="block">
        <span className="text-sm">Biography</span>
        <textarea value={form.biography} onChange={(e) => setForm({ ...form, biography: e.target.value })} rows={4} className={cls} />
      </label>
      <label className="block">
        <span className="text-sm">Description</span>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className={cls} />
      </label>
      <ImageInput label="Image" value={form.image_url} onChange={(v) => setForm({ ...form, image_url: v })} />
      <label className="block">
        <span className="text-sm">Highlights (one per line)</span>
        <textarea value={form.highlights} onChange={(e) => setForm({ ...form, highlights: e.target.value })} rows={4} className={cls} />
      </label>
      <label className="flex items-center justify-between">
        <span className="text-sm">Visible on site</span>
        <Toggle checked={form.is_visible} onChange={(v) => setForm({ ...form, is_visible: v })} />
      </label>

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="rounded-theme bg-primary text-white px-5 py-2.5 font-medium hover:opacity-90 disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : "Save About"}
      </button>
    </div>
  );
}
