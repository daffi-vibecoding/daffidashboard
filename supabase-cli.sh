#!/bin/bash
# Supabase CLI wrapper with auto-authentication
# Usage: ./supabase-cli.sh <command> [args...]

set -e

# Load environment variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/.env.supabase"

# Export the access token
export SUPABASE_ACCESS_TOKEN

# Run the supabase command
cd "$SCRIPT_DIR"
supabase "$@"
