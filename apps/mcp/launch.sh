#!/usr/bin/env bash
# Launch the Mycelia MCP server with config from the repo .env (gitignored).
# Identity: set MYCELIA_KEY to YOUR account key (from the web "Connect your agent"
# panel) to share memory with the web app. Falls back to MASTER_SUI_PRIVKEY for
# local testing. stdout is the MCP channel — keep this script silent on stdout.
set -euo pipefail
cd "$(dirname "$0")/../.."            # repo root (where .env lives)
set -a
[ -f .env ] && . ./.env
set +a
export MYCELIA_KEY="${MYCELIA_KEY:-${MASTER_SUI_PRIVKEY:-}}"
exec node apps/mcp/dist/index.js
