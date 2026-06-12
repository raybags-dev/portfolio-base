"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import CookieBanner from "@/components/CookieBanner";
import NewsTicker from "@/components/NewsTicker";

export default function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        {/* Extra padding at the bottom so the ticker doesn't cover content */}
        <div style={{ paddingBottom: "32px" }}>{children}</div>
        <CookieBanner />
        <NewsTicker />
      </ToastProvider>
    </QueryClientProvider>
  );
}
