// Handler-level tests with mocked AWS SDK clients (no AWS calls).
import { mockClient } from "aws-sdk-client-mock";
import { CreateJobCommand, DescribeEndpointsCommand, MediaConvertClient } from "@aws-sdk/client-mediaconvert";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { S3Event } from "aws-lambda";

const mcMock = mockClient(MediaConvertClient);
// Mock DynamoDBDocumentClient directly - base-client mocks do not propagate
// through DynamoDBDocumentClient.from() in aws-sdk-client-mock v4.
const ddbMock = mockClient(DynamoDBDocumentClient);

// Must set env before importing the handler (config is read per-invocation).
const ENV: Record<string, string> = {
  AWS_REGION: "eu-central-1",
  AWS_ACCESS_KEY_ID: "test",
  AWS_SECRET_ACCESS_KEY: "test",
  JOBS_TABLE: "test-jobs",
  PROCESSED_BUCKET: "hls-bucket",
  MEDIACONVERT_QUEUE_ARN: "arn:aws:mediaconvert:eu-central-1:123:queues/main",
  MEDIACONVERT_ROLE_ARN: "arn:aws:iam::123:role/mc",
  CLOUDFRONT_DOMAIN: "d123.cloudfront.net",
  MAX_OUTPUT_HEIGHT: "1080",
};

function s3Event(key: string): S3Event {
  return {
    Records: [
      {
        s3: {
          bucket: { name: "raw-bucket" },
          object: { key, size: 1024 },
        },
      },
    ],
  } as unknown as S3Event;
}

describe("vod-transcode handler", () => {
  beforeEach(() => {
    mcMock.reset();
    ddbMock.reset();
    for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
    mcMock.on(DescribeEndpointsCommand).resolves({ Endpoints: [{ Url: "https://mc.example" }] });
    // The SDK Job type requires Role/Settings; the handler only reads Job.Id.
    mcMock.on(CreateJobCommand).resolves({ Job: { Id: "mc-job-1" } as never });
    ddbMock.on(PutCommand).resolves({});
  });

  it("submits a MediaConvert job and records it in DynamoDB", async () => {
    const { handler } = await import("../handlers/vod-transcode/index.js");
    await handler(s3Event("tryout/job-abc123/clip.mp4"));

    const createCalls = mcMock.commandCalls(CreateJobCommand);
    expect(createCalls).toHaveLength(1);
    const input = createCalls[0]!.args[0].input;
    expect(input.Queue).toBe(ENV.MEDIACONVERT_QUEUE_ARN);
    expect(input.Role).toBe(ENV.MEDIACONVERT_ROLE_ARN);
    expect(input.UserMetadata).toEqual({ jobId: "job-abc123" });
    expect(input.Settings?.Inputs?.[0]?.FileInput).toBe("s3://raw-bucket/tryout/job-abc123/clip.mp4");

    const puts = ddbMock.commandCalls(PutCommand);
    expect(puts).toHaveLength(1);
    const item = (puts[0]!.args[0].input.Item ?? {}) as Record<string, unknown>;
    expect(item["jobId"]).toBe("job-abc123");
    expect(item["status"]).toBe("SUBMITTED");
    expect(item["mediaConvertJobId"]).toBe("mc-job-1");
    // MediaConvert names the parent manifest after the input basename.
    expect(item["streamUrl"]).toBe("https://d123.cloudfront.net/job-abc123/clip.m3u8");
  });

  it("decodes URL-encoded object keys", async () => {
    const { handler } = await import("../handlers/vod-transcode/index.js");
    await handler(s3Event("tryout/job-xyz789/my+clip+%28final%29.mp4"));

    const createCalls = mcMock.commandCalls(CreateJobCommand);
    expect(createCalls[0]!.args[0].input.Settings?.Inputs?.[0]?.FileInput).toBe(
      "s3://raw-bucket/tryout/job-xyz789/my clip (final).mp4",
    );
  });

  it("generates a UUID jobId for non-broker keys", async () => {
    const { handler } = await import("../handlers/vod-transcode/index.js");
    await handler(s3Event("uploads/raw.mp4"));

    const puts = ddbMock.commandCalls(PutCommand);
    const item = (puts[0]!.args[0].input.Item ?? {}) as Record<string, unknown>;
    expect(String(item["jobId"])).toMatch(/^[0-9a-f-]{36}$/);
  });
});
