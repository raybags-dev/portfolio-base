"use client";
import { useQuery } from "@tanstack/react-query";
import { getBootstrap } from "@/lib/api";
import ThemeProvider from "@/components/ThemeProvider";
import Nav from "@/components/Nav";
import {
  Hero,
  About,
  Skills,
  Projects,
  Services,
  Recommendations,
  Experience,
  Contact,
} from "@/components/sections";

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
          <p className="text-muted">
            Could not reach the API. Start the backend, then refresh.
          </p>
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

  return (
    <>
      <ThemeProvider theme={data.theme} />
      <Nav site={data.site_configuration} theme={data.theme} />
      <main>
        <Hero data={data} />
        <About data={data} />
        <Skills data={data} />
        <Projects data={data} />
        <Services data={data} />
        <Recommendations data={data} />
        <Experience data={data} />
        <Contact data={data} />
      </main>
    </>
  );
}
