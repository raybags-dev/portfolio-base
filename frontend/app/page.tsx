"use client";
import { useQuery } from "@tanstack/react-query";
import { getBootstrap } from "@/lib/api";
import type { Bootstrap } from "@/lib/types";
import ThemeProvider from "@/components/ThemeProvider";
import Navbar from "@/components/Navbar";
import RecommendationsCarousel from "@/components/RecommendationsCarousel";
import {
  About,
  Certifications,
  Education,
  Experience,
  Footer,
  Hero,
  Projects,
  Section,
  Services,
  Skills,
} from "@/components/sections";

// Maps a section key to its renderer. The homepage renders only the sections
// that are enabled (and not "contact", which has its own page), in order.
const RENDERERS: Record<string, (d: Bootstrap) => React.ReactNode> = {
  hero: (d) => <Hero data={d} />,
  about: (d) => <About data={d} />,
  skills: (d) => <Skills data={d} />,
  projects: (d) => <Projects data={d} />,
  platform: (d) => <Services data={d} />,
  recommendations: (d) =>
    d.recommendations.length > 0 ? (
      <Section id="recommendations" title="Testimonials">
        <RecommendationsCarousel
          items={d.recommendations}
          animated={d.theme.animations_enabled}
        />
      </Section>
    ) : null,
  experience: (d) => <Experience data={d} />,
  education: (d) => <Education data={d} />,
  certifications: (d) => <Certifications data={d} />,
};

export default function HomePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["bootstrap"],
    queryFn: getBootstrap,
  });

  if (isLoading) {
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="text-muted animate-pulse">Loading…</p>
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="min-h-screen grid place-items-center text-center px-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Backend unavailable</h1>
          <p className="text-muted">Could not reach the API. Start the backend, then refresh.</p>
        </div>
      </main>
    );
  }

  if (data.site_configuration.maintenance_mode) {
    return (
      <main className="min-h-screen grid place-items-center text-center px-6">
        <ThemeProvider theme={data.theme} />
        <div>
          <h1 className="text-3xl font-heading font-bold mb-2">
            {data.site_configuration.site_name}
          </h1>
          <p className="text-muted">We&apos;ll be back shortly.</p>
        </div>
      </main>
    );
  }

  const ordered = [...data.sections]
    .filter((s) => s.enabled && s.key !== "contact")
    .sort((a, b) => a.order - b.order);

  return (
    <>
      <ThemeProvider theme={data.theme} />
      <Navbar site={data.site_configuration} theme={data.theme} sections={data.sections} />
      <main>
        {ordered.map((s) => {
          const render = RENDERERS[s.key];
          return render ? <div key={s.key}>{render(data)}</div> : null;
        })}
      </main>
      <Footer data={data} />
    </>
  );
}
