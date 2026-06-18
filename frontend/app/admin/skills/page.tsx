"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSkill, deleteSkill, listSkills, updateSkill } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import type { Skill } from "@/lib/types";

// ---- Category modal (create/edit category metadata) -------------------------
function CategoryModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: { category: string; subheading: string; description: string; github_url: string };
  onSave: (data: { category: string; subheading: string; description: string; github_url: string }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    category: initial?.category ?? "",
    subheading: initial?.subheading ?? "",
    description: initial?.description ?? "",
    github_url: initial?.github_url ?? "",
  });
  const inp = "w-full mt-1 rounded-lg bg-bg border border-white/15 px-3 py-2 text-sm outline-none focus:border-primary";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-white/10 rounded-xl w-full max-w-lg p-6 relative shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-xl text-muted hover:text-fg">×</button>
        <h2 className="font-heading font-bold text-lg mb-5">
          {initial ? "Edit Category" : "Add Skill Category"}
        </h2>
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs text-muted uppercase tracking-wide">Category name *</span>
            <input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              required
              placeholder="e.g. Core Data Engineering"
              className={inp}
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted uppercase tracking-wide">Subheading</span>
            <input
              value={form.subheading}
              onChange={(e) => setForm((f) => ({ ...f, subheading: e.target.value }))}
              placeholder="Short tagline for this category"
              className={inp}
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted uppercase tracking-wide">Description (shown in modal)</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Longer description about this skill area"
              className={inp}
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted uppercase tracking-wide">GitHub repo URL</span>
            <input
              value={form.github_url}
              onChange={(e) => setForm((f) => ({ ...f, github_url: e.target.value }))}
              placeholder="https://github.com/..."
              className={inp}
            />
          </label>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => {
              if (!form.category.trim()) return;
              onSave(form);
            }}
            className="flex-1 rounded-lg bg-primary text-white py-2 font-medium hover:opacity-90"
          >
            Save
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg border border-white/15 py-2 hover:bg-white/5">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Add skill modal --------------------------------------------------------
function AddSkillModal({
  category,
  onSave,
  onClose,
}: {
  category: string;
  onSave: (data: { name: string; proficiency: number; order: number }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: "", proficiency: 80, order: 0 });
  const inp = "w-full mt-1 rounded-lg bg-bg border border-white/15 px-3 py-2 text-sm outline-none focus:border-primary";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-white/10 rounded-xl w-full max-w-sm p-6 relative shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-xl text-muted hover:text-fg">×</button>
        <h2 className="font-heading font-bold text-lg mb-1">Add Technology</h2>
        <p className="text-xs text-muted mb-5">Adding to: <span className="text-primary">{category}</span></p>
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs text-muted uppercase tracking-wide">Technology name *</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Apache Spark"
              className={inp}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted uppercase tracking-wide">Proficiency (0-100)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={form.proficiency}
                onChange={(e) => setForm((f) => ({ ...f, proficiency: Number(e.target.value) }))}
                className={inp}
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted uppercase tracking-wide">Order</span>
              <input
                type="number"
                value={form.order}
                onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) }))}
                className={inp}
              />
            </label>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => {
              if (!form.name.trim()) return;
              onSave(form);
            }}
            className="flex-1 rounded-lg bg-primary text-white py-2 font-medium hover:opacity-90"
          >
            Add
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg border border-white/15 py-2 hover:bg-white/5">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Category card ----------------------------------------------------------
function CategoryCard({
  cat,
  skills,
  onEditCategory,
  onAddSkill,
  onDeleteSkill,
  onToggleVisible,
}: {
  cat: string;
  skills: Skill[];
  onEditCategory: () => void;
  onAddSkill: () => void;
  onDeleteSkill: (id: number) => void;
  onToggleVisible: (skill: Skill) => void;
}) {
  const first = skills[0];
  return (
    <div className="rounded-xl border border-white/10 bg-surface shadow-card p-5">
      {/* header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3 className="font-heading font-bold text-base truncate">{cat}</h3>
          {first?.subheading && (
            <p className="text-xs text-secondary mt-0.5">{first.subheading}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {first?.github_url && (
            <a
              href={first.github_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-primary transition-colors"
              title="GitHub repo"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            </a>
          )}
          <button
            onClick={onEditCategory}
            className="text-xs border border-white/15 rounded-full px-3 py-1 hover:border-primary hover:text-primary transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onAddSkill}
            className="text-xs border border-primary/40 text-primary rounded-full px-3 py-1 hover:bg-primary/10 transition-colors"
          >
            + Add
          </button>
        </div>
      </div>

      {first?.description && (
        <p className="text-xs text-muted mb-3 line-clamp-2">{first.description}</p>
      )}

      {/* skill entries */}
      <div className="space-y-1 mt-3">
        {skills.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg/50 border border-white/5 group"
          >
            <span className={`flex-1 text-sm ${!s.is_visible ? "opacity-40 line-through" : ""}`}>
              {s.name}
            </span>
            <span className="text-xs text-muted w-16 text-right">{s.proficiency}%</span>
            <button
              onClick={() => onToggleVisible(s)}
              title={s.is_visible ? "Hide" : "Show"}
              className="text-muted hover:text-primary opacity-0 group-hover:opacity-100 transition-all text-xs"
            >
              {s.is_visible ? "hide" : "show"}
            </button>
            <button
              onClick={() => onDeleteSkill(s.id)}
              className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-all text-xs"
            >
              delete
            </button>
          </div>
        ))}
        {skills.length === 0 && (
          <p className="text-xs text-muted text-center py-3">No technologies yet — add one above.</p>
        )}
      </div>
    </div>
  );
}

