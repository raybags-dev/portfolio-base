# Live Stream Telemetry Collector — Architecture

High-throughput ingestion backend for player telemetry (heartbeats, buffering
events, error metrics) from many concurrent streaming clients. Ingest is a
thin validate-and-enqueue endpoint returning `202`; a capped-concurrency SQS
consumer aggregates events into a DynamoDB time-series table.

[Open the interactive diagram on GitDiagram](https://gitdiagram.com/raybags-dev/portfolio-base)

```mermaid
flowchart TD

subgraph group_platform["Platform (raybags.com VPS)"]
  node_page["Live dashboard<br/>[frontend/app/telemetry-collector]"]
  node_burst["FastAPI broker<br/>[modules/telemetry_collector]"]
  node_tokens[("AppToken store<br/>burst-grant signing")]
end

subgraph group_aws["AWS (eu-central-1, Terraform)"]
  node_gw["API Gateway HTTP API<br/>POST /events"]
  node_ingest["telemetry-ingest Lambda<br/>Zod batch validation → 202"]
  node_sqs[("SQS ingest queue<br/>batch 100, 5s window")]
  node_dlq[("SQS DLQ<br/>+ SNS alarm")]
  node_consumer["telemetry-consumer Lambda<br/>max concurrency 10<br/>partial-batch failure reporting"]
  node_ddb[("DynamoDB metrics<br/>PK sessionId + ts, TTL 7d")]
end

node_page -->|"heartbeats (free, own session)"| node_gw
node_page -->|"load-test burst<br/>(token-gated grant)"| node_burst
node_burst -->|"HMAC-signed grant"| node_tokens
node_page -->|"burst + grant token"| node_gw
node_gw --> node_ingest
node_ingest -->|"SendMessageBatch"| node_sqs
node_sqs -->|"batch poll"| node_consumer
node_ingest -.->|"poison messages after 3 receives"| node_dlq
node_consumer -->|"aggregates → BatchWriteItem"| node_ddb
node_page -->|"GET /metrics (live charts)"| node_burst
node_burst -->|"query aggregates"| node_ddb
```

## Cost guardrails

- **Consumer concurrency capped at 10** (Terraform `scaling_config`) — a burst
  can never fan out into unbounded parallel Lambdas/DynamoDB writes.
- **Token-gated bursts** — load simulation requires a platform-issued,
  HMAC-signed grant with a hard `max_events` ceiling.
- **Partial batch failures** — the consumer reports per-message failures
  (`ReportBatchItemFailures`) so one poison message never replays a whole batch.
- **DLQ + SNS alarm** — messages failing 3 receives land in the DLQ and page
  the admin.
- **TTL on metrics** — time-series rows expire after 7 days.

## Key paths

| Piece | Location |
|---|---|
| Terraform module | `modules/telemetry/` |
| Ingest handler | `aws/handlers/telemetry-ingest/` (Phase 4) |
| Consumer handler | `aws/handlers/telemetry-consumer/` (Phase 4) |
| Platform broker | `backend/app/modules/telemetry_collector/` (Phase 4) |
| Dashboard page | `frontend/app/telemetry-collector/` (Phase 4) |
