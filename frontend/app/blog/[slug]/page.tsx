import type { Metadata } from "next";
import { API_BASE } from "@/lib/api";
import BlogArticle from "@/components/BlogArticle";

export const dynamic = "force-dynamic";

// Server-side metadata for SEO + social sharing (crawler-visible).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await fetch(`${API_BASE}/api/v1/blog/posts/${slug}`, { cache: "no-store" });
    if (!res.ok) return { title: "Article" };
    const p = await res.json();
    const title = p.meta_title || p.title;
    const description = p.meta_description || p.excerpt || undefined;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "article",
        images: p.cover_image_url ? [p.cover_image_url] : undefined,
      },
      twitter: { card: "summary_large_image", title, description },
    };
  } catch {
    return { title: "Article" };
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <BlogArticle slug={slug} />;
}
