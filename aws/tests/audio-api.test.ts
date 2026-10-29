// audio-api handler tests: full HTTP surface with mocked AWS SDK clients.
import { jest } from "@jest/globals";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const ddbMock = mockClient(DynamoDBDocumentClient);
const ssmMock = mockClient(SSMClient);

const ENV: Record<string, string> = {
  AWS_REGION: "eu-central-1",
  AWS_ACCESS_KEY_ID: "test",
  AWS_SECRET_ACCESS_KEY: "test",
  TRACKS_TABLE: "tracks-test",
  PROGRESS_TABLE: "progress-test",
  AUDIO_BUCKET: "audio-test-bucket",
  ADMIN_API_KEY_SSM: "/test/admin-key",
  STREAM_URL_TTL: "3600",
  CORS_ALLOWED_ORIGINS: "https://raybags.com",
};

// getSignedUrl is pure local crypto (no network call) - it signs against the
// fake test credentials, so the real thing runs fine in tests.

const sampleTrack = {
  id: "t-1",
  title: "Ep 1",
  category: "podcast",
  durationSeconds: 120,
  s3Key: "audio/ep1.mp3",
  publishedAt: "2026-10-29T00:00:00.000Z",
  createdAt: "2026-10-29T00:00:00.000Z",
};

function gwEvent(opts: {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: opts.path,
    rawQueryString: opts.query
      ? new URLSearchParams(opts.query).toString()
      : "",
    headers: { "content-type": "application/json", ...opts.headers },
    requestContext: {
      accountId: "1",
      apiId: "api",
      domainName: "x",
      domainPrefix: "x",
      http: {
        method: opts.method,
        path: opts.path,
        protocol: "HTTP/1.1",
        sourceIp: "1.2.3.4",
        userAgent: "test",
      },
      requestId: "r",
      routeKey: "$default",
      stage: "$default",
      time: "",
      timeEpoch: 0,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

async function invoke(event: APIGatewayProxyEventV2) {
  const { handler } = await import("../handlers/audio-api/index.js");
  const res = await handler(event, {} as never);
  return res as unknown as { statusCode: number; body: string; headers: Record<string, string> };
}

function parse(res: { body: string }) {
  return JSON.parse(res.body) as Record<string, unknown>;
}

beforeEach(() => {
  ddbMock.reset();
  ssmMock.reset();
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
});

describe("audio-api", () => {
  it("GET /tracks returns the success envelope with items", async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [sampleTrack] });
    const res = await invoke(gwEvent({ method: "GET", path: "/tracks" }));
    expect(res.statusCode).toBe(200);
    const body = parse(res);
    expect(body["success"]).toBe(true);
    const data = body["data"] as { items: unknown[]; nextCursor: string | null };
    expect(data.items).toHaveLength(1);
    expect(data.nextCursor).toBeNull();
  });

  it("GET /tracks/:id returns track + presigned stream URL", async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleTrack });
    const res = await invoke(gwEvent({ method: "GET", path: `/tracks/${sampleTrack.id}` }));
    expect(res.statusCode).toBe(200);
    const data = parse(res)["data"] as Record<string, unknown>;
    const streamUrl = String(data["streamUrl"]);
    expect(streamUrl).toContain("audio-test-bucket");
    expect(streamUrl).toContain(encodeURIComponent(sampleTrack.s3Key).replace(/%2F/g, "/"));
    expect(streamUrl).toContain("X-Amz-Signature=");
    expect(data["expiresIn"]).toBe(3600);
  });

  it("GET /tracks/:id 404s for unknown track", async () => {
    ddbMock.on(GetCommand).resolves({});
    const res = await invoke(gwEvent({ method: "GET", path: "/tracks/nope" }));
    expect(res.statusCode).toBe(404);
    expect(parse(res)["success"]).toBe(false);
  });

  it("POST /tracks rejects without admin key", async () => {
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: "secret-key" } });
    const res = await invoke(
      gwEvent({
        method: "POST",
        path: "/tracks",
        body: { title: "X", category: "demo", durationSeconds: 10, s3Key: "audio/x.mp3" },
      }),
    );
    expect(res.statusCode).toBe(403);
  });

  it("POST /tracks creates a track with the admin key", async () => {
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: "secret-key" } });
    ddbMock.on(PutCommand).resolves({});
    const res = await invoke(
      gwEvent({
        method: "POST",
        path: "/tracks",
        headers: { "x-api-key": "secret-key" },
        body: { title: "X", category: "demo", durationSeconds: 10, s3Key: "audio/x.mp3" },
      }),
    );
    expect(res.statusCode).toBe(201);
    const data = parse(res)["data"] as Record<string, unknown>;
    expect(data["title"]).toBe("X");
    expect(String(data["id"])).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("POST /tracks 422s on invalid payload", async () => {
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: "secret-key" } });
    const res = await invoke(
      gwEvent({
        method: "POST",
        path: "/tracks",
        headers: { "x-api-key": "secret-key" },
        body: { title: "", category: "nope", durationSeconds: -1, s3Key: "../etc" },
      }),
    );
    expect(res.statusCode).toBe(422);
    expect(parse(res)["success"]).toBe(false);
  });

  it("PATCH /tracks/:id/progress stores and clamps position", async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleTrack });
    ddbMock.on(PutCommand).resolves({});
    const res = await invoke(
      gwEvent({
        method: "PATCH",
        path: `/tracks/${sampleTrack.id}/progress`,
        body: { listenerId: "listener-1", positionSeconds: 9999 },
      }),
    );
    expect(res.statusCode).toBe(200);
    const data = parse(res)["data"] as Record<string, unknown>;
    // clamped to the 120s track duration
    expect(data["positionSeconds"]).toBe(120);
  });

  it("enforces CORS only for the configured origin", async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    const okRes = await invoke(
      gwEvent({ method: "GET", path: "/tracks", headers: { origin: "https://raybags.com" } }),
    );
    expect(okRes.headers["access-control-allow-origin"]).toBe("https://raybags.com");
    const badRes = await invoke(
      gwEvent({ method: "GET", path: "/tracks", headers: { origin: "https://evil.example" } }),
    );
    expect(badRes.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
