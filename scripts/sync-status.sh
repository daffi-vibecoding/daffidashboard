#!/bin/bash
# System Status Sync Wrapper
# Loads credentials and runs the sync script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(dirname "$SCRIPT_DIR")"

# Load Supabase credentials
# Prefer .env.supabase if it contains the service role key; otherwise fall back to .env.
if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  if [ -f "$WORKSPACE_DIR/.env.supabase" ]; then
    SUPABASE_SERVICE_ROLE_KEY_LINE=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$WORKSPACE_DIR/.env.supabase" || true)
    if [ -n "$SUPABASE_SERVICE_ROLE_KEY_LINE" ]; then
      export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY_LINE#SUPABASE_SERVICE_ROLE_KEY=}"
    fi
  fi
fi

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  if [ -f "$WORKSPACE_DIR/.env" ]; then
    SUPABASE_SERVICE_ROLE_KEY_LINE=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$WORKSPACE_DIR/.env" || true)
    if [ -n "$SUPABASE_SERVICE_ROLE_KEY_LINE" ]; then
      export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY_LINE#SUPABASE_SERVICE_ROLE_KEY=}"
    fi
  fi
fi

# Normalize: strip surrounding quotes if present (dotenv-style)
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY%\"}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY#\"}"
export SUPABASE_SERVICE_ROLE_KEY

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "❌ SUPABASE_SERVICE_ROLE_KEY not found in .env.supabase or .env"
  exit 1
fi

# Run the sync script
cd "$WORKSPACE_DIR"
node "$SCRIPT_DIR/sync-system-status.js"
