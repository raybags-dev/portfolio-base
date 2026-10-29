import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { ok, fail } from "../../shared/envelope.js";
import { log } from "../../shared/logger.js";
import { optionalEnv } from "../../shared/config.js";
import { getAdminKey } from "./admin-key.js";
import { createTrack, getProgress, getTrack, listTracks, putProgress, signStreamUrl } from "./db.js";
import { ListQuerySchema, ProgressUpdateSchema, TrackCreateSchema } from "./schemas.js";
export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "256kb" }));
  const corsOrigins = optionalEnv("CORS_ALLOWED_ORIGINS", "*").split(",");
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin ?? "";
    const allowed = corsOrigins.includes("*") ? "*" : (corsOrigins.includes(origin) ? origin : null);
    if (allowed) {
      res.setHeader("access-control-allow-origin", allowed === "*" ? "*" : origin);
      res.setHeader("access-control-allow-methods", "GET,POST,PATCH,OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type,x-api-key");
      res.setHeader("vary", "Origin");
    }
    if (req.method === "OPTIONS") { res.status(204).end(); return; }
    next();
  });
  app.get("/tracks", async (req: Request, res: Response) => {
    try {
      const query = ListQuerySchema.parse(req.query);
      const result = await listTracks({
        limit: query.limit,
        ...(query.category && { category: query.category }),
        ...(query.cursor && { cursor: query.cursor }),
      });
      res.json(ok({ items: result.items, nextCursor: result.nextCursor }));
    } catch (err) { handleError(err, res); }
  });
  app.get("/tracks/:id", async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id ?? "");
      const track = await getTrack(id);
      if (!track) { res.status(404).json(fail("Track not found")); return; }
      const { url: streamUrl, expiresIn } = await signStreamUrl(track);
      const listenerId = typeof req.query.listenerId === "string" ? req.query.listenerId : null;
      const progress = listenerId ? await getProgress(track.id, listenerId) : null;
      res.json(ok({ track, streamUrl, expiresIn, progress }));
    } catch (err) { handleError(err, res); }
  });
  app.post("/tracks", async (req: Request, res: Response) => {
    try {
      const adminKey = await getAdminKey();
      if (req.headers["x-api-key"] !== adminKey) { res.status(403).json(fail("Forbidden", "FORBIDDEN")); return; }
      const input = TrackCreateSchema.parse(req.body);
      const track = await createTrack(input);
      log.info("audio.track.created", { id: track.id, category: track.category });
      res.status(201).json(ok(track));
    } catch (err) { handleError(err, res); }
  });
  app.patch("/tracks/:id/progress", async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id ?? "");
      const track = await getTrack(id);
      if (!track) { res.status(404).json(fail("Track not found")); return; }
      const input = ProgressUpdateSchema.parse(req.body);
      const clamped = Math.min(input.positionSeconds, track.durationSeconds);
      await putProgress({ trackId: track.id, listenerId: input.listenerId, positionSeconds: clamped });
      res.json(ok({ trackId: track.id, positionSeconds: clamped }));
    } catch (err) { handleError(err, res); }
  });
  app.use((req: Request, res: Response) => { res.status(404).json(fail("Not found")); });
  return app;
}
function handleError(err: unknown, res: Response): void {
  if (err instanceof ZodError) { res.status(422).json(fail(err.issues.map((i) => i.path.join(".") + ": " + i.message).join("; "), "VALIDATION")); return; }
  const message = err instanceof Error ? err.message : "Internal error";
  log.error("audio.error", { error: message });
  res.status(500).json(fail("Internal server error"));
}
