// Typed API client for the FastAPI backend.
import type {
  Bootstrap,
  FeatureFlag,
  Skill,
  Theme,
  Hero,
  TokenResponse,
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
  request<{ id: number; email: string; is_superuser: boolean; permissions: string[] }>(
    "/auth/me",
    { token },
  );

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

// ---- theme / hero (admin singletons) ----
export const updateTheme = (token: string, body: Partial<Theme>) =>
  request<Theme>("/content/theme", {
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
