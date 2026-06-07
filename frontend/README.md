# Frontend — Raybags Data Platform

Next.js (App Router) + TypeScript + Tailwind + Framer Motion + React Query +
Zustand. **100% data-driven** — every section, colour, font, image, and which
modules appear is read from the backend at runtime. Nothing is hardcoded.

## Run

```bash
cp .env.example .env.local        # point NEXT_PUBLIC_API_BASE_URL at the backend
npm install
npm run dev                       # http://localhost:3000
```

The backend must be running (see repo root README). The homepage fetches
`GET /api/v1/public/bootstrap` and renders from it; if the API is down it shows
a friendly fallback.

## Build

```bash
npm run build && npm start
```

## Structure

```
app/
  layout.tsx        root layout + dynamic SEO metadata from site config
  page.tsx          public homepage (client, react-query bootstrap)
  admin/            admin panel (login-gated)
    login/          sign in
    page.tsx        dashboard
    flags/          feature-flag toggles
    theme/          live theme editor (colours/mode/radius/motion)
    hero/           hero editor
    skills/         skills CRUD
components/
  ThemeProvider     injects theme tokens as CSS variables
  Nav, sections     data-driven UI
lib/
  api.ts            typed fetch client
  types.ts          contract types
  store.ts          zustand (theme mode + auth token, persisted)
  theme.ts          theme tokens → CSS variables
```

## Theming

Colours/spacing/radius are CSS variables set at runtime by `ThemeProvider` from
the admin `theme` tokens; `tailwind.config.ts` maps Tailwind utilities
(`bg-primary`, `text-fg`, `rounded-theme`, …) to those variables. Dark is the
default mode; users can toggle, and the choice persists.

## Admin

Sign in at `/admin/login` with the seeded admin (`admin@raybags.com` by
default). Feature flags, theme, hero, and skills are fully wired; other entity
editors plug into the same pattern (the backend CRUD already exists).
