"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addBlogComment, likeBlogPost, listBlogComments } from "@/lib/api";

function ShareButtons({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? window.location.href : "";
  const enc = encodeURIComponent;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Share:</span>
      <a
        href={`https://twitter.com/intent/tweet?text=${enc(title)}&url=${enc(url)}`}
        target="_blank"
        rel="noreferrer"
        className="rounded-theme border border-white/15 px-3 py-1.5 hover:border-primary"
      >
        X
      </a>
      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`}
        target="_blank"
        rel="noreferrer"
        className="rounded-theme border border-white/15 px-3 py-1.5 hover:border-primary"
      >
        LinkedIn
      </a>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="rounded-theme border border-white/15 px-3 py-1.5 hover:border-primary"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}

export default function BlogInteractions({
  slug,
  title,
  initialLikes,
}: {
  slug: string;
  title: string;
  initialLikes: number;
}) {
  const qc = useQueryClient();
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);
  const [form, setForm] = useState({ author_name: "", content: "", website: "" });
  const [notice, setNotice] = useState<string | null>(null);

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", slug],
    queryFn: () => listBlogComments(slug),
  });

  const like = useMutation({
    mutationFn: () => likeBlogPost(slug),
    onSuccess: (r) => {
      setLikes(r.like_count);
      setLiked(true);
    },
  });

  const comment = useMutation({
    mutationFn: () => addBlogComment(slug, form),
    onSuccess: () => {
      setForm({ author_name: "", content: "", website: "" });
      setNotice("Comment posted.");
      qc.invalidateQueries({ queryKey: ["comments", slug] });
      setTimeout(() => setNotice(null), 2500);
    },
    onError: () => setNotice("Could not post comment."),
  });

  const input = "w-full rounded-theme bg-bg border border-white/15 px-3 py-2 outline-none focus:border-primary";

  return (
    <div className="mt-10 space-y-8">
      <div className="flex items-center justify-between border-y border-white/10 py-4">
        <button
          onClick={() => !liked && like.mutate()}
          disabled={liked || like.isPending}
          className={`flex items-center gap-2 rounded-theme border px-4 py-2 transition-colors ${
            liked ? "border-primary text-primary" : "border-white/15 hover:border-primary"
          }`}
        >
          {liked ? "♥" : "♡"} {likes}
        </button>
        <ShareButtons title={title} />
      </div>

      <div>
        <h3 className="font-heading font-semibold text-lg mb-4">
          Comments ({comments.length})
        </h3>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            comment.mutate();
          }}
          className="space-y-3 mb-6 rounded-theme bg-surface border border-white/10 p-4"
        >
          {notice && <p className="text-sm text-primary">{notice}</p>}
          <input
            required
            placeholder="Your name"
            value={form.author_name}
            onChange={(e) => setForm({ ...form, author_name: e.target.value })}
            className={input}
          />
          <textarea
            required
            placeholder="Add a comment…"
            rows={3}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            className={input}
          />
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            className="hidden"
          />
          <button
            type="submit"
            disabled={comment.isPending}
            className="rounded-theme bg-primary text-white px-4 py-2 disabled:opacity-50"
          >
            {comment.isPending ? "Posting…" : "Post comment"}
          </button>
        </form>

        <div className="space-y-4">
          {comments.map((c) => (
            <div key={c.id} className="rounded-theme bg-surface border border-white/10 p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.author_name}</span>
                <span className="text-xs text-muted">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-muted mt-1 whitespace-pre-line">{c.content}</p>
            </div>
          ))}
          {comments.length === 0 && (
            <p className="text-muted text-sm">Be the first to comment.</p>
          )}
        </div>
      </div>
    </div>
  );
}
