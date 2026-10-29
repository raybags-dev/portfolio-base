// Placeholder handler - replaced in Phase 4 with the SQS batch processor
// (aggregate -> DynamoDB, partial-batch failure reporting).
import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import { log } from "../../shared/logger.js";

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  log.info("stub.invoked", { records: event.Records.length });
  return { batchItemFailures: [] };
};
