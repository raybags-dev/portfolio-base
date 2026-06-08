"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBootstrap, updateSiteConfig, resetSiteConfig } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { ImageInput } from "@/components/ui/ImageInput";
import { ResetConfirm } from "@/components/admin/ResetConfirm";

export default function SiteAdmin() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.site_configuration) {
      const s = data.site_configuration as unknown as Record<string, unknown>;
      const f: Record<string, string> = {};
      for (const k of Object.keys(s)) f[k] = (s[k] as string) ?? "";
      setForm(f);
    }
  }, [data?.site_configuration]);

  const save = useMutation({
    mutationFn: () => updateSiteConfig(token, form),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const cls = "w-full mt-1 rounded-theme bg-bg border border-white/15 px-3 py-2";
  const text = (label: string, k: string, ph?: string) => (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input value={form[k] || ""} placeholder={ph} onChange={(e) => set(k, e.target.value)} className={cls} />
    </label>
  );

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-heading font-bold text-2xl mb-2">Site &amp; Contact</h1>
        <ResetConfirm
          onReset={() => resetSiteConfig(token).then((s) => {
            const raw = s as Record<string, unknown>;
            const f: Record<string, string> = {};
            for (const k of Object.keys(raw)) f[k] = (raw[k] as string) ?? "";
            setForm(f);
          })}
          invalidateKeys={[["bootstrap"]]}
        />
      </div>

      {text("Site name", "site_name")}
      {text("Tagline", "tagline")}
      <ImageInput label="Logo" value={form.logo_url || ""} onChange={(v) => set("logo_url", v)} />
      <ImageInput label="Favicon" value={form.favicon_url || ""} onChange={(v) => set("favicon_url", v)} />

      <h2 className="font-semibold pt-4 text-secondary">SEO</h2>
      {text("Meta title", "meta_title")}
      <label className="block">
        <span className="text-sm">Meta description</span>
        <textarea value={form.meta_description || ""} onChange={(e) => set("meta_description", e.target.value)} rows={2} className={cls} />
      </label>

      <h2 className="font-semibold pt-4 text-secondary">Contact</h2>
      {text("Contact email", "contact_email", "baguma.github@gmail.com")}
      {text("Mobile / phone", "phone", "+31 6 ...")}
      {text("Location address", "location_address")}
      <label className="block">
        <span className="text-sm">Map embed URL (Google Maps → Share → Embed → src)</span>
        <textarea value={form.map_embed_url || ""} onChange={(e) => set("map_embed_url", e.target.value)} rows={2} className={cls} placeholder="https://www.google.com/maps/embed?pb=..." />
      </label>

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="rounded-theme bg-primary text-white px-5 py-2.5 font-medium hover:opacity-90 disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : saved ? "Saved ✓" : "Save"}
      </button>
    </div>
  );
}
