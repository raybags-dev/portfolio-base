# Audio & Podcast Stream API — Architecture

Serverless REST API for podcast/audio metadata with secure streaming.
Public reads hit the API Gateway directly from the browser (near-zero cost);
admin writes are brokered through the platform with an admin API key stored
in SSM.

[Open the interactive diagram on GitDiagram](https://gitdiagram.com/raybags-dev/portfolio-base)

```mermaid
flowchart TD

subgraph group_platform["Platform (raybags.com VPS)"]
  node_page["Demo page<br/>[frontend/app/audio-api]"]
  node_admin["Admin section<br/>/admin/audio-api"]
  node_broker["FastAPI broker<br/>[modules/audio_api]"]
end

subgraph group_aws["AWS (eu-central-1, Terraform)"]
  node_gw["API Gateway HTTP API<br/>CORS locked to raybags.com"]
  node_fn["audio-api Lambda<br/>Express + serverless-http"]
  node_tracks[("DynamoDB AudioTracks<br/>PK id + GSI publishedAt")]
  node_progress[("DynamoDB progress<br/>PK trackId+listenerId, TTL")]
  node_audio[("S3 audio bucket<br/>private, 30d lifecycle")]
  node_ssm[("SSM SecureString<br/>admin API key")]
end

node_page -->|"GET /tracks, /tracks/:id<br/>(public reads)"| node_gw
node_gw --> node_fn
node_fn --> node_tracks
node_fn --> node_progress
node_fn -->|"presigned GET (1h)"| node_audio
node_admin -->|"tracks CRUD + uploads"| node_broker
node_broker -->|"x-api-key from"| node_ssm
node_broker -->|"POST/PATCH via API GW"| node_gw
node_broker -->|"presigned PUT for audio files"| node_audio
```

## Endpoints (Lambda, TypeScript strict)

| Route | Access | Purpose |
|---|---|---|
| `GET /tracks` | public | Paginated list, optional category filter |
| `GET /tracks/:id` | public | Metadata + 1h presigned stream URL |
| `POST /tracks` | admin (`x-api-key`) | Register episode (Zod-validated) |
| `PATCH /tracks/:id/progress` | public | Sync playback position |

## Cost guardrails

- PAY_PER_REQUEST DynamoDB; progress rows expire via TTL.
- 1h presigned GET URLs bound demo bandwidth.
- Admin key lives in SSM; the broker reads it with a scoped IAM user — never
  hardcoded, never shipped to the browser.
- `make down` tears the whole stack out.

## Key paths

| Piece | Location |
|---|---|
| Terraform module | `modules/audio-api/` |
| Lambda handler | `aws/handlers/audio-api/` (Phase 3) |
| Platform broker | `backend/app/modules/audio_api/` (Phase 3) |
| Demo page | `frontend/app/audio-api/` (Phase 3) |
