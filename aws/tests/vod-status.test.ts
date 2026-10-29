import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { EventBridgeEvent } from "aws-lambda";

const ddbMock = mockClient(DynamoDBDocumentClient);

interface Detail {
  jobId: number;
  status: string;
  userMetadata?: { jobId?: string };
  errorMessage?: string;
}

function ebEvent(detail: Detail): EventBridgeEvent<"MediaConvert Job State Change", Detail> {
  return {
    id: "evt-1",
    version: "0",
    account: "123",
    time: "2026-10-29T00:00:00Z",
    region: "eu-central-1",
    resources: [],
    source: "aws.mediaconvert",
    "detail-type": "MediaConvert Job State Change",
    detail,
  } as EventBridgeEvent<"MediaConvert Job State Change", Detail>;
}

describe("vod-status handler", () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env["AWS_REGION"] = "eu-central-1";
    process.env["AWS_ACCESS_KEY_ID"] = "test";
    process.env["AWS_SECRET_ACCESS_KEY"] = "test";
    process.env["JOBS_TABLE"] = "test-jobs";
    ddbMock.on(UpdateCommand).resolves({});
  });

  it("marks the job COMPLETE on MediaConvert COMPLETE", async () => {
    const { handler } = await import("../handlers/vod-status/index.js");
    await handler(ebEvent({ jobId: 42, status: "COMPLETE", userMetadata: { jobId: "job-abc" } }));

    const calls = ddbMock.commandCalls(UpdateCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0]!.args[0].input;
    expect(input.Key).toEqual({ jobId: "job-abc" });
    expect(input.ExpressionAttributeValues?.[":status"]).toBe("COMPLETE");
    expect(input.ExpressionAttributeValues?.[":err"]).toBeNull();
  });

  it("records the error message on MediaConvert ERROR", async () => {
    const { handler } = await import("../handlers/vod-status/index.js");
    await handler(
      ebEvent({ jobId: 43, status: "ERROR", userMetadata: { jobId: "job-def" }, errorMessage: "bad codec" }),
    );

    const calls = ddbMock.commandCalls(UpdateCommand);
    expect(calls[0]!.args[0].input.ExpressionAttributeValues?.[":status"]).toBe("ERROR");
    expect(calls[0]!.args[0].input.ExpressionAttributeValues?.[":err"]).toBe("bad codec");
  });

  it("skips events that carry no platform jobId", async () => {
    const { handler } = await import("../handlers/vod-status/index.js");
    await handler(ebEvent({ jobId: 44, status: "COMPLETE" }));
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });
});
