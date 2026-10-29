// vod-transcode: raw-upload S3 event -> MediaConvert HLS job + DynamoDB record.
//
// The platform broker presigns bounded PUTs to tryout/<jobId>/<file>.mp4;
// this handler picks up the ObjectCreated event, submits a single-pass
// H.264/AAC HLS job (720p/1080p cap per AGENTS.md cost rules), and records
// the job so the platform can poll status.

import { randomUUID } from "node:crypto";
import type { S3Event } from "aws-lambda";
import { CreateJobCommand, DescribeEndpointsCommand, MediaConvertClient } from "@aws-sdk/client-mediaconvert";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { optionalEnv, requireEnv, requireEnvInt } from "../../shared/config.js";
import { docClient } from "../../shared/aws-clients.js";
import { log } from "../../shared/logger.js";
import { buildJobSettings, parseJobIdFromKey } from "./job-settings.js";

interface TranscodeConfig {
  jobsTable: string;
  processedBucket: string;
  queueArn: string;
  roleArn: string;
  cloudfrontDomain: string;
  maxOutputHeight: number;
  recordTtlDays: number;
}

function loadConfig(): TranscodeConfig {
  return {
    jobsTable: requireEnv("JOBS_TABLE"),
    processedBucket: requireEnv("PROCESSED_BUCKET"),
    queueArn: requireEnv("MEDIACONVERT_QUEUE_ARN"),
    roleArn: requireEnv("MEDIACONVERT_ROLE_ARN"),
    cloudfrontDomain: requireEnv("CLOUDFRONT_DOMAIN"),
    maxOutputHeight: requireEnvInt("MAX_OUTPUT_HEIGHT"),
    recordTtlDays: Number(optionalEnv("RECORD_TTL_DAYS", "7")),
  };
}

// MediaConvert uses a per-account endpoint discovered via DescribeEndpoints;
// cache it per warm container.
let mcClient: MediaConvertClient | undefined;

async function getMediaConvertClient(): Promise<MediaConvertClient> {
  if (mcClient) return mcClient;
  const probe = new MediaConvertClient({});
  const { Endpoints } = await probe.send(new DescribeEndpointsCommand({ MaxResults: 1 }));
  const url = Endpoints?.[0]?.Url;
  if (!url) throw new Error("MediaConvert DescribeEndpoints returned no endpoint");
  mcClient = new MediaConvertClient({ endpoint: url });
  return mcClient;
}

function decodeS3Key(raw: string): string {
  return decodeURIComponent(raw.replace(/\+/g, " "));
}

export const handler = async (event: S3Event): Promise<void> => {
  const config = loadConfig();
  const client = await getMediaConvertClient();

  for (const record of event.Records) {
    const inputBucket = record.s3.bucket.name;
    const inputKey = decodeS3Key(record.s3.object.key);
    const jobId = parseJobIdFromKey(inputKey) ?? randomUUID();

    log.info("transcode.received", { jobId, inputBucket, inputKey });

    const created = await client.send(
      new CreateJobCommand({
        Queue: config.queueArn,
        Role: config.roleArn,
        UserMetadata: { jobId },
        Settings: buildJobSettings({
          inputBucket,
          inputKey,
          processedBucket: config.processedBucket,
          jobId,
          maxOutputHeight: config.maxOutputHeight,
        }),
      }),
    );

    // MediaConvert names the parent manifest after the input file's base
    // name (<jobId>/<basename>.m3u8), NOT index.m3u8.
    const baseName = inputKey.split("/").pop()?.replace(/\.[^.]+$/, "") || "index";

    const now = new Date();
    const expiresAt = Math.floor(now.getTime() / 1000) + config.recordTtlDays * 86_400;

    await docClient().send(
      new PutCommand({
        TableName: config.jobsTable,
        Item: {
          jobId,
          status: "SUBMITTED",
          mediaConvertJobId: created.Job?.Id ?? null,
          inputBucket,
          inputKey,
          manifestKey: `${jobId}/${baseName}.m3u8`,
          streamUrl: `https://${config.cloudfrontDomain}/${jobId}/${baseName}.m3u8`,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          expiresAt,
        },
      }),
    );

    log.info("transcode.submitted", { jobId, mediaConvertJobId: created.Job?.Id });
  }
};
