// Minimal structured logger (JSON lines to stdout -> CloudWatch).
// No dependencies; consistent shape across all five handlers.

type Level = "info" | "warn" | "error";

interface LogFields {
  [key: string]: unknown;
}

const emit = (level: Level, event: string, fields: LogFields): void => {
  const line = JSON.stringify({ level, event, ...fields, ts: new Date().toISOString() });
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
};

export const log = {
  info: (event: string, fields: LogFields = {}): void => emit("info", event, fields),
  warn: (event: string, fields: LogFields = {}): void => emit("warn", event, fields),
  error: (event: string, fields: LogFields = {}): void => emit("error", event, fields),
};
