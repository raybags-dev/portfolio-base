"use client";
import { useState } from "react";

type Section = { id: string; title: string; icon: string };

const SECTIONS: Section[] = [
  { id: "overview",          title: "Platform Overview",          icon: "🏗️" },
  { id: "hotel-reviews",     title: "Hotel Review Analytics",     icon: "🏨" },
  { id: "job-analytics",     title: "Job Market Analytics",       icon: "💼" },
  { id: "universal-extractor", title: "Universal Data Extractor", icon: "🔍" },
  { id: "streams",           title: "Stream Pipeline",            icon: "⚡" },
  { id: "crawler-profiles",  title: "Crawler Profiles",           icon: "🎯" },
  { id: "admin",             title: "Admin Control Plane",        icon: "⚙️" },
  { id: "architecture",      title: "Architecture & Stack",       icon: "📐" },
];

function Badge({ label, color = "primary" }: { label: string; color?: string }) {
  const cls: Record<string, string> = {
    primary: "bg-primary/15 text-primary",
    green:   "bg-emerald-500/15 text-emerald-400",
    amber:   "bg-amber-500/15 text-amber-400",
    blue:    "bg-blue-500/15 text-blue-400",
    purple:  "bg-purple-500/15 text-purple-400",
  };
  return (
    <span className={`inline-flex items-center text-xs font-mono px-2 py-0.5 rounded ${cls[color] ?? cls.primary}`}>
      {label}
    </span>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-heading font-bold text-xl mt-8 mb-3 text-fg">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="font-semibold text-base mt-5 mb-2 text-fg">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted leading-relaxed mb-3">{children}</p>;
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-xs bg-white/8 border border-white/10 rounded px-1.5 py-0.5">{children}</code>;
}
function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="font-mono text-xs bg-bg border border-white/10 rounded-theme p-4 overflow-x-auto mb-4 leading-relaxed">
      {children}
    </pre>
  );
}
function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex gap-3 mb-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center mt-0.5">{n}</div>
      <div><span className="text-sm font-medium">{title}</span><p className="text-xs text-muted mt-0.5 leading-relaxed">{body}</p></div>
    </div>
  );
}
function TechStack({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2 mb-4">
      {items.map(t => <Badge key={t} label={t} color="blue" />)}
    </div>
  );
}

// ── Section content ───────────────────────────────────────────────────────────

function Overview() {
  return (
    <>
      <P>
        This platform is a full-stack data engineering portfolio — a live demonstration of production-grade crawlers,
        agentic AI pipelines, stream processing, and analytics. Every project on the site is a real, running system
        you can interact with directly.
      </P>
      <H3>Core principle</H3>
      <P>
        Each "Explore" project is not a mockup. The crawlers fetch real pages, the LLMs extract real data, the charts
        render real records, and the PDFs export real reports. The admin panel is a full CMS: every text, image, colour
        and section on the public site is editable without a redeploy.
      </P>
      <H3>Projects at a glance</H3>
      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        {[
          { name: "Hotel Review Analytics",   path: "/hotel-reviews",       desc: "AI-powered hotel data crawler + recharts analytics + blog generation" },
          { name: "Job Market Analytics",      path: "/job-analytics",       desc: "Job board crawler with salary/skills/location distribution charts" },
          { name: "Universal Data Extractor",  path: "/universal-extractor", desc: "Generic multi-source extractor — HTML, JSON API, CSV, Kaggle, paste" },
          { name: "Stream Pipeline",           path: "/streams",             desc: "Redis-backed SSE event bus with topics, alert rules and live inspector" },
        ].map(p => (
          <div key={p.name} className="rounded-theme bg-bg border border-white/10 p-3">
            <div className="font-medium text-sm mb-1">{p.name}</div>
            <div className="text-xs text-muted mb-1.5">{p.desc}</div>
            <Code>{p.path}</Code>
          </div>
        ))}
      </div>
      <H3>Rate limiting & access tokens</H3>
      <P>
        Each crawler project is free to run once per IP address. After the first run, a one-time access token (generated
        in <Code>/admin/tokens</Code>) is required. This prevents abuse without requiring accounts.
      </P>
    </>
  );
}

