"use client";
import { useState, useId } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import {
  listCrawlerProfiles,
  createCrawlerProfile,
  updateCrawlerProfile,
  deleteCrawlerProfile,
} from "@/lib/api";
import type { CrawlerProfile, CrawlerProfileFieldsConfig } from "@/lib/types";

const APPLIES_OPTIONS = [
  { value: "all", label: "All projects" },
  { value: "hotel_reviews", label: "Hotel Reviews" },
  { value: "job_analytics", label: "Job Analytics" },
  { value: "universal_extractor", label: "Universal Extractor" },
];

type FieldDraft = {
  _key: string;
  name: string;
  selector_type: "css" | "regexp";
  selector: string;
  hint_regex: string;
  hint_contains: string;
  hint_min_len: string;
  required: boolean;
};

function emptyField(key: string): FieldDraft {
  return {
    _key: key, name: "", selector_type: "css", selector: "",
    hint_regex: "", hint_contains: "", hint_min_len: "", required: true,
  };
}

function draftToFieldsConfig(
  fields: FieldDraft[],
  loopEnabled: boolean,
  containerSelector: string,
  itemSelector: string,
): CrawlerProfileFieldsConfig {
  const fieldMap: Record<string, unknown> = {};
  for (const f of fields) {
    if (!f.name.trim()) continue;
    fieldMap[f.name.trim()] = {
      selector_type: f.selector_type,
      selector: f.selector.trim(),
      hint_regex: f.hint_regex.trim() || null,
      hint_contains: f.hint_contains.trim() || null,
      hint_min_len: f.hint_min_len ? Number(f.hint_min_len) : null,
      required: f.required,
    };
  }
  return {
    fields: fieldMap as CrawlerProfileFieldsConfig["fields"],
    loop: {
      enabled: loopEnabled,
      container_selector: containerSelector.trim(),
      item_selector: itemSelector.trim(),
    },
  };
}

function profileToForm(p: CrawlerProfile) {
  const fc = p.fields_config || { fields: {}, loop: { enabled: false, container_selector: "", item_selector: "" } };
  const fields: FieldDraft[] = Object.entries(fc.fields || {}).map(([name, fd], i) => ({
    _key: String(i),
    name,
    selector_type: (fd.selector_type as "css" | "regexp") || "css",
    selector: fd.selector || "",
    hint_regex: fd.hint_regex || "",
    hint_contains: fd.hint_contains || "",
    hint_min_len: fd.hint_min_len != null ? String(fd.hint_min_len) : "",
    required: fd.required ?? true,
  }));
  const loop = fc.loop || { enabled: false, container_selector: "", item_selector: "" };
  return {
    name: p.name,
    description: p.description || "",
    applies_to: p.applies_to || "all",
    target_url_pattern: p.target_url_pattern || "",
    fields,
    loopEnabled: loop.enabled,
    containerSelector: loop.container_selector,
    itemSelector: loop.item_selector,
  };
}

