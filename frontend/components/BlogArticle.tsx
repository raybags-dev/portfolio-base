"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getBlogPost, getBootstrap } from "@/lib/api";
import ThemeProvider from "@/components/ThemeProvider";
import Navbar from "@/components/Navbar";
import BackToTop from "@/components/BackToTop";
import MarkdownContent from "@/components/MarkdownContent";
import BlogInteractions from "@/components/BlogInteractions";
import { Footer } from "@/components/sections";

export default function BlogArticle({ slug }: { slug: string }) {
  const { data: boot } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const { data: post, isLoading, isError } = useQuery({
    queryKey: ["blog-post", slug],
    queryFn: () => getBlogPost(slug),
  });

  return (
    <>
      {boot && <ThemeProvider theme={boot.theme} />}
      {boot && <Navbar site={boot.site_configuration} theme={boot.theme} sections={boot.sections} />}
      <main className="container-x py-12 max-w-3xl">
        <Link href="/blog" className="text-sm text-primary hover:underline">← Back to blog</Link>

        {isLoading && <p className="text-muted animate-pulse mt-8">Loading…</p>}
        {(isError || (!isLoading && !post)) && (
          <p className="text-muted mt-8">Article not found.</p>
        )}

        {post && (
          <article className="mt-6">
            <div className="flex items-center gap-2 text-sm text-muted mb-3">
              {post.category && <span className="text-primary">{post.category.name}</span>}
              {post.reading_minutes && <span>· {post.reading_minutes} min read</span>}
              {post.published_at && <span>· {new Date(post.published_at).toLocaleDateString()}</span>}
            </div>
            <h1 className="text-3xl sm:text-4xl font-heading font-extrabold leading-tight mb-6">
              {post.title}
            </h1>
            {post.cover_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.cover_image_url}
                alt={post.title}
                className="rounded-theme w-full object-cover mb-8 shadow-card"
              />
            )}

            {post.content_markdown && <MarkdownContent source={post.content_markdown} />}

            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-8">
                {post.tags.map((t) => (
                  <Link
                    key={t.id}
                    href={`/blog?tag=${t.slug}`}
                    className="text-xs rounded-full border border-white/15 px-3 py-1 text-secondary hover:border-primary"
                  >
                    #{t.name}
                  </Link>
                ))}
              </div>
            )}

            <BlogInteractions slug={post.slug} title={post.title} initialLikes={post.like_count} />

            {post.related && post.related.length > 0 && (
              <section className="mt-14">
                <h3 className="font-heading font-semibold text-lg mb-4">Related articles</h3>
                <div className="grid sm:grid-cols-3 gap-4">
                  {post.related.map((r) => (
                    <Link
                      key={r.id}
                      href={`/blog/${r.slug}`}
                      className="rounded-theme bg-surface border border-white/10 p-4 hover:border-primary/50 transition-colors"
                    >
                      <div className="text-sm font-medium">{r.title}</div>
                      {r.reading_minutes && (
                        <div className="text-xs text-muted mt-1">{r.reading_minutes} min read</div>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </article>
        )}
      </main>
      {boot && <Footer data={boot} />}
      <BackToTop />
    </>
  );
}
