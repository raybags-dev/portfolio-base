#!/usr/bin/env bash
# aws-leftovers.sh - find AWS resources tagged Project=<name> that terraform
# may have left behind (e.g. after an interrupted destroy). Read-only.
#
# Usage: scripts/aws-leftovers.sh [project-tag]
#   default project tag: medialab-dev
set -Eeuo pipefail

PROJECT_TAG="${1:-medialab-dev}"
REGION="${AWS_REGION:-eu-central-1}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing dependency: $1" >&2; exit 1; }; }
need aws
need jq

echo "Scanning for resources tagged Project=$PROJECT_TAG in $REGION ..."
echo

# Resource Groups Tagging API covers most services (s3, lambda, dynamodb, sqs,
# apigatewayv2, cloudfront(global), mediaconvert queues are NOT covered - see below).
aws resourcegroupstaggingapi get-resources \
  --region "$REGION" \
  --tag-filters "Key=Project,Values=$PROJECT_TAG" \
  --query 'ResourceTagMappingList[].ResourceARN' \
  --output json | jq -r '.[]' | sort

echo
echo "--- MediaConvert queues (not covered by tagging API) ---"
MC_ENDPOINT="$(aws mediaconvert describe-endpoints --region "$REGION" --query 'Endpoints[0].Url' --output text 2>/dev/null || true)"
if [ -n "$MC_ENDPOINT" ] && [ "$MC_ENDPOINT" != "None" ]; then
  aws mediaconvert list-queues --endpoint-url "$MC_ENDPOINT" --region "$REGION" \
    --query "Queues[?contains(Name, '$PROJECT_TAG')].Arn" --output json | jq -r '.[]?'
else
  echo "(endpoint lookup skipped)"
fi

echo
echo "If anything is listed, destroy it via terraform first (terraform destroy)."
