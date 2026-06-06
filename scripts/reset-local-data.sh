#!/usr/bin/env bash
set -euo pipefail

rm -rf .local-data
docker compose -f infra/docker-compose.yml down -v