function HotelReviews() {
  return (
    <>
      <P>
        Crawls any hotel listing site, extracts structured data with a Playwright headless browser +
        Groq AI, computes analytics, generates a blog post, and exports to CSV / JSON / PDF.
      </P>
      <TechStack items={["Python 3.13", "FastAPI", "Playwright", "Groq AI (llama-3.3-70b)", "BeautifulSoup4", "SQLite/Postgres", "Next.js", "Recharts"]} />

      <H3>How a crawl run works</H3>
      <Step n={1} title="Configure" body="Enter a URL (Booking.com, TripAdvisor, etc.), a plain-English collection prompt ('extract hotel name, rating, price, location'), set max pages, and optionally choose a crawler profile for precise CSS selectors." />
      <Step n={2} title="Pre-actions" body="The engine executes any configured pre-actions (click cookie banners, fill search inputs, scroll to load lazy content) using Playwright's click/fill/scroll API." />
      <Step n={3} title="LLM selector planning" body="Groq AI reads a compressed snapshot of the page DOM and returns a JSON selector plan: which HTML tag + class extracts each field. These selectors are stored so healing can reference them." />
      <Step n={4} title="Extraction loop" body="For each page, the engine applies selectors. If a selector returns nothing or fails validation hints (regex, min-length, contains), the self-healing layer asks the LLM for an alternative selector and retries." />
      <Step n={5} title="Pagination" body="The engine follows pagination links automatically (auto-detect next-page, infinite scroll, or click-next — configurable per session)." />
      <Step n={6} title="Analytics" body="Once crawling finishes, the analytics engine computes price/rating distributions, top-ranked items, category breakdowns, and temporal trends. Results are stored as chart-ready JSON." />
      <Step n={7} title="Blog generation" body="A separate Groq call writes a full markdown article analysing the dataset — trends, outliers, recommendations. Saved as a draft blog post." />
      <Step n={8} title="Export" body="Download all records as JSON or CSV. Generate a full PDF report with matplotlib charts embedded via ReportLab (pie charts are rendered as perfect circles with equal-axis figures)." />

      <H3>Kaggle import</H3>
      <P>Instead of crawling, paste a Kaggle dataset slug (<Code>kaggle://owner/dataset-name</Code>). The engine downloads and parses CSV files, then runs the same analytics pipeline.</P>

      <H3>cURL import</H3>
      <P>Paste a raw cURL command (copy from browser DevTools → Network → Copy as cURL). The engine replays it with pagination offset injection, collecting paginated API results.</P>

      <H3>API endpoints</H3>
      <Pre>{`POST  /api/v1/hotel-reviews/sessions        create session
POST  /api/v1/hotel-reviews/sessions/{id}/run   start crawl
GET   /api/v1/hotel-reviews/sessions/{id}       poll status
GET   /api/v1/hotel-reviews/sessions/{id}/records  preview records
GET   /api/v1/hotel-reviews/sessions/{id}/export   CSV/JSON export
POST  /api/v1/hotel-reviews/sessions/{id}/summary  AI summary
POST  /api/v1/hotel-reviews/sessions/{id}/blog     generate blog post`}</Pre>
    </>
  );
}

function JobAnalytics() {
  return (
    <>
      <P>
        Identical pipeline to Hotel Reviews but tuned for job boards. Extracts title, company, location,
        salary range, required skills, seniority, and remote/hybrid/on-site from any job listing page.
      </P>
      <TechStack items={["Python 3.13", "FastAPI", "Playwright", "Groq AI", "SQLite/Postgres", "Next.js", "Recharts"]} />

      <H3>Analytics produced</H3>
      <div className="grid sm:grid-cols-2 gap-2 mb-4 text-sm">
        {["Skill demand (most-requested technologies)", "Salary distribution (min/max/avg ranges)", "Work arrangement breakdown (remote vs hybrid vs on-site)", "Seniority breakdown (junior/mid/senior/lead)", "Top hiring companies by listing count", "Top locations"].map(a => (
          <div key={a} className="flex gap-2 text-muted text-xs"><span className="text-primary">▹</span>{a}</div>
        ))}
      </div>

      <H3>Kaggle import</H3>
      <P>Supports the same <Code>kaggle://owner/dataset</Code> format. Useful for large historical datasets from Kaggle's job market collections.</P>

      <H3>Selector hints</H3>
      <P>In Advanced settings, add CSS selector hints per field (<Code>title → h2.job-title</Code>, <Code>salary → .salary-range</Code>). These are merged into the LLM plan, reducing hallucinated selectors on well-known sites.</P>
    </>
  );
}

function UniversalExtractor() {
  return (
    <>
      <P>
        The most general-purpose project. Point it at anything — a webpage, a REST/GraphQL API, a CSV URL,
        a Kaggle dataset, or paste raw data directly — and it auto-detects the format, extracts structured
        records, normalises them, and produces analytics + a PDF report.
      </P>
      <TechStack items={["Python 3.13", "FastAPI", "Playwright", "Groq AI", "ReportLab", "matplotlib", "SQLite/Postgres", "Next.js", "Recharts"]} />

      <H3>Source types</H3>
      <div className="space-y-2 mb-4">
        {[
          { type: "Auto-detect", desc: "Engine sniffs the URL — HTML page, JSON API response, redirect to CSV, or Kaggle slug." },
          { type: "Web Page (HTML)", desc: "Playwright renders the page fully (JS executed). LLM extracts all structured data it can find." },
          { type: "JSON API", desc: "Fetches the endpoint, flattens nested JSON, normalises arrays of objects into records." },
          { type: "CSV URL", desc: "Streams and parses a CSV file directly. Schema is inferred from headers." },
          { type: "Kaggle", desc: "kaggle://owner/dataset-slug — downloads the dataset ZIP and parses all CSV files inside." },
          { type: "Paste data", desc: "Paste raw CSV or JSON text directly into the input field." },
        ].map(s => (
          <div key={s.type} className="flex gap-3 text-sm">
            <Badge label={s.type} color="purple" />
            <span className="text-muted text-xs mt-0.5">{s.desc}</span>
          </div>
        ))}
      </div>

      <H3>PDF report</H3>
      <P>
        The PDF export uses <Code>matplotlib</Code> for chart images (bar, pie, line) rendered to PNG buffers,
        then assembled by ReportLab Platypus into a multi-page A4 document with a cover header, key metrics
        strip, statistical summary table, and full chart section.
      </P>
      <P>Pie charts use a square figure with <Code>ax.set_aspect("equal")</Code> to guarantee perfect circles regardless of page width.</P>

      <H3>Storage</H3>
      <P>Raw extracted records are stored in <Code>ude_records</Code>. Session metadata including the detected schema, analytics result, and progress log are on <Code>ude_sessions</Code>. Bulk exports are available via the Storage admin page.</P>
    </>
  );
}

function Streams() {
  return (
    <>
      <P>
        A real-time event bus built on Redis Pub/Sub, exposed to browsers via Server-Sent Events (SSE).
        Events are published by the crawler and analytics modules and can be monitored live.
      </P>
      <TechStack items={["FastAPI", "Redis", "SSE (Server-Sent Events)", "Next.js", "EventSource API"]} />

      <H3>Concepts</H3>
      <div className="space-y-2 mb-4">
        {[
          { term: "Topic",       def: "A named event channel. e.g. news.raw, crawl.progress, analytics.done" },
          { term: "Event",       def: "A JSON payload published to a topic. Last 500 events per topic are retained in SQLite." },
          { term: "Alert Rule",  def: "A threshold condition on a field (field_path operator threshold). Fires when an event matches." },
          { term: "Alert Fired", def: "A record of each alert firing, storing the triggering event snapshot." },
          { term: "SSE feed",    def: "GET /api/v1/streams/sse — a live event stream. Filter by ?topic=name. Reconnects automatically." },
        ].map(r => (
          <div key={r.term} className="flex gap-3 text-sm">
            <span className="shrink-0 font-mono text-primary text-xs w-24 mt-0.5">{r.term}</span>
            <span className="text-muted text-xs">{r.def}</span>
          </div>
        ))}
      </div>

      <H3>Publishing events</H3>
      <Pre>{`POST /api/v1/streams/publish
{ "topic": "crawl.progress", "payload": { "session_id": 42, "msg": "Page 3 done" } }`}</Pre>

      <H3>Live inspector UI</H3>
      <P>The <Code>/streams</Code> page shows a live event feed in the left panel and a detail inspector on the right. Filter by topic using the chips. The connection indicator turns green when the SSE socket is open.</P>
    </>
  );
}

function CrawlerProfiles() {
  return (
    <>
      <P>
        Named extraction configs that override the LLM's auto-generated selectors with hand-crafted CSS or
        regexp anchors. Use them when the LLM struggles with a specific site or when you want reproducible,
        deterministic extraction.
      </P>

      <H3>When to use a profile</H3>
      <div className="space-y-1 mb-4">
        {[
          "The LLM picks inconsistent selectors across runs on the same site",
          "You want to extract a specific non-obvious field the LLM ignores",
          "The site uses shadow DOM, iframes or lazy-loaded content",
          "You need to loop over a paginated list of items in a container",
        ].map(r => (
          <div key={r} className="flex gap-2 text-xs text-muted"><span className="text-primary">▹</span>{r}</div>
        ))}
      </div>

      <H3>Field config schema</H3>
      <Pre>{`{
  "fields": {
    "title": {
      "selector_type": "css",       // "css" or "regexp"
      "selector": "h2.listing-title",
      "hint_regex": ".+",           // optional — value must match this
      "hint_contains": null,        // optional — value must contain this
      "hint_min_len": 3,            // optional — minimum character count
      "required": true
    },
    "price": {
      "selector_type": "regexp",
      "selector": "\\\\$[0-9,]+",   // used as hint for the LLM
      "required": false
    }
  },
  "loop": {
    "enabled": true,
    "container_selector": ".hotel-card",   // parent wrapping each item
    "item_selector": ".hotel-item"         // each repeated element
  }
}`}</Pre>

      <H3>How it integrates</H3>
      <P>When a profile is selected in Hotel Reviews or Job Analytics Advanced Settings, the backend loads it at crawl start and applies it:</P>
      <div className="space-y-1 mb-4 text-xs text-muted">
        <div className="flex gap-2"><Code>css selectors</Code><span>→ field_map (direct JS querySelector extraction, bypasses LLM)</span></div>
        <div className="flex gap-2"><Code>regexp selectors</Code><span>→ selector_hints (given to LLM as regex validation hints)</span></div>
        <div className="flex gap-2"><Code>loop.container + item</Code><span>→ directive mode (extracts every matching element in one JS pass)</span></div>
      </div>
    </>
  );
}

function AdminDocs() {
  return (
    <>
      <P>The admin panel at <Code>/admin</Code> is a full CMS. Every public-facing element is editable without touching code or redeploying.</P>

      <H3>Content pages</H3>
      <div className="grid sm:grid-cols-2 gap-2 mb-4">
        {[
          { page: "Site & Contact",  desc: "Site name, tagline, SEO meta, contact email, phone, address, Google Maps embed" },
          { page: "Theme",           desc: "Primary/secondary/background colours, border radius, font, animation toggle" },
          { page: "Hero",            desc: "Name, title, subtitle, CTA button, background image / gradient / colour, avatar" },
          { page: "About",           desc: "Biography, description, profile image, highlight bullet points" },
          { page: "Skills",          desc: "Skill cards grouped by category — name, subheading, tech list, GitHub link, description modal" },
          { page: "Experience",      desc: "Timeline entries — company, role, dates, bullets" },
          { page: "Blog",            desc: "Create/edit posts, set featured image, publish/draft toggle, SEO slug" },
          { page: "Testimonials",    desc: "Recommendation cards — name, role, company, avatar, text" },
          { page: "Feature Flags",   desc: "Enable/disable entire modules without redeploy (hotel reviews, job analytics, etc.)" },
          { page: "Access Tokens",   desc: "Generate one-time tokens for second-run access to crawler projects" },
          { page: "Crawler Profiles", desc: "Named CSS/regexp extraction configs applied at crawl time" },
        ].map(r => (
          <div key={r.page} className="rounded-theme bg-bg border border-white/10 p-2.5">
            <div className="text-sm font-medium mb-0.5">{r.page}</div>
            <div className="text-xs text-muted">{r.desc}</div>
          </div>
        ))}
      </div>

      <H3>Feature flags</H3>
      <P>All modules (hotel reviews, job analytics, universal extractor, streams, blog, news ticker, etc.) are controlled by feature flags. Disabling a flag hides the module from the site and disables its API routes — no code change needed.</P>

      <H3>Sections & Tabs</H3>
      <P>Every section on the single-page homepage (About, Skills, Experience, Projects, etc.) can be individually shown/hidden and removed from the navigation bar. Reordering is done via the <Code>order</Code> field.</P>

      <H3>Access control</H3>
      <P>The admin is protected by JWT authentication (access + refresh tokens). Tokens are stored in <Code>localStorage</Code> via Zustand persist — they survive browser refreshes. Session stays active until the token expires or you click Log out.</P>
    </>
  );
}

function Architecture() {
  return (
    <>
      <H3>Backend</H3>
      <TechStack items={["Python 3.13", "FastAPI", "async SQLAlchemy 2.0", "Alembic", "Pydantic v2", "Groq AI (llama-3.3-70b)", "Playwright (Chromium)", "BeautifulSoup4", "matplotlib", "ReportLab", "Redis"]} />
      <Pre>{`backend/
  app/
    api/v1/endpoints/    # REST routers (auth, content, admin, modules)
    models/              # SQLAlchemy ORM (content.py, platform.py, portfolio.py)
    schemas/             # Pydantic request/response shapes
    modules/
      hotel_reviews/     # Playwright engine, analytics, blog gen
      jobs/              # Job market crawler + analytics
      universal_extractor/ # Generic extractor + PDF report
      crawlers/          # Shared self-healing crawl workflow
      streams/           # Redis SSE event bus
      agents/            # LLM provider + AgentWorkflow base class
    services/
      feature_flags.py   # Control plane for module on/off switches
    seed.py              # Idempotent database bootstrap`}</Pre>

      <H3>Frontend</H3>
      <TechStack items={["Next.js 16 (App Router)", "TypeScript", "Tailwind CSS v3", "Framer Motion", "React Query (TanStack)", "Zustand", "Recharts", "Monaco-style field inputs"]} />
      <Pre>{`frontend/
  app/
    page.tsx             # Single-page portfolio (Hero, About, Skills, Projects…)
    admin/               # Full CMS — every section has its own admin page
    hotel-reviews/       # Hotel crawl + analytics UI
    job-analytics/       # Job crawl + analytics UI
    universal-extractor/ # UDE multi-source UI
    streams/             # Live SSE event inspector
    blog/                # Blog listing + individual post pages
    contact/             # Contact form + WhatsApp CTA
  components/
    sections.tsx         # All homepage section components (Hero, About, Skills…)
    Navbar.tsx           # Responsive navigation with smooth-scroll
  lib/
    api.ts               # All API client functions
    types.ts             # TypeScript interfaces mirroring backend schemas
    store.ts             # Zustand stores (auth, UI mode, cookie consent)`}</Pre>

      <H3>Database</H3>
      <P>SQLite locally (zero-config), Supabase Postgres in production. Alembic manages migrations. The switch is a single <Code>DATABASE_URL</Code> env var.</P>

      <H3>Deploy</H3>
      <Pre>{`# Run from repo root — passes ruff + pytest + alembic upgrade before pushing
./scripts/ship.sh "your commit message"`}</Pre>
      <P>CI (GitHub Actions) runs the same gate: ruff lint → pytest → alembic upgrade head.</P>
    </>
  );
}

const CONTENT: Record<string, React.ReactNode> = {
  "overview":           <Overview />,
  "hotel-reviews":      <HotelReviews />,
  "job-analytics":      <JobAnalytics />,
  "universal-extractor":<UniversalExtractor />,
  "streams":            <Streams />,
  "crawler-profiles":   <CrawlerProfiles />,
  "admin":              <AdminDocs />,
  "architecture":       <Architecture />,
};

export default function DocsPage() {
  const [active, setActive] = useState("overview");
  const section = SECTIONS.find(s => s.id === active)!;

  return (
    <div className="flex gap-0 h-[calc(100vh-4rem)] -m-8">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r border-white/10 p-4 overflow-y-auto">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">Documentation</p>
        <nav className="space-y-0.5">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-theme text-sm transition-colors ${
                active === s.id ? "bg-primary text-white" : "text-muted hover:bg-white/5 hover:text-fg"
              }`}
            >
              <span>{s.icon}</span>
              <span>{s.title}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8 max-w-3xl">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">{section.icon}</span>
          <h1 className="font-heading font-bold text-2xl">{section.title}</h1>
        </div>
        <div className="border-b border-white/10 mb-6 pb-1" />
        {CONTENT[active]}
      </main>
    </div>
  );
}
