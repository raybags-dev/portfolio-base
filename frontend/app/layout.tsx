import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import { getBootstrap } from "@/lib/api";
import MaintenanceGate from "@/components/MaintenanceGate";
import ChatWidget from "@/components/ChatWidget";

// Best-effort dynamic metadata from the editable site configuration.
export async function generateMetadata(): Promise<Metadata> {
  try {
    const b = await getBootstrap();
    const site = b.site_configuration;
    return {
      title: site.meta_title || site.site_name,
      description: site.meta_description || site.tagline || undefined,
      keywords: site.meta_keywords || undefined,
      openGraph: {
        title: site.meta_title || site.site_name,
        description: site.meta_description || site.tagline || undefined,
        images: site.og_image_url ? [site.og_image_url] : undefined,
      },
      icons: site.favicon_url ? { icon: site.favicon_url } : undefined,
    };
  } catch {
    return { title: "Portfolio", description: "Data Engineering Platform" };
  }
}

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <MaintenanceGate>{children}</MaintenanceGate>
          <ChatWidget />
        </Providers>
      </body>
    </html>
  );
}