// ---- Page -------------------------------------------------------------------
export default function SkillsPage() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["skills"], queryFn: listSkills });
  const skills = data?.items ?? [];

  // modals
  const [addCatModal, setAddCatModal] = useState(false);
  const [editCat, setEditCat] = useState<string | null>(null);
  const [addSkillCat, setAddSkillCat] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["skills"] });
    qc.invalidateQueries({ queryKey: ["bootstrap"] });
  };

  // group by category
  const groups: Record<string, Skill[]> = {};
  for (const s of skills) {
    const k = s.category || "General";
    (groups[k] ||= []).push(s);
  }

  const createMutation = useMutation({
    mutationFn: (body: Partial<Skill>) => createSkill(token, body),
    onSuccess: () => { toast.success("Saved"); refresh(); },
    onError: (err) => toast.error("Failed to save", err),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Skill> }) => updateSkill(token, id, body),
    onSuccess: () => { toast.success("Updated"); refresh(); },
    onError: (err) => toast.error("Failed to update", err),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSkill(token, id),
    onSuccess: () => { toast.success("Deleted"); refresh(); },
    onError: (err) => toast.error("Failed to delete", err),
  });

  function handleSaveCategory(form: { category: string; subheading: string; description: string; github_url: string }) {
    const existing = groups[form.category] ?? [];
    if (existing.length > 0) {
      // update metadata on all existing skills in this category
      Promise.all(
        existing.map((s) =>
          updateSkill(token, s.id, {
            subheading: form.subheading || null,
            description: form.description || null,
            github_url: form.github_url || null,
          })
        )
      )
        .then(() => { toast.success("Category updated"); refresh(); })
        .catch((err) => toast.error("Failed to update", err));
    } else {
      // new category: create a placeholder skill so the category exists
      createMutation.mutate({
        name: `${form.category} (add skills below)`,
        category: form.category,
        subheading: form.subheading || undefined,
        description: form.description || undefined,
        github_url: form.github_url || undefined,
        proficiency: 80,
        order: 0,
      });
    }
    setAddCatModal(false);
    setEditCat(null);
  }

  function handleAddSkill(cat: string, form: { name: string; proficiency: number; order: number }) {
    const ref = (groups[cat] ?? [])[0];
    createMutation.mutate({
      name: form.name,
      category: cat,
      proficiency: form.proficiency,
      order: form.order,
      subheading: ref?.subheading ?? undefined,
      description: ref?.description ?? undefined,
      github_url: ref?.github_url ?? undefined,
    });
    setAddSkillCat(null);
  }

  const editCatData = editCat
    ? (() => {
        const ref = (groups[editCat] ?? [])[0];
        return {
          category: editCat,
          subheading: ref?.subheading ?? "",
          description: ref?.description ?? "",
          github_url: ref?.github_url ?? "",
        };
      })()
    : undefined;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading font-bold text-2xl">Skills</h1>
        <button
          onClick={() => setAddCatModal(true)}
          className="rounded-lg bg-primary text-white px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          + Add Category
        </button>
      </div>

      {Object.keys(groups).length === 0 && (
        <p className="text-muted text-sm">No skills yet — add a category to get started.</p>
      )}

      <div className="grid sm:grid-cols-2 gap-5">
        {Object.entries(groups).map(([cat, catSkills]) => (
          <CategoryCard
            key={cat}
            cat={cat}
            skills={catSkills}
            onEditCategory={() => setEditCat(cat)}
            onAddSkill={() => setAddSkillCat(cat)}
            onDeleteSkill={(id) => deleteMutation.mutate(id)}
            onToggleVisible={(s) =>
              updateMutation.mutate({ id: s.id, body: { is_visible: !s.is_visible } })
            }
          />
        ))}
      </div>

      {/* Modals */}
      {addCatModal && (
        <CategoryModal onSave={handleSaveCategory} onClose={() => setAddCatModal(false)} />
      )}
      {editCat && editCatData && (
        <CategoryModal initial={editCatData} onSave={handleSaveCategory} onClose={() => setEditCat(null)} />
      )}
      {addSkillCat && (
        <AddSkillModal
          category={addSkillCat}
          onSave={(form) => handleAddSkill(addSkillCat, form)}
          onClose={() => setAddSkillCat(null)}
        />
      )}
    </div>
  );
}
