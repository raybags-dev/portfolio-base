"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getBootstrap, listBlogPosts } from "@/lib/api";
import type { BlogPost } from "@/lib/types";
import ThemeProvider from "@/components/ThemeProvider";
import Navbar from "@/components/Navbar";
import BackToTop from "@/components/BackToTop";
import { Footer } from "@/components/sections";

function PostCard({ p, serviceUrlMap }: { p: BlogPost; serviceUrlMap: Record<string, string> }) {
  const launchUrl = p.service_key ? serviceUrlMap[p.service_key] : null;
  return (
    <div className="group rounded-2xl bg-surface border border-white/10 shadow-card overflow-hidden hover:border-primary/50 transition-colors flex flex-col">
      <Link href={`/blog/${p.slug}`} className="flex flex-col flex-1">
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
      {launchUrl && (
        <div className="px-5 pb-4">
          <a
            href={launchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-theme bg-primary text-white text-xs font-medium px-3 py-1.5 hover:opacity-90 transition-opacity"
          >
            Launch project ↗
          </a>
        </div>
      )}
    </div>
  );
}

function FeaturedCard({ p, serviceUrlMap }: { p: BlogPost; serviceUrlMap: Record<string, string> }) {
  const launchUrl = p.service_key ? serviceUrlMap[p.service_key] : null;
  return (
    <div className="group w-full rounded-2xl bg-surface border border-primary/25 shadow-card overflow-hidden hover:border-primary/60 transition-all hover:shadow-[0_8px_40px_rgba(var(--color-primary-rgb,204,2,2),0.15)]">
    <Link
      href={`/blog/${p.slug}`}
      className="grid md:grid-cols-5"
    >
      {p.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.cover_image_url}
          alt={p.title}
          className="md:col-span-2 h-56 md:h-full w-full object-cover"
        />
      ) : (
        <div className="md:col-span-2 h-56 md:h-full bg-primary/10 flex items-center justify-center text-primary/30 text-6xl select-none">
          ✦
        </div>
      )}
      <div className="md:col-span-3 p-6 sm:p-8 lg:p-10 flex flex-col justify-center">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-primary mb-4">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          Featured
        </span>
        {p.category && (
          <span className="text-xs text-secondary mb-2">{p.category.name}</span>
        )}
        <h2 className="text-2xl sm:text-3xl font-heading font-bold group-hover:text-primary transition-colors leading-snug mb-3">
          {p.title}
        </h2>
        {p.excerpt && (
          <p className="text-muted line-clamp-3 mb-5 text-sm sm:text-base">{p.excerpt}</p>
        )}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted mt-auto pt-4 border-t border-white/5">
          {p.published_at && <span>{new Date(p.published_at).toLocaleDateString()}</span>}
          {p.reading_minutes && <span>{p.reading_minutes} min read</span>}
          <span>♥ {p.like_count}</span>
          <span>💬 {p.comment_count}</span>
          <span className="ml-auto text-primary text-sm group-hover:translate-x-1 transition-transform">Read →</span>
        </div>
        {launchUrl && (
          <div className="mt-4">
            <a
              href={launchUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-theme bg-primary text-white text-xs font-medium px-3 py-1.5 hover:opacity-90 transition-opacity"
            >
              Launch project ↗
            </a>
          </div>
        )}
      </div>
    </Link>
    </div>
  );
}

export default function BlogListPage() {
  const { data: boot } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(9);

  const serviceUrlMap = useMemo(() => {
    const m: Record<string, string> = {};
    (boot?.microservices ?? []).forEach((s) => { if (s.key && s.base_url) m[s.key] = s.base_url; });
    return m;
  }, [boot?.microservices]);

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
          <section className="mb-14">
            <FeaturedCard p={featuredItems[0]} serviceUrlMap={serviceUrlMap} />
            {featuredItems.length > 1 && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                {featuredItems.slice(1).map((p) => (
                  <PostCard key={p.id} p={p} serviceUrlMap={serviceUrlMap} />
                ))}
              </div>
            )}
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
                <PostCard key={p.id} p={p} serviceUrlMap={serviceUrlMap} />
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
