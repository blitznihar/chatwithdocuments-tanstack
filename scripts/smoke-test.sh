#!/usr/bin/env bash
set -euo pipefail

DMS_API_URL="${DMS_API_URL:-http://localhost:3101}"
WRAPPER_API_URL="${WRAPPER_API_URL:-http://localhost:3201}"

echo "Checking DMS API"
curl -fsS "$DMS_API_URL/health/live" >/dev/null

echo "Uploading fixture"
UPLOAD_JSON="$(bash scripts/seed-dms.sh)"
HANDLE_ID="$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(0,"utf8")); console.log(data.handleId) ' <<< "$UPLOAD_JSON")"

echo "Querying fixture"
curl -fsS "$DMS_API_URL/api/v1/documents?policyNumber=POL-1001" >/dev/null

echo "Checking wrapper model catalog"
curl -fsS "$WRAPPER_API_URL/api/v1/models" >/dev/null

echo "Asking chatbot path"
curl -fsS -X POST "$WRAPPER_API_URL/api/v1/chat/question" \
  -H "Content-Type: application/json" \
  -d '{
    "question":"What is the premium for policy POL-1001?",
    "policyNumber":"POL-1001",
    "documentScope":"minimum",
    "fetchStrategy":"latest",
    "selectedOcrModelName":"ai/qwen3-vl:latest",
    "selectedAgentModelName":"ai/gpt-oss:latest"
  }' >/dev/null

echo "Smoke test passed with $HANDLE_ID"
