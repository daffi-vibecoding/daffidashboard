#!/usr/bin/env node
import { execSync } from 'node:child_process';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_EMAIL = (process.env.TARGET_EMAIL || '').trim().toLowerCase();

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL).');
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (!TARGET_EMAIL) {
  console.error('Missing TARGET_EMAIL (the allowlisted user to sync jobs into).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function runCronList() {
  const raw = execSync('openclaw cron list --all --json', { encoding: 'utf8' });
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.jobs) ? parsed.jobs : [];
}

async function resolveUserIdByEmail(email) {
  // Service-role required.
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;

  const match = (data?.users || []).find((u) => String(u.email || '').toLowerCase() === email);
  if (!match) {
    throw new Error(
      `No Supabase auth user found for ${email}. Have them sign in once (magic link) so the user exists.`
    );
  }
  return match.id;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function main() {
  const jobs = runCronList();
  const userId = await resolveUserIdByEmail(TARGET_EMAIL);

  const rows = jobs.map((job) => {
    const name = job.name || job.id || job.job || 'unnamed';
    return {
      user_id: userId,
      name,
      schedule: job.schedule || job.cron || null,
      enabled: job.enabled !== false,
      description: job.description || job.desc || null,
      last_run_at: toIsoOrNull(job.last_run_at || job.lastRunAt || job.last_run),
      next_run_at: toIsoOrNull(job.next_run_at || job.nextRunAt || job.next_run),
      raw_payload: job,
      updated_at: new Date().toISOString(),
    };
  });

  if (!rows.length) {
    console.log('No OpenClaw cron jobs found to sync.');
    return;
  }

  const { error } = await supabase.from('cron_jobs').upsert(rows, {
    onConflict: 'user_id,name',
  });

  if (error) throw error;
  console.log(`Synced ${rows.length} cron jobs into Supabase for ${TARGET_EMAIL}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
