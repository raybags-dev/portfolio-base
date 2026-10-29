// vod-status: EventBridge "MediaConvert Job State Change" (COMPLETE/ERROR)
// -> update the DynamoDB job record so the platform can serve status polls.

import type { EventBridgeEvent } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { requireEnv } from "../../shared/config.js";
import { docClient } from "../../shared/aws-clients.js";
import { log } from "../../shared/logger.js";

interface MediaConvertStateDetail {
  jobId: number;
  status: string;
  userMetadata?: { jobId?: string };
  errorMessage?: string;
}

export const handler = async (
  event: EventBridgeEvent<"MediaConvert Job State Change", MediaConvertStateDetail>,
): Promise<void> => {
  const tableName = requireEnv("JOBS_TABLE");
  const detail = event.detail;

  const jobId = detail.userMetadata?.jobId;
  if (!jobId) {
    log.warn("status.skipped", { reason: "no userMetadata.jobId", mcJobId: detail.jobId });
    return;
  }

  const now = new Date().toISOString();
  const isError = detail.status === "ERROR";

  await docClient().send(
    new UpdateCommand({
      TableName: tableName,
      Key: { jobId },
      UpdateExpression: "SET #status = :status, updatedAt = :now, errorMessage = :err",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": isError ? "ERROR" : "COMPLETE",
        ":now": now,
        ":err": isError ? (detail.errorMessage ?? "unknown MediaConvert error") : null,
      },
    }),
  );

  log.info("status.updated", { jobId, status: detail.status, mcJobId: detail.jobId });
};