export default function CrawlerProfilesPage() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const toast = useToast();
  const uid = useId();

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["crawler-profiles"],
    queryFn: () => listCrawlerProfiles(),
  });

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [appliesTo, setAppliesTo] = useState("all");
  const [targetUrlPattern, setTargetUrlPattern] = useState("");
  const [fields, setFields] = useState<FieldDraft[]>([]);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [containerSelector, setContainerSelector] = useState("");
  const [itemSelector, setItemSelector] = useState("");
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [fieldCounter, setFieldCounter] = useState(0);

  function openCreate() {
    setEditingId(null);
    setName(""); setDescription(""); setAppliesTo("all"); setTargetUrlPattern("");
    setFields([]); setLoopEnabled(false); setContainerSelector(""); setItemSelector("");
    setShowJsonPreview(false);
    setShowModal(true);
  }

  function openEdit(p: CrawlerProfile) {
    setEditingId(p.id);
    const form = profileToForm(p);
    setName(form.name); setDescription(form.description); setAppliesTo(form.applies_to);
    setTargetUrlPattern(form.target_url_pattern); setFields(form.fields);
    setLoopEnabled(form.loopEnabled); setContainerSelector(form.containerSelector);
    setItemSelector(form.itemSelector);
    setShowJsonPreview(false);
    setShowModal(true);
  }

  function addField() {
    const key = `${uid}-${fieldCounter}`;
    setFieldCounter((c) => c + 1);
    setFields((fs) => [...fs, emptyField(key)]);
  }

  function updateField(key: string, patch: Partial<FieldDraft>) {
    setFields((fs) => fs.map((f) => (f._key === key ? { ...f, ...patch } : f)));
  }

  function removeField(key: string) {
    setFields((fs) => fs.filter((f) => f._key !== key));
  }

  const previewJson = JSON.stringify(
    draftToFieldsConfig(fields, loopEnabled, containerSelector, itemSelector),
    null, 2,
  );

  const saveMut = useMutation({
    mutationFn: () => {
      const fields_config = draftToFieldsConfig(fields, loopEnabled, containerSelector, itemSelector);
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        applies_to: appliesTo,
        target_url_pattern: targetUrlPattern.trim() || null,
        fields_config,
        is_active: true,
      };
      if (editingId != null) return updateCrawlerProfile(token, editingId, payload);
      return createCrawlerProfile(token, payload);
    },
    onSuccess: () => {
      toast.success(editingId != null ? "Profile updated" : "Profile created");
      qc.invalidateQueries({ queryKey: ["crawler-profiles"] });
      setShowModal(false);
    },
    onError: (err) => toast.error("Failed to save profile", err),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteCrawlerProfile(token, id),
    onSuccess: () => {
      toast.success("Profile deleted");
      qc.invalidateQueries({ queryKey: ["crawler-profiles"] });
    },
    onError: (err) => toast.error("Failed to delete", err),
  });

  const INPUT = "w-full bg-bg border border-white/15 rounded-theme px-3 py-2 text-sm focus:outline-none focus:border-primary/60";

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-heading font-bold text-2xl">Crawler Profiles</h1>
          <p className="text-muted text-sm mt-1">
            Named extraction configs — override LLM-generated selectors with hand-crafted CSS or regexp anchors.
            Select a profile when running Hotel Reviews or Job Analytics crawls.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-theme bg-primary text-white px-4 py-2 text-sm font-medium hover:opacity-90 shrink-0"
        >
          + New Profile
        </button>
      </div>

      {isLoading && <p className="text-muted text-sm">Loading…</p>}

      {!isLoading && profiles.length === 0 && (
        <div className="text-center py-20 text-muted border border-dashed border-white/15 rounded-theme">
          <p className="text-base mb-2">No profiles yet</p>
          <p className="text-sm">
            Create a profile to pin precise CSS selectors or regexp patterns to a crawl session,
            bypassing or guiding the LLM selector planner.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {profiles.map((p) => (
          <div
            key={p.id}
            className="flex items-start justify-between gap-4 rounded-theme bg-surface border border-white/10 px-5 py-4 shadow-card"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{p.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary">{p.applies_to}</span>
                <span className="text-xs text-muted">
                  {Object.keys(p.fields_config?.fields || {}).length} field(s)
                </span>
                {p.fields_config?.loop?.enabled && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">loop</span>
                )}
              </div>
              {p.description && <p className="text-sm text-muted mt-1">{p.description}</p>}
              {p.target_url_pattern && (
                <p className="text-xs text-muted mt-0.5 font-mono">{p.target_url_pattern}</p>
              )}
              <div className="flex flex-wrap gap-1 mt-2">
                {Object.keys(p.fields_config?.fields || {}).map((fn) => (
                  <span key={fn} className="text-xs font-mono bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
                    {fn}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => openEdit(p)}
                className="text-sm px-3 py-1.5 rounded-theme border border-white/15 hover:bg-white/5"
              >
                Edit
              </button>
              <button
                onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteMut.mutate(p.id); }}
                className="text-sm px-3 py-1.5 rounded-theme border border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8 px-4">
          <div className="w-full max-w-2xl rounded-theme bg-surface border border-white/15 p-6 shadow-2xl my-4">
            <h2 className="font-heading font-bold text-xl mb-5">
              {editingId != null ? "Edit Profile" : "New Crawler Profile"}
            </h2>

            {/* Basic info */}
            <div className="space-y-3 mb-6">
              <label className="block">
                <span className="text-sm text-muted mb-1 block">Profile name <span className="text-red-400">*</span></span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Booking.com Hotels"
                  className={INPUT}
                />
              </label>
              <label className="block">
                <span className="text-sm text-muted mb-1 block">Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="What this profile extracts and from which site"
                  className={INPUT}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-muted mb-1 block">Applies to</span>
                  <select value={appliesTo} onChange={(e) => setAppliesTo(e.target.value)} className={INPUT}>
                    {APPLIES_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm text-muted mb-1 block">Target URL pattern</span>
                  <input
                    value={targetUrlPattern}
                    onChange={(e) => setTargetUrlPattern(e.target.value)}
                    placeholder="e.g. booking.com"
                    className={INPUT}
                  />
                </label>
              </div>
            </div>

            {/* Fields */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Fields to extract</h3>
                <button
                  onClick={addField}
                  className="text-xs px-2.5 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10"
                >
                  + Add field
                </button>
              </div>

              {fields.length === 0 && (
                <p className="text-sm text-muted py-6 text-center border border-dashed border-white/10 rounded-theme">
                  No fields yet — click &quot;Add field&quot; to define what data to extract.
                </p>
              )}

              <div className="space-y-3">
                {fields.map((f) => (
                  <div key={f._key} className="rounded-theme border border-white/10 bg-bg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={f.name}
                        onChange={(e) => updateField(f._key, { name: e.target.value })}
                        placeholder="Field name (e.g. title)"
                        className="flex-1 bg-surface border border-white/15 rounded-theme px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-primary/60"
                      />
                      <div className="flex rounded-theme border border-white/15 overflow-hidden shrink-0">
                        {(["css", "regexp"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => updateField(f._key, { selector_type: t })}
                            className={`px-2.5 py-1.5 text-xs font-mono transition-colors ${
                              f.selector_type === t ? "bg-primary text-white" : "hover:bg-white/5 text-muted"
                            }`}
                          >
                            {t === "css" ? "CSS" : "RegExp"}
                          </button>
                        ))}
                      </div>
                      <label className="flex items-center gap-1 text-xs text-muted shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={f.required}
                          onChange={(e) => updateField(f._key, { required: e.target.checked })}
                        />
                        req
                      </label>
                      <button
                        type="button"
                        onClick={() => removeField(f._key)}
                        className="text-muted hover:text-red-400 text-xl leading-none shrink-0"
                      >
                        ×
                      </button>
                    </div>
                    <input
                      value={f.selector}
                      onChange={(e) => updateField(f._key, { selector: e.target.value })}
                      placeholder={
                        f.selector_type === "css"
                          ? "CSS selector — e.g. .hotel-name, h3.title, [data-name]"
                          : "RegExp pattern — e.g. \\$[0-9,.]+ or Rating:\\s*(\\d+)"
                      }
                      className="w-full bg-surface border border-white/15 rounded-theme px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-primary/60"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        value={f.hint_regex}
                        onChange={(e) => updateField(f._key, { hint_regex: e.target.value })}
                        placeholder="Hint regex (optional)"
                        className="bg-surface border border-white/10 rounded-theme px-2 py-1 text-xs font-mono focus:outline-none focus:border-primary/60"
                      />
                      <input
                        value={f.hint_contains}
                        onChange={(e) => updateField(f._key, { hint_contains: e.target.value })}
                        placeholder="Must contain (optional)"
                        className="bg-surface border border-white/10 rounded-theme px-2 py-1 text-xs font-mono focus:outline-none focus:border-primary/60"
                      />
                      <input
                        type="number"
                        value={f.hint_min_len}
                        onChange={(e) => updateField(f._key, { hint_min_len: e.target.value })}
                        placeholder="Min length"
                        className="bg-surface border border-white/10 rounded-theme px-2 py-1 text-xs focus:outline-none focus:border-primary/60"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Loop config */}
            <div className="mb-6 rounded-theme border border-white/10 p-4">
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={loopEnabled}
                  onChange={(e) => setLoopEnabled(e.target.checked)}
                />
                <span className="font-semibold text-sm">Loop extraction</span>
                <span className="text-xs text-muted">— repeat for each matching item in a container</span>
              </label>
              {loopEnabled && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">Container selector</span>
                    <input
                      value={containerSelector}
                      onChange={(e) => setContainerSelector(e.target.value)}
                      placeholder=".listing-card, [data-testid=hotel]"
                      className="w-full bg-bg border border-white/15 rounded-theme px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-primary/60"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">Item selector</span>
                    <input
                      value={itemSelector}
                      onChange={(e) => setItemSelector(e.target.value)}
                      placeholder=".item, li.result, > div"
                      className="w-full bg-bg border border-white/15 rounded-theme px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-primary/60"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* JSON preview */}
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setShowJsonPreview((v) => !v)}
                className="text-xs text-muted hover:text-fg flex items-center gap-1"
              >
                {showJsonPreview ? "▼" : "▶"} Preview config JSON
              </button>
              {showJsonPreview && (
                <textarea
                  readOnly
                  value={previewJson}
                  rows={Math.min(20, previewJson.split("\n").length + 1)}
                  className="mt-2 w-full bg-bg border border-white/10 rounded-theme px-3 py-2 text-xs font-mono focus:outline-none resize-none"
                />
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-theme border border-white/15 text-sm hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveMut.mutate()}
                disabled={!name.trim() || saveMut.isPending}
                className="px-5 py-2 rounded-theme bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saveMut.isPending ? "Saving…" : editingId != null ? "Update Profile" : "Create Profile"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
