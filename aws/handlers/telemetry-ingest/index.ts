// Placeholder handler - replaced in Phase 4 with the telemetry ingestion
// endpoint (Zod batch validation -> SQS -> 202 Accepted).
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { respondOk } from "../../shared/envelope.js";
import { log } from "../../shared/logger.js";

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  log.info("stub.invoked", { path: event.rawPath });
  return respondOk({ stub: true, service: "telemetry-ingest" }, 202);
};
