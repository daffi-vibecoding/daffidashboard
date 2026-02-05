#!/bin/bash
# System Status Sync Wrapper
# Loads credentials and runs the sync script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(dirname "$SCRIPT_DIR")"

# Load Supabase credentials
if [ -f "$WORKSPACE_DIR/.env.supabase" ]; then
  export SUPABASE_SERVICE_ROLE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY "$WORKSPACE_DIR/.env.supabase" | cut -d= -f2)
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ SUPABASE_SERVICE_ROLE_KEY not found in .env.supabase"
  exit 1
fi

# Run the sync script
cd "$WORKSPACE_DIR"
node "$SCRIPT_DIR/sync-system-status.js"
