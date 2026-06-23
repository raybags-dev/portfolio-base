#!/usr/bin/env bash
# One-shot script to add the raybags-chat project card via the portfolio API.
# Usage: bash scripts/add-chat-project.sh <your-admin-jwt>
#
# Get your JWT: log into raybags.com/admin → open browser DevTools →
#   Application → Local Storage → raybags.com → look for "auth" or "token" key.

set -euo pipefail
TOKEN="${1:?Usage: $0 <admin-jwt>}"
API="https://raybags.com/api/v1/projects"

curl -fsSL -X POST "$API" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "raybags-chat",
    "slug": "raybags-chat",
    "summary": "Real-time AI chat embedded in the portfolio — WebSockets, Redis pub/sub, Groq LLM with tool use, and live human takeover.",
    "description": "A fully event-driven chat system built for raybags.com. Visitors connect via persistent WebSockets. Messages are fanned through Redis pub/sub to a Groq-backed LLM agent that answers portfolio questions, issues DataForge pipeline tokens, and escalates to a live human session on demand. An admin dashboard lets Ray intercept any conversation and reply in real time. The frontend widget is built in Next.js and embeds directly in the portfolio with localStorage-persisted name and session history.",
    "github_url": "https://github.com/raybags-dev/chatter-ray",
    "demo_url": "https://raybags.com",
    "status": "live",
    "tech_tags": ["Python", "FastAPI", "WebSockets", "Redis", "Groq LLM", "Next.js", "TypeScript", "Docker", "PostgreSQL", "Supabase", "GitHub Actions"],
    "is_featured": true,
    "is_hidden": false,
    "order": 1
  }' | python3 -m json.tool

echo ""
echo "Project created. Visit https://raybags.com/admin/projects to review."
