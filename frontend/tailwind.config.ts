import type { Config } from "tailwindcss";

// Colours/spacing/radius map to CSS variables injected at runtime from the
// admin theme tokens (see lib/theme.ts). Nothing is hardcoded here.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        secondary: "var(--color-secondary)",
        accent: "var(--color-accent)",
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        fg: "var(--color-fg)",
        muted: "var(--color-muted)",
      },
      borderRadius: {
        theme: "var(--radius)",
      },
      boxShadow: {
        card: "var(--card-shadow)",
      },
      fontFamily: {
        sans: "var(--font-family)",
        heading: "var(--heading-font-family)",
      },
    },
  },
  plugins: [],
};

export default config;
