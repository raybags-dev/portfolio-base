"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ApiError } from "@/lib/api";

type Level = "success" | "error" | "warning" | "info";
interface Toast {
  id: number;
  level: Level;
  title: string;
  detail?: string;
}

interface ToastApi {
  success: (title: string, detail?: string) => void;
  error: (title: string, err?: unknown) => void;
  warning: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

const STYLES: Record<Level, string> = {
  success: "border-green-500/40 bg-green-500/10 text-green-300",
  error: "border-red-500/40 bg-red-500/10 text-red-300",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  info: "border-primary/40 bg-primary/10 text-primary",
};
const ICON: Record<Level, string> = { success: "✓", error: "✕", warning: "!", info: "i" };

function describe(err: unknown): string | undefined {
  if (err instanceof ApiError) return `${err.message} (HTTP ${err.status})`;
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return undefined;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const push = useCallback((level: Level, title: string, detail?: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, level, title, detail }]);
    const ms = level === "error" ? 7000 : 3500;
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  const api: ToastApi = {
    success: (title, detail) => push("success", title, detail),
    error: (title, err) => push("error", title, describe(err)),
    warning: (title, detail) => push("warning", title, detail),
    info: (title, detail) => push("info", title, detail),
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80 max-w-[90vw]">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              className={`rounded-theme border px-4 py-3 shadow-card backdrop-blur ${STYLES[t.level]}`}
            >
              <div className="flex items-start gap-2">
                <span className="font-bold">{ICON[t.level]}</span>
                <div className="min-w-0">
                  <div className="font-medium text-sm">{t.title}</div>
                  {t.detail && <div className="text-xs opacity-80 mt-0.5 break-words">{t.detail}</div>}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // No-op fallback so components don't crash outside the provider.
    return {
      success: () => {},
      error: () => {},
      warning: () => {},
      info: () => {},
    };
  }
  return ctx;
}
