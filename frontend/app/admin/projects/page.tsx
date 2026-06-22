"use client";
import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
  type Project,
  type ProjectCreate,
} from "@/lib/api";
import { useAuth } from "@/lib/store";

// ── helpers ───────────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const STATUS_OPTIONS = ["published", "draft", "archived"];

const BLANK: ProjectCreate = {
  title: "",
  slug: "",
  summary: "",
  description: "",
  cover_image_url: "",
  video_url: "",
  github_url: "",
  demo_url: "",
  status: "published",
  tech_tags: [],
  is_featured: false,
  is_hidden: false,
  order: 0,
  service_key: "",
};

// ── Project form modal ────────────────────────────────────────────────────────

function ProjectModal({
  initial,
  onSave,
  onClose,
  busy,
}: {
  initial?: Project;
  onSave: (data: ProjectCreate) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<ProjectCreate>(() => ({
    ...BLANK,
    ...(initial ?? {}),
    tech_tags: initial?.tech_tags ?? [],
  }));
  const [tagInput, setTagInput] = useState("");

  const set = useCallback(
    (key: keyof ProjectCreate, val: unknown) =>
      setForm((f) => ({ ...f, [key]: val })),
    [],
  );

  const inp =
    "w-full mt-1 rounded-lg bg-bg border border-white/15 px-3 py-2 text-sm outline-none focus:border-primary";

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    set("tech_tags", [...(form.tech_tags ?? []), t]);
    setTagInput("");
  }

  function removeTag(i: number) {
    set(
      "tech_tags",
      (form.tech_tags ?? []).filter((_, idx) => idx !== i),
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-white/10 rounded-xl w-full max-w-2xl p-6 relative shadow-2xl overflow-y-auto max-h-[90vh]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-xl text-muted hover:text-fg"
        >
          ×
        </button>
        <h2 className="font-heading font-bold text-lg mb-5">
          {initial ? "Edit Project" : "New Project"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title + slug */}
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-muted uppercase tracking-wide">
                Title *
              </span>
              <input
                required
                value={form.title}
                onChange={(e) => {
                  set("title", e.target.value);
                  if (!initial)
                    set("slug", slugify(e.target.value));
                }}
                placeholder="DataForge ELT"
                className={inp}
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted uppercase tracking-wide">
                Slug *
              </span>
              <input
                required
                value={form.slug}
                onChange={(e) => set("slug", slugify(e.target.value))}
                placeholder="dataforge-elt"
                className={inp}
              />
            </label>
          </div>

          {/* Summary */}
          <label className="block">
            <span className="text-xs text-muted uppercase tracking-wide">
              Summary (one-liner)
            </span>
            <input
              value={form.summary ?? ""}
              onChange={(e) => set("summary", e.target.value)}
              placeholder="Short description shown on the project card"
              className={inp}
            />
          </label>

          {/* Description */}
          <label className="block">
            <span className="text-xs text-muted uppercase tracking-wide">
              Description (markdown)
            </span>
            <textarea
              rows={4}
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Full description. Markdown supported."
              className={`${inp} resize-none`}
            />
          </label>

          {/* URLs */}
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-muted uppercase tracking-wide">
                GitHub URL
              </span>
              <input
                type="url"
                value={form.github_url ?? ""}
                onChange={(e) => set("github_url", e.target.value)}
                placeholder="https://github.com/…"
                className={inp}
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted uppercase tracking-wide">
                Demo URL
              </span>
              <input
                type="url"
                value={form.demo_url ?? ""}
                onChange={(e) => set("demo_url", e.target.value)}
                placeholder="https://raybags.com/…"
                className={inp}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-muted uppercase tracking-wide">
                Cover image URL
              </span>
              <input
                type="url"
                value={form.cover_image_url ?? ""}
                onChange={(e) => set("cover_image_url", e.target.value)}
                placeholder="https://…"
                className={inp}
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted uppercase tracking-wide">
                Service key (links to feature flag)
              </span>
              <input
                value={form.service_key ?? ""}
                onChange={(e) => set("service_key", e.target.value || null)}
                placeholder="dataforge-elt"
                className={inp}
              />
            </label>
          </div>

          {/* Tech tags */}
          <div>
            <span className="text-xs text-muted uppercase tracking-wide">
              Tech tags
            </span>
            <div className="flex flex-wrap gap-1.5 mt-2 mb-2">
              {(form.tech_tags ?? []).map((t, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(i)}
                    className="hover:text-red-400"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Python, FastAPI, Docker…"
                className={`${inp} mt-0 flex-1`}
              />
              <button
                type="button"
                onClick={addTag}
                className="mt-0 px-3 rounded-lg border border-white/15 text-sm hover:border-primary/50 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Status + order + flags */}
          <div className="grid grid-cols-3 gap-4">
            <label className="block">
              <span className="text-xs text-muted uppercase tracking-wide">
                Status
              </span>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className={inp}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted uppercase tracking-wide">
                Order
              </span>
              <input
                type="number"
                value={form.order}
                onChange={(e) => set("order", Number(e.target.value))}
                className={inp}
              />
            </label>
            <div className="flex flex-col gap-2 mt-5">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) => set("is_featured", e.target.checked)}
                  className="accent-primary"
                />
                Featured
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_hidden}
                  onChange={(e) => set("is_hidden", e.target.checked)}
                  className="accent-primary"
                />
                Hidden
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-theme border border-white/15 text-sm hover:border-primary/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 rounded-theme bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {busy ? "Saving…" : initial ? "Update Project" : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Project card (list item) ──────────────────────────────────────────────────

function ProjectCard({
  project,
  onEdit,
  onDelete,
}: {
  project: Project;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-theme bg-surface border border-white/10 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{project.title}</span>
            <span className="text-xs text-muted font-mono">/{project.slug}</span>
            {project.is_featured && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                featured
              </span>
            )}
            {project.is_hidden && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400 border border-slate-500/20">
                hidden
              </span>
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${
                project.status === "published"
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : project.status === "draft"
                  ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                  : "bg-slate-500/20 text-slate-400 border-slate-500/20"
              }`}
            >
              {project.status}
            </span>
          </div>
          {project.summary && (
            <p className="text-sm text-muted mt-1 line-clamp-1">{project.summary}</p>
          )}
          <div className="flex flex-wrap gap-1 mt-2">
            {(project.tech_tags ?? []).map((t) => (
              <span
                key={t}
                className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/15"
              >
                {t}
              </span>
            ))}
          </div>
          {(project.github_url || project.demo_url) && (
            <div className="flex gap-3 mt-2">
              {project.github_url && (
                <a
                  href={project.github_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted hover:text-primary transition-colors"
                >
                  GitHub ↗
                </a>
              )}
              {project.demo_url && (
                <a
                  href={project.demo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted hover:text-primary transition-colors"
                >
                  Demo ↗
                </a>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-xs rounded-theme bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 text-xs rounded-theme bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectsAdmin() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-projects"],
    queryFn: () => listProjects(token),
  });
  const projects = data?.items ?? [];

  const [modal, setModal] = useState<"new" | Project | null>(null);

  const createMut = useMutation({
    mutationFn: (body: ProjectCreate) => createProject(token, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-projects"] }); setModal(null); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: ProjectCreate }) =>
      updateProject(token, id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-projects"] }); setModal(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteProject(token, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-projects"] }),
  });

  function onSave(data: ProjectCreate) {
    if (modal === "new") {
      createMut.mutate(data);
    } else if (modal && typeof modal === "object") {
      updateMut.mutate({ id: modal.id, body: data });
    }
  }

  const busy = createMut.isPending || updateMut.isPending;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading font-bold text-2xl">Projects</h1>
        <button
          onClick={() => setModal("new")}
          className="px-4 py-2 rounded-theme bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + New Project
        </button>
      </div>

      {isLoading && <p className="text-muted text-sm">Loading…</p>}

      <div className="space-y-3">
        {projects.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            onEdit={() => setModal(p)}
            onDelete={() => {
              if (confirm(`Delete "${p.title}"? This cannot be undone.`)) {
                deleteMut.mutate(p.id);
              }
            }}
          />
        ))}
        {!isLoading && projects.length === 0 && (
          <p className="text-muted text-sm">
            No projects yet. Click &quot;+ New Project&quot; to add one.
          </p>
        )}
      </div>

      {modal && (
        <ProjectModal
          initial={modal === "new" ? undefined : modal}
          onSave={onSave}
          onClose={() => setModal(null)}
          busy={busy}
        />
      )}
    </div>
  );
}
