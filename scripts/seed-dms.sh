#!/usr/bin/env bash
set -euo pipefail

DMS_API_URL="${DMS_API_URL:-http://localhost:3101}"

curl -sS -X POST "$DMS_API_URL/api/v1/documents" \
  -F policyNumber=POL-1001 \
  -F documentType=POLICY \
  -F customerId=CUST-001 \
  -F beneficiaryId=BEN-001 \
  -F sourceSystem=LOCAL_DMS_UI \
  -F file=@tests/fixtures/sample-policy.pdf
