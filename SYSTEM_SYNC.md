# System Status Sync Setup

## What This Does

A **simple JavaScript script** (NOT an AI model) that:
- Reads your OpenClaw config file
- Pushes current status to Supabase
- Runs automatically every **10 minutes**
- Costs **$0** and uses **0 AI tokens**

## Setup Instructions

### 1. Run the SQL Migration Tonight (10 PM reminder set)

The `system_status` table is already added to your pending migration:
`/Users/daffi/.openclaw/workspace/dashboard/supabase/seed.sql`

Just paste the whole file into Supabase SQL Editor at 10 PM as planned.

### 2. Test the Script Manually (Do this now)

```bash
cd /Users/daffi/.openclaw/workspace/dashboard
./scripts/sync-status.sh
```

You should see:
```
🔄 Fetching OpenClaw status...
📊 Model: google/gemini-3-pro | Sessions: 0
✅ System status synced successfully
```

If you see errors, the script will tell you what's missing.

### 3. Set Up Cron Job (Every 10 Minutes)

**Option A: Using OpenClaw's Built-in Cron** (Recommended)

I can create an OpenClaw cron job that runs this script. Want me to set that up?

**Option B: Using System Cron** (Manual)

```bash
# Edit your crontab
crontab -e

# Add this line (runs every 10 minutes)
*/10 * * * * /Users/daffi/.openclaw/workspace/dashboard/scripts/sync-status.sh >> /tmp/daffi-sync.log 2>&1
```

## How to Check If It's Working

1. **Check the log** (if using system cron):
   ```bash
   tail -f /tmp/daffi-sync.log
   ```

2. **Check Supabase directly**:
   Go to Supabase → Table Editor → `system_status` → Should see one row with recent `updated_at`

3. **Check the dashboard**:
   Go to System tab → Should show your current model, sessions, etc.

## What Gets Synced

- **Model**: Current active model (e.g., `google/gemini-3-pro`)
- **Default Model**: Your configured default
- **Thinking Level**: low/medium/high
- **Sessions Count**: Number of active threads
- **Config**: Voice, reactions, channel settings
- **Runtime**: Host, OS, Node version, repository path

## Troubleshooting

**"Missing SUPABASE_SERVICE_ROLE_KEY"**
→ Your `.env.supabase` file is missing or the key isn't there. Check:
```bash
cat /Users/daffi/.openclaw/workspace/dashboard/.env.supabase
```

**"Could not read OpenClaw config"**
→ OpenClaw config file not found. Expected at:
```
~/.openclaw/config.json
```

**Script runs but dashboard shows "No data yet"**
→ Wait up to 10 minutes for the first sync, or run manually:
```bash
./scripts/sync-status.sh
```

## Files Created

- `scripts/sync-system-status.js` - The actual sync script (Node.js)
- `scripts/sync-status.sh` - Wrapper that loads credentials
- `supabase/seed.sql` - Updated with `system_status` table

## Cost

- **Storage**: ~1KB per day (365KB/year)
- **API calls**: 144/day (every 10 min × 24h)
- **Price**: $0 (well within Supabase free tier)

## Next Steps

1. ✅ Test manually: `./scripts/sync-status.sh`
2. ⏰ Run SQL migration tonight (10 PM reminder)
3. 🤖 Choose cron method (OpenClaw or system)
4. 📊 Check System tab on dashboard
