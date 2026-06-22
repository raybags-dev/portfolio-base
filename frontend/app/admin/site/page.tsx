"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBootstrap, updateSiteConfig, resetSiteConfig } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { ImageInput } from "@/components/ui/ImageInput";
import { Toggle } from "@/components/ui/Toggle";
import { ResetConfirm } from "@/components/admin/ResetConfirm";
import { useToast } from "@/components/admin/Toast";
import { ApiError } from "@/lib/api";

export default function SiteAdmin() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const [form, setForm] = useState<Record<string, string>>({});
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    if (data?.site_configuration) {
      const s = data.site_configuration as unknown as Record<string, unknown>;
      const f: Record<string, string> = {};
      for (const k of Object.keys(s)) f[k] = (s[k] as string) ?? "";
      setForm(f);
      setMaintenanceMode(!!data.site_configuration.maintenance_mode);
    }
  }, [data?.site_configuration]);

  // Strip read-only/extra fields the frontend echoes back from bootstrap,
  // and coerce empty strings to null for JSON dict fields.
  function buildPayload(f: Record<string, unknown>) {
    const skip = new Set(["id", "created_at", "updated_at"]);
    const jsonFields = new Set(["structured_data"]);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) {
      if (skip.has(k)) continue;
      if (jsonFields.has(k)) {
        out[k] = typeof v === "string" && v.trim() === "" ? null : v;
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  const save = useMutation({
    mutationFn: () => updateSiteConfig(token, { ...buildPayload(form), maintenance_mode: maintenanceMode }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("Site settings saved");
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
          ? e.message
          : "Could not save — check your inputs";
      toast.error("Save failed", new Error(msg));
    },
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const cls = "w-full mt-1 rounded-theme bg-bg border border-white/15 px-3 py-2 outline-none focus:border-primary";
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
      <div className="rounded-theme border border-white/10 bg-surface p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Logo / Brand</h2>
        <ImageInput
          label="Dark theme logo"
          value={form.logo_url_dark || ""}
          onChange={(v) => set("logo_url_dark", v)}
        />
        <ImageInput
          label="Light theme logo"
          value={form.logo_url_light || ""}
          onChange={(v) => set("logo_url_light", v)}
        />
        <p className="text-xs text-muted">Leave a themed logo blank to fall back to the default below.</p>
        <ImageInput
          label="Fallback logo (used when no themed logo is set)"
          value={form.logo_url || ""}
          onChange={(v) => set("logo_url", v)}
        />
      </div>
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
        <span className="text-sm">
          Map embed (paste the full{" "}
          <code className="text-xs bg-white/10 px-1 rounded">&lt;iframe&gt;</code> snippet
          from Google Maps → Share → Embed a map)
        </span>
        <textarea
          value={form.map_embed_url || ""}
          onChange={(e) => set("map_embed_url", e.target.value)}
          rows={3}
          className={cls + " font-mono text-xs"}
          placeholder={`<iframe src="https://www.google.com/maps/embed?pb=..." ...></iframe>`}
        />
        <p className="text-xs text-muted mt-1">
          Google Maps → Share → Embed a map → copy the entire iframe code
        </p>
      </label>

      {/* Maintenance mode */}
      <div className="rounded-theme border border-white/10 bg-surface p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Maintenance Mode</h2>
            <p className="text-xs text-muted mt-0.5">When enabled the public site shows a maintenance page instead.</p>
          </div>
          <Toggle checked={maintenanceMode} onChange={setMaintenanceMode} />
        </div>

        {maintenanceMode && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p className="text-xs text-amber-300">Maintenance mode is <strong>active</strong> — the public site is hidden.</p>
          </div>
        )}

        <label className="block">
          <span className="text-sm">Page title</span>
          <input
            value={form.maintenance_title || ""}
            onChange={(e) => set("maintenance_title", e.target.value)}
            placeholder="Under Maintenance"
            className={cls}
          />
        </label>

        <label className="block">
          <span className="text-sm">Message</span>
          <textarea
            value={form.maintenance_message || ""}
            onChange={(e) => set("maintenance_message", e.target.value)}
            rows={2}
            placeholder="We're upgrading the data pipeline. Check back soon."
            className={cls}
          />
        </label>

        <label className="block">
          <span className="text-sm">Countdown end date &amp; time</span>
          <input
            type="datetime-local"
            value={
              form.maintenance_end_at
                ? form.maintenance_end_at.replace("Z", "").substring(0, 16)
                : ""
            }
            onChange={(e) =>
              set("maintenance_end_at", e.target.value ? new Date(e.target.value).toISOString() : "")
            }
            className={cls + " text-sm"}
          />
          <p className="text-xs text-muted mt-1">Leave blank to hide the countdown timer.</p>
        </label>

        <div className="space-y-3 pt-1">
          <p className="text-xs text-muted uppercase tracking-widest">Background images</p>
          <ImageInput
            label="Dark theme background"
            value={form.maintenance_bg_image_url_dark || ""}
            onChange={(v) => set("maintenance_bg_image_url_dark", v)}
          />
          <ImageInput
            label="Light theme background"
            value={form.maintenance_bg_image_url_light || ""}
            onChange={(v) => set("maintenance_bg_image_url_light", v)}
          />
          <p className="text-xs text-muted">Leave a themed image blank to fall back to the default below.</p>
          <ImageInput
            label="Fallback background"
            value={form.maintenance_bg_image_url || ""}
            onChange={(v) => set("maintenance_bg_image_url", v)}
          />
        </div>
      </div>

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="rounded-theme bg-primary text-white px-5 py-2.5 font-medium hover:opacity-90 disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
