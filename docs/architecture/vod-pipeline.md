# VOD & HLS Packaging Pipeline — Architecture

Serverless video-on-demand pipeline. A visitor uploads a short clip from
`raybags.com/vod-pipeline`; the browser PUTs it straight into a private S3
bucket through a bounded presigned URL; AWS MediaConvert packages it into
multi-rendition HLS; the result streams back through CloudFront (OAC).

Every run costs real money (MediaConvert minutes), so usage is **token-only**:
the admin approves a tryout request, the platform emails a 24-hour,
quota-limited key, and only that key can presign uploads.

[Open the interactive diagram on GitDiagram](https://gitdiagram.com/raybags-dev/portfolio-base)

```mermaid
flowchart TD

subgraph group_tryout["Tryout control plane (raybags.com VPS)"]
  node_page["Tryout page<br/>[frontend/app/vod-pipeline]"]
  node_broker["FastAPI broker<br/>[modules/vod_pipeline]"]
  node_tokens[("AppToken store<br/>24h, quota-scoped")]
  node_requests[("Tryout requests<br/>[tryout_requests]")]
  node_email["Resend email"]
  node_admin["Admin panel<br/>/admin/vod-pipeline"]
end

subgraph group_aws["AWS (eu-central-1, Terraform)"]
  node_raw[("S3 raw-uploads<br/>private, 2d lifecycle")]
  node_transcode["vod-transcode Lambda<br/>[aws/handlers/vod-transcode]"]
  node_mc["MediaConvert queue<br/>single-pass H.264/AAC ≤1080p"]
  node_hls[("S3 processed-hls<br/>private, 7d lifecycle")]
  node_status["vod-status Lambda<br/>[aws/handlers/vod-status]"]
  node_ddb[("DynamoDB jobs table<br/>TTL 7d")]
  node_eb["EventBridge<br/>Job State Change"]
  node_cf["CloudFront + OAC<br/>PriceClass_100"]
end

node_admin -->|"1. approve request → mint token"| node_tokens
node_page -->|"request 24h token"| node_requests
node_requests --> node_admin
node_tokens -->|"email key"| node_email
node_page -->|"2. POST /vod-pipeline/uploads<br/>(X-App-Token)"| node_broker
node_broker -->|"validate + redeem token"| node_tokens
node_broker -->|"3. presigned PUT (15min, ≤100MB)"| node_page
node_page -->|"4. PUT video (direct)"| node_raw
node_raw -->|"5. ObjectCreated (.mp4)"| node_transcode
node_transcode -->|"6. CreateJob + UserMetadata{jobId}"| node_mc
node_transcode -->|"record: SUBMITTED"| node_ddb
node_mc -->|"7. HLS renditions"| node_hls
node_mc -->|"8. COMPLETE / ERROR"| node_eb
node_eb --> node_status
node_status -->|"record: COMPLETE + streamUrl"| node_ddb
node_page -->|"9. poll GET /jobs/{id}"| node_broker
node_broker -->|"read-through sync"| node_ddb
node_page -->|"10. play (hls.js)"| node_cf
node_cf -->|"OAC-signed origin pulls"| node_hls
```

## Cost guardrails

- **Token-only uploads** — no anonymous runs; every transcode is tied to an
  admin-issued key (`max_uses` quota, 24h TTL, single-IP redemption).
- **Single-pass, ≤1080p** enforced in both the Lambda builder
  (`renditionsFor` throws above 1080p) and the Terraform variable validation.
- **Bounded uploads** — presign is scoped to `tryout/<jobId>/…` keys, 100 MB
  max, 15-minute expiry.
- **Auto-expiry** — raw uploads die after 2 days, HLS outputs after 7,
  DynamoDB records via TTL.
- **Budget alarm** — account-wide $10/month budget emails at 80% actual /
  100% forecasted; SNS DLQ alarm armed.
- **Teardown** — `make down` destroys everything; `scripts/aws-leftovers.sh`
  finds orphans by the `Project` tag.

## Key paths

| Piece | Location |
|---|---|
| Terraform module | `modules/vod-pipeline/` |
| Transcode handler | `aws/handlers/vod-transcode/` |
| Status handler | `aws/handlers/vod-status/` |
| Platform broker | `backend/app/modules/vod_pipeline/` |
| Tryout page | `frontend/app/vod-pipeline/` |
| Admin controls | `frontend/app/admin/vod-pipeline/` |
