"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBlogCategory,
  createBlogPost,
  createBlogTag,
  deleteBlogComment,
  deleteBlogPost,
  listBlogCategories,
  listBlogTags,
  manageBlogComments,
  manageBlogPosts,
  slugify,
  updateBlogPost,
  uploadMedia,
} from "@/lib/api";
import type { BlogCategory, BlogPost, BlogTag } from "@/lib/types";
import { useAuth } from "@/lib/store";
import { useToast } from "@/components/admin/Toast";
import { ImageInput } from "@/components/ui/ImageInput";
import { Toggle } from "@/components/ui/Toggle";
import MarkdownContent from "@/components/MarkdownContent";

interface EditorState {
  id?: number;
  title: string;
  slug: string;
  excerpt: string;
  content_markdown: string;
  cover_image_url: string;
  status: string;
  is_featured: boolean;
  category_id: number | null;
  tags: string; // comma-separated names
  meta_title: string;
  meta_description: string;
}

const EMPTY: EditorState = {
  title: "", slug: "", excerpt: "", content_markdown: "", cover_image_url: "",
  status: "draft", is_featured: false, category_id: null, tags: "",
  meta_title: "", meta_description: "",
};

export default function BlogAdmin() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<"posts" | "comments">("posts");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [preview, setPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: posts = [] } = useQuery({ queryKey: ["blog-manage"], queryFn: () => manageBlogPosts(token) });
  const { data: cats } = useQuery({ queryKey: ["blog-cats"], queryFn: listBlogCategories });
  const { data: tags } = useQuery({ queryKey: ["blog-tags"], queryFn: listBlogTags });
  const { data: comments = [] } = useQuery({ queryKey: ["blog-comments"], queryFn: () => manageBlogComments(token) });

  const categories = cats?.items ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ["blog-manage"] });

  async function ensureTagSlugs(names: string[]): Promise<string[]> {
    const existing = new Map((tags?.items ?? []).map((t: BlogTag) => [t.slug, t]));
    const slugs: string[] = [];
    for (const name of names) {
      const slug = slugify(name);
      if (!slug) continue;
      if (!existing.has(slug)) {
        try { await createBlogTag(token, { name, slug }); } catch { /* may already exist */ }
      }
      slugs.push(slug);
    }
    qc.invalidateQueries({ queryKey: ["blog-tags"] });
    return slugs;
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!editor) return;
      const tagNames = editor.tags.split(",").map((s) => s.trim()).filter(Boolean);
      const tag_slugs = await ensureTagSlugs(tagNames);
      const body = {
        title: editor.title,
        slug: editor.slug || slugify(editor.title),
        excerpt: editor.excerpt,
        content_markdown: editor.content_markdown,
        cover_image_url: editor.cover_image_url || null,
        status: editor.status,
        is_featured: editor.is_featured,
        category_id: editor.category_id,
        meta_title: editor.meta_title || null,
        meta_description: editor.meta_description || null,
        tag_slugs,
        published_at: editor.status === "published" ? new Date().toISOString() : null,
      };
      return editor.id ? updateBlogPost(token, editor.id, body) : createBlogPost(token, body);
    },
    onSuccess: () => {
      setEditor(null);
      refresh();
      toast.success("Post saved");
    },
    onError: (e) => toast.error("Could not save post", e),
  });

  const removePost = useMutation({
    mutationFn: (id: number) => deleteBlogPost(token, id),
    onSuccess: () => { refresh(); toast.success("Post deleted"); },
    onError: (e) => toast.error("Delete failed", e),
  });
  const removeComment = useMutation({
    mutationFn: (id: number) => deleteBlogComment(token, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["blog-comments"] }); toast.success("Comment deleted"); },
    onError: (e) => toast.error("Delete failed", e),
  });
  const addCategory = useMutation({
    mutationFn: (name: string) => createBlogCategory(token, { name, slug: slugify(name) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["blog-cats"] }); toast.success("Category added"); },
    onError: (e) => toast.error("Could not add category", e),
  });

  function openEditor(p?: BlogPost) {
    if (p) {
      setEditor({
        id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt || "",
        content_markdown: p.content_markdown || "", cover_image_url: p.cover_image_url || "",
        status: p.status, is_featured: p.is_featured, category_id: p.category_id ?? null,
        tags: p.tags.map((t) => t.name).join(", "),
        meta_title: p.meta_title || "", meta_description: p.meta_description || "",
      });
    } else setEditor({ ...EMPTY });
    setPreview(false);
  }

  async function insertImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !editor) return;
    try {
      const r = await uploadMedia(token, f);
      setEditor({ ...editor, content_markdown: `${editor.content_markdown}\n\n![image](${r.url})\n` });
      toast.success("Image inserted");
    } catch (ex) {
      toast.error("Upload failed", ex);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const cls = "w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm";

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading font-bold text-2xl">Blog</h1>
        <div className="flex gap-2 text-sm">
          <button onClick={() => setTab("posts")} className={`px-3 py-1.5 rounded-theme ${tab === "posts" ? "bg-primary text-white" : "border border-white/15"}`}>Posts</button>
          <button onClick={() => setTab("comments")} className={`px-3 py-1.5 rounded-theme ${tab === "comments" ? "bg-primary text-white" : "border border-white/15"}`}>Comments ({comments.length})</button>
        </div>
      </div>

      {tab === "posts" && !editor && (
        <>
          <button onClick={() => openEditor()} className="mb-5 rounded-theme bg-primary text-white px-4 py-2">+ New post</button>
          <div className="space-y-2">
            {posts.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-theme bg-surface border border-white/10 px-4 py-3">
                <div>
                  <span className="font-medium">{p.title}</span>{" "}
                  <span className="text-xs text-muted">· {p.status}{p.is_featured ? " · featured" : ""} · ♥{p.like_count} · 💬{p.comment_count}</span>
                </div>
                <div className="flex gap-2 text-sm">
                  <button onClick={() => openEditor(p)} className="rounded-theme border border-white/15 px-3 py-1">Edit</button>
                  <button onClick={() => removePost.mutate(p.id)} className="text-red-400 hover:text-red-300">Delete</button>
                </div>
              </div>
            ))}
            {posts.length === 0 && <p className="text-muted text-sm">No posts yet.</p>}
          </div>
        </>
      )}

      {tab === "posts" && editor && (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <input placeholder="Title" value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} className={cls} />
            <input placeholder="Slug (auto from title if blank)" value={editor.slug} onChange={(e) => setEditor({ ...editor, slug: e.target.value })} className={cls} />
          </div>
          <input placeholder="Excerpt" value={editor.excerpt} onChange={(e) => setEditor({ ...editor, excerpt: e.target.value })} className={cls} />
          <ImageInput label="Cover image" value={editor.cover_image_url} onChange={(v) => setEditor({ ...editor, cover_image_url: v })} />

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="flex gap-2">
              <select
                value={editor.category_id ?? ""}
                onChange={(e) => setEditor({ ...editor, category_id: e.target.value ? Number(e.target.value) : null })}
                className={cls}
              >
                <option value="">No category</option>
                {categories.map((c: BlogCategory) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button
                type="button"
                onClick={() => { const n = prompt("New category name"); if (n) addCategory.mutate(n); }}
                className="rounded-theme border border-white/15 px-3 text-sm whitespace-nowrap"
              >+ Cat</button>
            </div>
            <input placeholder="Tags (comma separated)" value={editor.tags} onChange={(e) => setEditor({ ...editor, tags: e.target.value })} className={cls} />
          </div>

          {/* Prominent publish-state banner — the most common reason a post "doesn't appear" */}
          <div className={`flex flex-wrap items-center gap-3 rounded-theme px-4 py-3 border ${
            editor.status === "published"
              ? "bg-green-500/10 border-green-500/30"
              : "bg-amber-500/10 border-amber-500/30"
          }`}>
            <span className="text-sm font-medium flex-1">
              {editor.status === "published"
                ? "✓ Published — visible on the site"
                : "⚠ Draft — not visible on the site until published"}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setEditor({ ...editor, status: "draft" })}
                className={`rounded-theme px-3 py-1.5 text-sm border transition-colors ${
                  editor.status === "draft"
                    ? "bg-amber-500/20 border-amber-400/60 text-amber-300"
                    : "border-white/15 text-muted hover:border-white/30"
                }`}
              >Draft</button>
              <button
                type="button"
                onClick={() => setEditor({ ...editor, status: "published" })}
                className={`rounded-theme px-3 py-1.5 text-sm border transition-colors ${
                  editor.status === "published"
                    ? "bg-green-500/20 border-green-400/60 text-green-300"
                    : "border-white/15 text-muted hover:border-green-400/40"
                }`}
              >Publish</button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">Featured <Toggle checked={editor.is_featured} onChange={(v) => setEditor({ ...editor, is_featured: v })} /></label>
            <button onClick={() => setPreview((v) => !v)} className="rounded-theme border border-white/15 px-3 py-1.5 text-sm">{preview ? "Edit" : "Preview"}</button>
            <button onClick={() => fileRef.current?.click()} className="rounded-theme border border-white/15 px-3 py-1.5 text-sm">Insert image</button>
            <input ref={fileRef} type="file" accept="image/*" onChange={insertImage} className="hidden" />
          </div>

          {preview ? (
            <div className="rounded-theme border border-white/10 p-4 min-h-[300px]">
              <MarkdownContent source={editor.content_markdown || "_Nothing to preview_"} />
            </div>
          ) : (
            <textarea
              placeholder="Write your article in Markdown…"
              value={editor.content_markdown}
              onChange={(e) => setEditor({ ...editor, content_markdown: e.target.value })}
              rows={18}
              spellCheck={false}
              className="w-full font-mono text-sm rounded-theme bg-bg border border-white/15 px-3 py-2"
            />
          )}

          <details className="text-sm">
            <summary className="cursor-pointer text-muted">SEO (optional)</summary>
            <div className="mt-2 space-y-2">
              <input placeholder="Meta title" value={editor.meta_title} onChange={(e) => setEditor({ ...editor, meta_title: e.target.value })} className={cls} />
              <textarea placeholder="Meta description" value={editor.meta_description} onChange={(e) => setEditor({ ...editor, meta_description: e.target.value })} rows={2} className={cls} />
            </div>
          </details>

          <div className="flex gap-2">
            <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-theme bg-primary text-white px-5 py-2.5 disabled:opacity-50">
              {save.isPending ? "Saving…" : "Save post"}
            </button>
            <button onClick={() => setEditor(null)} className="rounded-theme border border-white/15 px-5 py-2.5">Cancel</button>
          </div>
        </div>
      )}

      {tab === "comments" && (
        <div className="space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start justify-between rounded-theme bg-surface border border-white/10 px-4 py-3">
              <div>
                <span className="font-medium text-sm">{c.author_name}</span>
                <p className="text-sm text-muted mt-1 whitespace-pre-line">{c.content}</p>
              </div>
              <button onClick={() => removeComment.mutate(c.id)} className="text-red-400 hover:text-red-300 text-sm">Delete</button>
            </div>
          ))}
          {comments.length === 0 && <p className="text-muted text-sm">No comments yet.</p>}
        </div>
      )}
    </div>
  );
}
