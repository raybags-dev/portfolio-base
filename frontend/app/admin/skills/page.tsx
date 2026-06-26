"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSkill, deleteSkill, listSkills, updateSkill } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { Toggle } from "@/components/ui/Toggle";
import type { Skill } from "@/lib/types";

const STATUS_OPTIONS = ["Expert", "Advanced", "Intermediate", "Beginner"];
const inp = "w-full mt-1 rounded-lg bg-bg border border-white/15 px-3 py-2 text-sm outline-none focus:border-primary";

// ---- Tag editor ----------------------------------------------------------------
function TagEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");

  function add() {
    const v = input.trim();
    if (!v || tags.includes(v)) return;
    onChange([...tags, v]);
    setInput("");
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary"
          >
            {t}
            <button
              type="button"
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="hover:text-red-400 transition-colors leading-none"
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-muted">No technologies added yet</span>}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="e.g. FastAPI"
          className="flex-1 rounded-lg bg-bg border border-white/15 px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-lg border border-primary/40 text-primary text-xs px-3 py-1.5 hover:bg-primary/10 transition-colors"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

// ---- Skill modal (add / edit) --------------------------------------------------
function SkillModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Partial<Skill>;
  onSave: (data: Partial<Skill>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<Skill>>({
    name: "",
    icon: "",
    category: "",
    status: "",
    experience: "",
    primary_use: "",
    related_technologies: [],
    project_title: "",
    project_url: "",
    github_url: "",
    description: "",
    order: 0,
    featured: false,
    is_visible: true,
    ...initial,
  });

  const set = (patch: Partial<Skill>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-white/10 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 relative shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-xl text-muted hover:text-fg">×</button>
        <h2 className="font-heading font-bold text-lg mb-5">
          {initial?.id ? "Edit Skill" : "Add Skill"}
        </h2>

        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">Basic Information</p>
        <div className="space-y-3 mb-5">
          <label className="block">
            <span className="text-xs text-muted uppercase tracking-wide">Skill Name *</span>
            <input value={form.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Python" className={inp} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted uppercase tracking-wide">Icon</span>
              <input value={form.icon ?? ""} onChange={(e) => set({ icon: e.target.value })} placeholder="e.g. 🐍" className={inp} />
            </label>
            <label className="block">
              <span className="text-xs text-muted uppercase tracking-wide">Category</span>
              <input value={form.category ?? ""} onChange={(e) => set({ category: e.target.value })} placeholder="e.g. Backend Development" className={inp} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted uppercase tracking-wide">Status</span>
              <select
                value={form.status ?? ""}
                onChange={(e) => set({ status: e.target.value || undefined })}
                className={inp + " cursor-pointer"}
              >
                <option value="">— Select —</option>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted uppercase tracking-wide">Experience</span>
              <input value={form.experience ?? ""} onChange={(e) => set({ experience: e.target.value })} placeholder="e.g. 6+ Years" className={inp} />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-muted uppercase tracking-wide">Primary Use</span>
            <input value={form.primary_use ?? ""} onChange={(e) => set({ primary_use: e.target.value })} placeholder="e.g. Backend APIs, Automation & AI" className={inp} />
          </label>
          <label className="block">
            <span className="text-xs text-muted uppercase tracking-wide">Description (shown in details modal)</span>
            <textarea value={form.description ?? ""} onChange={(e) => set({ description: e.target.value })} rows={2} placeholder="Longer description..." className={inp} />
          </label>
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">Related Technologies</p>
        <div className="mb-5">
          <TagEditor
            tags={form.related_technologies ?? []}
            onChange={(tags) => set({ related_technologies: tags })}
          />
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">Featured Project</p>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <label className="block">
            <span className="text-xs text-muted uppercase tracking-wide">Project Title</span>
            <input value={form.project_title ?? ""} onChange={(e) => set({ project_title: e.target.value })} placeholder="e.g. AutoVid" className={inp} />
          </label>
          <label className="block">
            <span className="text-xs text-muted uppercase tracking-wide">Project URL</span>
            <input value={form.project_url ?? ""} onChange={(e) => set({ project_url: e.target.value })} placeholder="/projects/autovid" className={inp} />
          </label>
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">Links</p>
        <div className="mb-5">
          <label className="block">
            <span className="text-xs text-muted uppercase tracking-wide">GitHub URL</span>
            <input value={form.github_url ?? ""} onChange={(e) => set({ github_url: e.target.value })} placeholder="https://github.com/..." className={inp} />
          </label>
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">Display Controls</p>
        <div className="space-y-3 mb-6">
          <label className="flex items-center justify-between">
            <span className="text-sm">Featured</span>
            <Toggle checked={!!form.featured} onChange={(v) => set({ featured: v })} />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-sm">Visible</span>
            <Toggle checked={form.is_visible !== false} onChange={(v) => set({ is_visible: v })} />
          </label>
          <label className="block">
            <span className="text-xs text-muted uppercase tracking-wide">Display Order</span>
            <input type="number" value={form.order ?? 0} onChange={(e) => set({ order: Number(e.target.value) })} className={inp} />
          </label>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => { if (!form.name?.trim()) return; onSave(form); }}
            className="flex-1 rounded-lg bg-primary text-white py-2.5 font-medium hover:opacity-90"
          >
            Save
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg border border-white/15 py-2.5 hover:bg-white/5">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Skill row -----------------------------------------------------------------
function SkillRow({
  skill,
  onEdit,
  onDelete,
  onToggleVisible,
  onToggleFeatured,
}: {
  skill: Skill;
  onEdit: () => void;
  onDelete: () => void;
  onToggleVisible: () => void;
  onToggleFeatured: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/8 bg-surface group hover:border-white/20 transition-colors">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-lg shrink-0">
        {skill.icon ? (
          <span>{skill.icon}</span>
        ) : (
          <span className="text-[10px] font-bold text-primary">
            {skill.name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${!skill.is_visible ? "opacity-40 line-through" : ""}`}>
            {skill.name}
          </span>
          {skill.featured && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30">Featured</span>
          )}
          {skill.status && (
            <span className="text-[10px] text-muted border border-white/10 rounded px-1.5 py-0.5">{skill.status}</span>
          )}
        </div>
        {skill.category && <p className="text-[11px] text-muted truncate">{skill.category}</p>}
      </div>

      <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onToggleFeatured} title="Toggle featured" className="text-[11px] text-muted hover:text-accent transition-colors px-1">
          {skill.featured ? "★" : "☆"}
        </button>
        <button onClick={onToggleVisible} className="text-[11px] text-muted hover:text-primary transition-colors">
          {skill.is_visible ? "hide" : "show"}
        </button>
        <button onClick={onEdit} className="text-[11px] border border-white/15 rounded-full px-2.5 py-0.5 hover:border-primary hover:text-primary transition-colors">
          Edit
        </button>
        <button onClick={onDelete} className="text-[11px] text-red-400 hover:text-red-300 transition-colors">
          del
        </button>
      </div>
    </div>
  );
}

// ---- Page ----------------------------------------------------------------------
export default function SkillsPage() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["skills"], queryFn: listSkills });
  const skills = data?.items ?? [];

  const [addModal, setAddModal] = useState(false);
  const [editSkill, setEditSkill] = useState<Skill | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["skills"] });
    qc.invalidateQueries({ queryKey: ["bootstrap"] });
  };

  const createMutation = useMutation({
    mutationFn: (body: Partial<Skill>) => createSkill(token, body),
    onSuccess: () => { toast.success("Skill added"); refresh(); },
    onError: (err) => toast.error("Failed to add skill", err),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Skill> }) => updateSkill(token, id, body),
    onSuccess: () => { toast.success("Skill updated"); refresh(); },
    onError: (err) => toast.error("Failed to update", err),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSkill(token, id),
    onSuccess: () => { toast.success("Skill deleted"); refresh(); },
    onError: (err) => toast.error("Failed to delete", err),
  });

  function handleSave(form: Partial<Skill>) {
    if (editSkill) {
      updateMutation.mutate({ id: editSkill.id, body: form });
      setEditSkill(null);
    } else {
      createMutation.mutate(form);
      setAddModal(false);
    }
  }

  const sorted = [...skills].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading font-bold text-2xl">Skills</h1>
          <p className="text-muted text-sm mt-1">{skills.length} skill{skills.length !== 1 ? "s" : ""} total</p>
        </div>
        <button
          onClick={() => setAddModal(true)}
          className="rounded-lg bg-primary text-white px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          + Add Skill
        </button>
      </div>

      {sorted.length === 0 && (
        <p className="text-muted text-sm">No skills yet — add your first skill.</p>
      )}

      <div className="space-y-2">
        {sorted.map((skill) => (
          <SkillRow
            key={skill.id}
            skill={skill}
            onEdit={() => setEditSkill(skill)}
            onDelete={() => deleteMutation.mutate(skill.id)}
            onToggleVisible={() => updateMutation.mutate({ id: skill.id, body: { is_visible: !skill.is_visible } })}
            onToggleFeatured={() => updateMutation.mutate({ id: skill.id, body: { featured: !skill.featured } })}
          />
        ))}
      </div>

      {addModal && (
        <SkillModal onSave={handleSave} onClose={() => setAddModal(false)} />
      )}
      {editSkill && (
        <SkillModal
          initial={editSkill}
          onSave={handleSave}
          onClose={() => setEditSkill(null)}
        />
      )}
    </div>
  );
}
