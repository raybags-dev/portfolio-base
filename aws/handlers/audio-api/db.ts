// DynamoDB access for tracks + playback progress (lib-dynamodb document client),
// plus the S3 stream-URL signer (kept here so app.ts stays a thin HTTP layer).

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  GetCommand,
  PutCommand,
  ScanCommand,
  type ScanCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { s3Client, docClient } from "../../shared/aws-clients.js";
import { requireEnv, requireEnvInt } from "../../shared/config.js";
import type { TrackCreateT } from "./schemas.js";

export interface Track {
  id: string;
  title: string;
  artist?: string;
  category: string;
  durationSeconds: number;
  s3Key: string;
  summary?: string;
  coverUrl?: string;
  publishedAt: string;
  createdAt: string;
}

function tracksTable(): string {
  return requireEnv("TRACKS_TABLE");
}

function progressTable(): string {
  return requireEnv("PROGRESS_TABLE");
}

export async function createTrack(input: TrackCreateT): Promise<Track> {
  const now = new Date().toISOString();
  const track: Track = {
    id: randomUUID(),
    title: input.title,
    category: input.category,
    durationSeconds: input.durationSeconds,
    s3Key: input.s3Key,
    publishedAt: now,
    createdAt: now,
    ...(input.artist !== undefined && { artist: input.artist }),
    ...(input.summary !== undefined && { summary: input.summary }),
    ...(input.coverUrl !== undefined && { coverUrl: input.coverUrl }),
  };
  await docClient().send(
    new PutCommand({ TableName: tracksTable(), Item: track }),
  );
  return track;
}

export async function getTrack(id: string): Promise<Track | null> {
  const res = await docClient().send(
    new GetCommand({ TableName: tracksTable(), Key: { id } }),
  );
  return (res.Item as Track | undefined) ?? null;
}

export interface ListResult {
  items: Track[];
  nextCursor: string | null;
}

function encodeCursor(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export async function listTracks(opts: {
  category?: string;
  limit: number;
  cursor?: string;
}): Promise<ListResult> {
  const exclusiveStartKey = opts.cursor ? decodeCursor(opts.cursor) : null;

  if (opts.category) {
    // GSI on publishedAt (hash) - query within a category partition via scan filter
    const res = await docClient().send(
      new ScanCommand({
        TableName: tracksTable(),
        FilterExpression: "#c = :c",
        ExpressionAttributeNames: { "#c": "category" },
        ExpressionAttributeValues: { ":c": opts.category },
        Limit: opts.limit,
        ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
      }),
    );
    const items = ((res.Items ?? []) as Track[]).sort((a, b) =>
      b.publishedAt.localeCompare(a.publishedAt),
    );
    return {
      items,
      nextCursor: res.LastEvaluatedKey ? encodeCursor(res.LastEvaluatedKey) : null,
    };
  }

  const input: ScanCommandInput = {
    TableName: tracksTable(),
    Limit: opts.limit,
    ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
  };
  const res = await docClient().send(new ScanCommand(input));
  const items = ((res.Items ?? []) as Track[]).sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
  return {
    items,
    nextCursor: res.LastEvaluatedKey ? encodeCursor(res.LastEvaluatedKey) : null,
  };
}

export async function putProgress(opts: {
  trackId: string;
  listenerId: string;
  positionSeconds: number;
}): Promise<void> {
  const ttlDays = 30;
  await docClient().send(
    new PutCommand({
      TableName: progressTable(),
      Item: {
        trackId: opts.trackId,
        listenerId: opts.listenerId,
        positionSeconds: opts.positionSeconds,
        updatedAt: new Date().toISOString(),
        expiresAt: Math.floor(Date.now() / 1000) + ttlDays * 86_400,
      },
    }),
  );
}

export async function getProgress(
  trackId: string,
  listenerId: string,
): Promise<{ positionSeconds: number } | null> {
  const res = await docClient().send(
    new GetCommand({ TableName: progressTable(), Key: { trackId, listenerId } }),
  );
  const item = res.Item as { positionSeconds?: number } | undefined;
  if (!item || typeof item.positionSeconds !== "number") return null;
  return { positionSeconds: item.positionSeconds };
}

export async function signStreamUrl(
  track: Track,
): Promise<{ url: string; expiresIn: number }> {
  const expiresIn = requireEnvInt("STREAM_URL_TTL");
  const url = await getSignedUrl(
    s3Client(),
    new GetObjectCommand({ Bucket: requireEnv("AUDIO_BUCKET"), Key: track.s3Key }),
    { expiresIn },
  );
  return { url, expiresIn };
}
