"use client";
import { useEffect } from "react";
import type { Theme } from "@/lib/types";
import { themeToCssVars } from "@/lib/theme";
import { useUI } from "@/lib/store";

/**
 * Applies admin theme tokens to the document as CSS variables and keeps them
 * in sync with the active (user-chosen or default) mode. Renders nothing.
 */
export default function ThemeProvider({ theme }: { theme: Theme }) {
  const mode = useUI((s) => s.mode);
  const active = mode ?? theme.default_mode;

  useEffect(() => {
    const vars = themeToCssVars(theme, active);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.dataset.mode = active;
  }, [theme, active]);

  return null;
}
