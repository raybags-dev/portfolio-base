// Zod schemas for the audio/podcast API (strict input validation).

import { z } from "zod";

export const TrackCategory = z.enum(["podcast", "music", "lecture", "demo"]);
export type TrackCategoryT = z.infer<typeof TrackCategory>;

export const TrackCreateSchema = z.object({
  title: z.string().min(1).max(255),
  artist: z.string().max(255).optional(),
  category: TrackCategory,
  durationSeconds: z.number().int().positive().max(4 * 3600),
  s3Key: z
    .string()
    .min(1)
    .max(512)
    .regex(/^audio\/[A-Za-z0-9._/-]+$/, "s3Key must live under audio/"),
  summary: z.string().max(2000).optional(),
  coverUrl: z.string().url().max(1024).optional(),
});
export type TrackCreateT = z.infer<typeof TrackCreateSchema>;

export const ProgressUpdateSchema = z.object({
  listenerId: z.string().min(1).max(128),
  positionSeconds: z.number().int().min(0),
});
export type ProgressUpdateT = z.infer<typeof ProgressUpdateSchema>;

export const ListQuerySchema = z.object({
  category: TrackCategory.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(512).optional(),
});
export type ListQueryT = z.infer<typeof ListQuerySchema>;
