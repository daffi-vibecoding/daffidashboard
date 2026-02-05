# Supabase API & CLI Access

## Setup Complete ✅

- **Access Token Created:** 2026-02-05 (expires 2026-03-07)
- **Project Linked:** `gatnjthisbqtvbjbqcqh`
- **CLI Version:** 2.75.0

## Quick Access

### Option 1: Use the Wrapper Script
```bash
./supabase-cli.sh projects list
./supabase-cli.sh functions list
./supabase-cli.sh db dump
```

### Option 2: Direct CLI (auto-loads from .env.supabase)
```bash
export SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN .env.supabase | cut -d= -f2)
supabase projects list
```

## Management API Examples

### Get Project Info
```bash
curl -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  https://api.supabase.com/v1/projects/gatnjthisbqtvbjbqcqh
```

### Update Auth Settings (Rate Limits, etc.)
```bash
curl -X PATCH \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"config": {"rate_limit_email": 10}}' \
  https://api.supabase.com/v1/projects/gatnjthisbqtvbjbqcqh/config/auth
```

### Update Email Templates
```bash
curl -X PUT \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "template_name": "magic_link",
    "subject": "Your Code",
    "body": "<h2>Code: {{ .Token }}</h2>"
  }' \
  https://api.supabase.com/v1/projects/gatnjthisbqtvbjbqcqh/config/auth/templates/magic_link
```

## Common CLI Commands

### Database Operations
```bash
./supabase-cli.sh db dump > backup.sql
./supabase-cli.sh db push  # Apply local migrations
./supabase-cli.sh db diff  # Show schema differences
```

### Functions
```bash
./supabase-cli.sh functions deploy <function-name>
./supabase-cli.sh functions list
./supabase-cli.sh functions delete <function-name>
```

### Migrations
```bash
./supabase-cli.sh migration new create_tables
./supabase-cli.sh db reset  # Reset local DB (requires Docker)
```

## Security Notes

- ⚠️ **Never commit `.env.supabase`** — it's already in `.gitignore`
- ✅ Token expires on **2026-03-07** — renew before then
- ✅ Token has **full account access** — treat it like a password
- ✅ For CI/CD, create separate tokens with limited scope

## API Documentation

- **Management API:** https://supabase.com/docs/reference/api/introduction
- **CLI Reference:** https://supabase.com/docs/reference/cli/start
- **Auth API:** https://supabase.com/docs/reference/javascript/auth-signup

## Next Time: No More Browser Clicking! 🎉

Instead of clicking through Supabase dashboards:
- Update auth settings via API
- Change email templates via API  
- Manage rate limits via API
- Deploy functions via CLI
- Run migrations via CLI

All scriptable, all automatable! 🚀
