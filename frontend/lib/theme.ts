import type { Theme } from "./types";

// Translate admin theme tokens + active mode into the CSS variables that
// Tailwind (and our components) consume. This is the ONLY place colours live.
export function themeToCssVars(
  theme: Theme,
  mode: "dark" | "light",
): Record<string, string> {
  const isDark = mode === "dark";
  return {
    "--color-primary": theme.primary_color,
    "--color-secondary": theme.secondary_color,
    "--color-accent": theme.accent_color,
    "--color-bg": isDark ? theme.background_dark : theme.background_light,
    "--color-surface": isDark
      ? lighten(theme.background_dark, 8)
      : darken(theme.background_light, 4),
    "--color-fg": isDark ? theme.text_dark : theme.text_light,
    "--color-muted": isDark
      ? withAlpha(theme.text_dark, 0.6)
      : withAlpha(theme.text_light, 0.6),
    "--radius": theme.border_radius,
    "--card-shadow": theme.card_shadow,
    "--font-family": theme.font_family,
    "--heading-font-family": theme.heading_font_family || theme.font_family,
    "--base-font-size": theme.base_font_size,
    "--spacing-unit": theme.spacing_unit,
  };
}

// --- tiny hex helpers (no deps) ---
function clamp(n: number) {
  return Math.max(0, Math.min(255, n));
}
function parseHex(hex: string): [number, number, number] | null {
  const m = hex.replace("#", "");
  if (m.length !== 6) return null;
  const n = parseInt(m, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((c) => clamp(Math.round(c)).toString(16).padStart(2, "0"))
    .join("")}`;
}
function lighten(hex: string, pct: number) {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const f = pct / 100;
  return toHex(...(rgb.map((c) => c + (255 - c) * f) as [number, number, number]));
}
function darken(hex: string, pct: number) {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const f = 1 - pct / 100;
  return toHex(...(rgb.map((c) => c * f) as [number, number, number]));
}
function withAlpha(hex: string, alpha: number) {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}
