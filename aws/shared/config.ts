// Runtime configuration validation (AGENTS.md §6): handlers must crash-fast
// with a clear error when required env vars are missing, never fail silently
// mid-execution. Reads happen once per cold start.

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value;
}

export function requireEnvInt(name: string): number {
  const raw = requireEnv(name).trim();
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`Environment variable ${name} must be an integer, got: ${raw}`);
  }
  return Number.parseInt(raw, 10);
}
