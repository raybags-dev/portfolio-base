"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getBootstrap, listBlogPosts } from "@/lib/api";
import type { BlogPost } from "@/lib/types";
import ThemeProvider from "@/components/ThemeProvider";
import Navbar from "@/components/Navbar";
import BackToTop from "@/components/BackToTop";
import { Footer } from "@/components/sections";

function PostCard({ p }: { p: BlogPost }) {
  return (
    <Link
      href={`/blog/${p.slug}`}
      className="group rounded-2xl bg-surface border border-white/10 shadow-card overflow-hidden hover:border-primary/50 transition-colors flex flex-col"
    >
      {p.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.cover_image_url} alt={p.title} className="h-44 w-full object-cover" />
      )}
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          {p.category && <span className="text-primary">{p.category.name}</span>}
          {p.reading_minutes && <span>· {p.reading_minutes} min read</span>}
        </div>
        <h3 className="font-heading font-semibold group-hover:text-primary transition-colors">
          {p.title}
        </h3>
        {p.excerpt && <p className="text-sm text-muted mt-2 line-clamp-3 flex-1">{p.excerpt}</p>}
        <div className="flex items-center gap-4 text-xs text-muted mt-4">
          <span>♥ {p.like_count}</span>
          <span>💬 {p.comment_count}</span>
          {p.published_at && <span>{new Date(p.published_at).toLocaleDateString()}</span>}
        </div>
      </div>
    </Link>
  );
}

export default function BlogListPage() {
  const { data: boot } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(9);

  const { data: featured } = useQuery({
    queryKey: ["blog-featured"],
    queryFn: () => listBlogPosts({ featured: true, limit: 3 }),
  });
  const { data: posts, isLoading } = useQuery({
    queryKey: ["blog-list", search, limit],
    queryFn: () => listBlogPosts({ q: search || undefined, limit }),
  });

  const items = posts?.items ?? [];
  const total = posts?.total ?? 0;
  const featuredItems = !search ? (featured?.items ?? []) : [];

  return (
    <>
      {boot && <ThemeProvider theme={boot.theme} />}
      {boot && <Navbar site={boot.site_configuration} theme={boot.theme} sections={boot.sections} />}
      <main className="container-x py-14">
        <h1 className="text-3xl sm:text-4xl font-heading font-bold mb-2">Blog</h1>
        <p className="text-muted mb-8 max-w-2xl">
          Technical articles and engineering notes.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q);
            setLimit(9);
          }}
          className="mb-10 flex gap-2 max-w-md"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search articles…"
            className="flex-1 rounded-theme bg-surface border border-white/15 px-4 py-2 outline-none focus:border-primary"
          />
          <button className="rounded-theme bg-primary text-white px-4 py-2">Search</button>
        </form>

        {featuredItems.length > 0 && (
          <section className="mb-12">
            <h2 className="font-heading font-semibold text-lg mb-4 text-secondary">Featured</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredItems.map((p) => (
                <PostCard key={p.id} p={p} />
              ))}
            </div>
          </section>
        )}

        {isLoading ? (
          <p className="text-muted animate-pulse">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-muted">No articles found.</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((p) => (
                <PostCard key={p.id} p={p} />
              ))}
            </div>
            {items.length < total && (
              <div className="text-center mt-10">
                <button
                  onClick={() => setLimit((l) => l + 9)}
                  className="rounded-theme border border-white/15 px-6 py-2.5 hover:border-primary"
                >
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </main>
      {boot && <Footer data={boot} />}
      <BackToTop />
    </>
  );
}
