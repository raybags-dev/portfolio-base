// Typed API client for the FastAPI backend.
import type {
  About,
  Bootstrap,
  FeatureFlag,
  Skill,
  Theme,
  Hero,
  TokenResponse,
  MediaAsset,
  LogEntry,
  ActivityLogEntry,
  AuditLogEntry,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

const V1 = `${API_BASE}/api/v1`;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  opts: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = opts;
  const res = await fetch(`${V1}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---- public ----
export const getBootstrap = () => request<Bootstrap>("/public/bootstrap");

// ---- auth ----
export const login = (email: string, password: string) =>
  request<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const getMe = (token: string) =>
  request<{ id: number; email: string; full_name: string | null; is_superuser: boolean; permissions: string[] }>(
    "/auth/me",
    { token },
  );

export const updateProfile = (token: string, body: { full_name?: string; email?: string }) =>
  request("/auth/me", { method: "PUT", token, body: JSON.stringify(body) });

export const changePassword = (
  token: string,
  body: {
    current_password: string;
    new_password: string;
    confirm_password: string;
    auth_token?: string;
  },
) => request("/auth/change-password", { method: "POST", token, body: JSON.stringify(body) });

// ---- feature flags (admin) ----
export const listFlags = (token: string) =>
  request<FeatureFlag[]>("/feature-flags", { token });

export const toggleFlag = (token: string, key: string) =>
  request<FeatureFlag>(`/feature-flags/${key}/toggle`, {
    method: "POST",
    token,
  });

export const updateFlag = (
  token: string,
  key: string,
  body: Partial<FeatureFlag>,
) =>
  request<FeatureFlag>(`/feature-flags/${key}`, {
    method: "PUT",
    token,
    body: JSON.stringify(body),
  });

// ---- theme / hero / site (admin singletons) ----
export const updateTheme = (token: string, body: Partial<Theme>) =>
  request<Theme>("/content/theme", {
    method: "PUT",
    token,
    body: JSON.stringify(body),
  });

export const updateSiteConfig = (token: string, body: Record<string, unknown>) =>
  request("/content/site-configuration", {
    method: "PUT",
    token,
    body: JSON.stringify(body),
  });

export const updateHero = (token: string, body: Partial<Hero>) =>
  request<Hero>("/content/hero", {
    method: "PUT",
    token,
    body: JSON.stringify(body),
  });

export const updateAbout = (token: string, body: Record<string, unknown>) =>
  request("/content/about", { method: "PUT", token, body: JSON.stringify(body) });

// ---- skills CRUD (admin) ----
interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
export const listSkills = () => request<Page<Skill>>("/skills");
export const createSkill = (token: string, body: Partial<Skill>) =>
  request<Skill>("/skills", { method: "POST", token, body: JSON.stringify(body) });
export const updateSkill = (token: string, id: number, body: Partial<Skill>) =>
  request<Skill>(`/skills/${id}`, {
    method: "PUT",
    token,
    body: JSON.stringify(body),
  });
export const deleteSkill = (token: string, id: number) =>
  request<void>(`/skills/${id}`, { method: "DELETE", token });

// ---- modules (agents / crawlers / scheduler) ----
// These are flag-gated server-side (404 when the module is disabled). The UI
// surfaces that as a "module disabled" state.

// agents
export const listAgentWorkflows = (token: string) =>
  request<string[]>("/agents/workflows", { token });
export const runAgent = (
  token: string,
  body: { workflow: string; input: Record<string, unknown>; title?: string },
) => request<Record<string, unknown>>("/agents/run", {
  method: "POST", token, body: JSON.stringify(body),
});
export const listAgentTasks = (token: string) =>
  request<Record<string, unknown>[]>("/agents/tasks", { token });
export const getAgentTask = (token: string, id: number) =>
  request<Record<string, unknown>>(`/agents/tasks/${id}`, { token });

// crawlers
export const listCrawlerJobs = (token: string) =>
  request<Record<string, unknown>[]>("/crawlers/jobs", { token });
export const createCrawlerJob = (token: string, body: Record<string, unknown>) =>
  request<Record<string, unknown>>("/crawlers/jobs", {
    method: "POST", token, body: JSON.stringify(body),
  });
export const runCrawlerJob = (token: string, id: number) =>
  request<Record<string, unknown>>(`/crawlers/jobs/${id}/run`, {
    method: "POST", token,
  });
export const crawlerJobLogs = (token: string, id: number) =>
  request<Record<string, unknown>[]>(`/crawlers/jobs/${id}/logs`, { token });
export const crawlerJobResults = (token: string, id: number) =>
  request<Record<string, unknown>[]>(`/crawlers/jobs/${id}/results`, { token });

// scheduler
export const listSchedulerTasks = (token: string) =>
  request<string[]>("/scheduler/tasks", { token });
export const listSchedulerJobs = (token: string) =>
  request<Record<string, unknown>[]>("/scheduler/jobs", { token });
export const createSchedulerJob = (token: string, body: Record<string, unknown>) =>
  request<Record<string, unknown>>("/scheduler/jobs", {
    method: "POST", token, body: JSON.stringify(body),
  });
export const updateSchedulerJob = (
  token: string, id: number, body: Record<string, unknown>,
) => request<Record<string, unknown>>(`/scheduler/jobs/${id}`, {
  method: "PUT", token, body: JSON.stringify(body),
});
export const runSchedulerJob = (token: string, id: number) =>
  request<Record<string, unknown>>(`/scheduler/jobs/${id}/run`, {
    method: "POST", token,
  });
export const schedulerTick = (token: string) =>
  request<Record<string, unknown>>("/scheduler/tick", { method: "POST", token });

// ---- media upload (multipart; browser sets the boundary) ----
export async function uploadMedia(
  token: string,
  file: File,
): Promise<{ id: number; url: string; content_type: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${V1}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, typeof detail === "string" ? detail : "Upload failed");
  }
  return res.json();
}

// ---- sections ----
export const listSections = () =>
  request<import("./types").Section[]>("/sections");
export const updateSection = (
  token: string,
  key: string,
  body: Record<string, unknown>,
) => request("/sections/" + key, {
  method: "PUT", token, body: JSON.stringify(body),
});

// ---- contact (public) ----
export const getContactChallenge = () =>
  request<{ token: string; question: string }>("/contact/challenge");
export const submitContact = (body: {
  name: string;
  email: string;
  subject?: string;
  message: string;
  challenge_token: string;
  challenge_answer: number;
  website?: string;
}) => request<{ ok: boolean; detail: string }>("/contact", {
  method: "POST", body: JSON.stringify(body),
});
export const listContactMessages = (token: string) =>
  request<Record<string, unknown>[]>("/contact/messages", { token });

// ---- blog (public) ----
import type { BlogComment, BlogPost } from "./types";

interface Paged<T> { items: T[]; total: number; limit: number; offset: number }

export const listBlogPosts = (params: {
  limit?: number; offset?: number; q?: string; category?: string; tag?: string; featured?: boolean;
} = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  });
  const s = qs.toString();
  return request<Paged<BlogPost>>(`/blog/posts${s ? `?${s}` : ""}`);
};
export const getBlogPost = (slug: string) => request<BlogPost>(`/blog/posts/${slug}`);
export const likeBlogPost = (slug: string) =>
  request<{ like_count: number; liked: boolean }>(`/blog/posts/${slug}/like`, { method: "POST" });
export const listBlogComments = (slug: string) =>
  request<BlogComment[]>(`/blog/posts/${slug}/comments`);
export const addBlogComment = (slug: string, body: {
  author_name: string; author_email?: string; content: string; website?: string;
}) => request<BlogComment>(`/blog/posts/${slug}/comments`, { method: "POST", body: JSON.stringify(body) });

// ---- blog (admin) ----
export const manageBlogPosts = (token: string) =>
  request<BlogPost[]>("/blog/manage/posts", { token });
export const createBlogPost = (token: string, body: Record<string, unknown>) =>
  request<BlogPost>("/blog/posts", { method: "POST", token, body: JSON.stringify(body) });
export const updateBlogPost = (token: string, id: number, body: Record<string, unknown>) =>
  request<BlogPost>(`/blog/posts/${id}`, { method: "PUT", token, body: JSON.stringify(body) });
export const deleteBlogPost = (token: string, id: number) =>
  request<void>(`/blog/posts/${id}`, { method: "DELETE", token });
export const manageBlogComments = (token: string) =>
  request<(BlogComment & { post_id: number })[]>("/blog/manage/comments", { token });
export const deleteBlogComment = (token: string, id: number) =>
  request<void>(`/blog/manage/comments/${id}`, { method: "DELETE", token });

export const listBlogCategories = () =>
  request<Paged<import("./types").BlogCategory>>("/blog/categories");
export const createBlogCategory = (token: string, body: { name: string; slug: string }) =>
  request<import("./types").BlogCategory>("/blog/categories", {
    method: "POST", token, body: JSON.stringify(body),
  });
export const listBlogTags = () =>
  request<Paged<import("./types").BlogTag>>("/blog/tags");
export const createBlogTag = (token: string, body: { name: string; slug: string }) =>
  request<import("./types").BlogTag>("/blog/tags", {
    method: "POST", token, body: JSON.stringify(body),
  });

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ---- singleton resets (admin) ----
export const resetTheme = (token: string) =>
  request<Theme>("/content/theme/reset", { method: "POST", token });
export const resetHero = (token: string) =>
  request<Hero>("/content/hero/reset", { method: "POST", token });
export const resetSiteConfig = (token: string) =>
  request("/content/site-configuration/reset", { method: "POST", token });
export const resetAbout = (token: string) =>
  request<About>("/content/about/reset", { method: "POST", token });
export const resetResume = (token: string) =>
  request("/content/resume/reset", { method: "POST", token });
export const resetSections = (token: string) =>
  request("/sections/reset", { method: "POST", token });
export const resetFlags = (token: string) =>
  request("/feature-flags/reset", { method: "POST", token });

// ---- media library (admin) ----
export const listMedia = (token: string) =>
  request<MediaAsset[]>("/media", { token });

// ---- live logs (admin) ----
export const getLogs = (token: string, limit = 200, level?: string) => {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (level) qs.set("level", level);
  return request<LogEntry[]>(`/logs?${qs}`, { token });
};

export const getActivityLogs = (token: string, limit = 200, level?: string, category?: string) => {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (level) qs.set("level", level);
  if (category) qs.set("category", category);
  return request<ActivityLogEntry[]>(`/activity-logs?${qs}`, { token });
};

export const getAuditLogs = (token: string, limit = 200, action?: string, entity?: string) => {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (action) qs.set("action", action);
  if (entity) qs.set("entity", entity);
  return request<AuditLogEntry[]>(`/audit-logs?${qs}`, { token });
};

// ---- generic collection CRUD (experience / education / certifications) ----
interface PageT<T> { items: T[]; total: number }
export const listCollection = <T = Record<string, unknown>>(path: string) =>
  request<PageT<T>>(path);
export const createItem = (token: string, path: string, body: Record<string, unknown>) =>
  request(path, { method: "POST", token, body: JSON.stringify(body) });
export const updateItem = (token: string, path: string, id: number, body: Record<string, unknown>) =>
  request(`${path}/${id}`, { method: "PUT", token, body: JSON.stringify(body) });
export const deleteItem = (token: string, path: string, id: number) =>
  request<void>(`${path}/${id}`, { method: "DELETE", token });

// ---- hotel review analytics (crawl sessions) ----
export interface CrawlSession {
  id: number;
  name: string;
  target_url: string;
  collection_prompt: string;
  analytics_spec: Record<string, unknown>;
  max_pages: number;
  status: "pending" | "running" | "done" | "failed";
  progress: { log?: string[]; last_message?: string; records_collected?: number; pages_crawled?: number; current_url?: string; charts_computed?: number } | null;
  analytics_result: AnalyticsResult | null;
  error: string | null;
  created_at: string;
}

export interface ChartData {
  id: string;
  title: string;
  type: "bar" | "pie" | "line";
  data: Record<string, unknown>[];
}

export interface AnalyticsResult {
  total_records?: number;
  fields_found?: string[];
  summary_stats?: Record<string, { min: number; max: number; avg: number; count: number }>;
  high_rated_count?: number;
  charts?: ChartData[];
  error?: string;
}

export const listCrawlSessions = () =>
  request<CrawlSession[]>("/hotel-reviews/sessions");

export interface RunContactInfo {
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
}

export const createCrawlSession = (body: {
  name: string;
  target_url: string;
  collection_prompt: string;
  analytics_spec?: Record<string, unknown>;
  max_pages?: number;
  session_contact?: RunContactInfo;
}) =>
  request<CrawlSession>("/hotel-reviews/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const listGuestSessions = (token: string) =>
  request<CrawlSession[]>("/hotel-reviews/guest-sessions", { token });

export const deleteGuestSession = (token: string, id: number) =>
  request<void>(`/hotel-reviews/sessions/${id}`, { method: "DELETE", token });

export const getCrawlSession = (id: number) =>
  request<CrawlSession>(`/hotel-reviews/sessions/${id}`);

export const runCrawlSession = (id: number, appToken?: string) =>
  request<{ message: string; session_id: number }>(
    `/hotel-reviews/sessions/${id}/run`,
    {
      method: "POST",
      headers: appToken ? { "X-App-Token": appToken } : undefined,
    }
  );

export const updateCrawlSession = (id: number, patch: Partial<{ analytics_spec: Record<string, unknown> }>) =>
  request<CrawlSession>(`/hotel-reviews/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

export const deleteCrawlSession = (id: number) =>
  request<void>(`/hotel-reviews/sessions/${id}`, { method: "DELETE" });

export const previewCrawlRecords = (id: number) =>
  request<Record<string, unknown>[]>(`/hotel-reviews/sessions/${id}/records/preview`);

export const exportCrawlRecordsUrl = (id: number) =>
  `${V1}/hotel-reviews/sessions/${id}/records/export`;

export const getCrawlRecords = (id: number) =>
  request<Record<string, unknown>[]>(`/hotel-reviews/sessions/${id}/records`);

export const getCrawlAnalytics = (id: number) =>
  request<AnalyticsResult>(`/hotel-reviews/sessions/${id}/analytics`);

export const generateSessionBlog = (id: number) =>
  request<{ blog_post_id: number; title: string; slug: string; draft: boolean }>(
    `/hotel-reviews/sessions/${id}/generate-blog`,
    { method: "POST" }
  );

// ---- access tokens (admin) ----
export interface AppToken {
  id: number;
  token: string;
  created_at: string;
  expires_at: string;
  is_used: boolean;
  used_by_ip: string | null;
  used_at: string | null;
  is_expired: boolean;
}

export interface IpUsageEntry {
  id: number;
  ip: string;
  app_name: string;
  first_used_at: string;
}

export const generateAppToken = (token: string) =>
  request<AppToken>("/access-tokens/generate", { method: "POST", token });

export const listAppTokens = (token: string) =>
  request<AppToken[]>("/access-tokens", { token });

export const revokeAppToken = (token: string, id: number) =>
  request<void>(`/access-tokens/${id}`, { method: "DELETE", token });

export const getDevMode = (token: string) =>
  request<{ current_ip: string; dev_mode: boolean; whitelisted_ips: string[] }>(
    "/access-tokens/dev-mode",
    { token }
  );

export const toggleDevMode = (token: string) =>
  request<{ current_ip: string; dev_mode: boolean; whitelisted_ips: string[] }>(
    "/access-tokens/dev-mode/toggle",
    { method: "POST", token }
  );

export const listIpUsage = (token: string) =>
  request<IpUsageEntry[]>("/access-tokens/ip-usage", { token });

export const deleteIpUsage = (token: string, id: number) =>
  request<void>(`/access-tokens/ip-usage/${id}`, { method: "DELETE", token });
