import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const execFileAsync = promisify(execFile);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function runOpenClaw(args) {
  const { stdout } = await execFileAsync(OPENCLAW_BIN, args, { maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

function parseJobs(output) {
  if (!output) return [];
  const trimmed = output.trim();

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (parsed?.jobs && Array.isArray(parsed.jobs)) return parsed.jobs;
  }

  const lines = trimmed.split('\n').filter((line) => line.trim());
  if (lines.length <= 1) return [];
  const rows = lines.slice(1);
  return rows.map((line) => {
    const parts = line.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
    return {
      name: parts[0] || 'unknown',
      schedule: parts[1] || '',
      enabled: parts[2]?.toLowerCase().includes('true') || parts[2]?.toLowerCase().includes('enabled'),
      description: parts.slice(3).join(' ') || null,
    };
  });
}

function normalizeJob(job) {
  return {
    name: job.name || job.id || 'unnamed',
    schedule: job.schedule || job.cron || '',
    enabled: job.enabled ?? job.active ?? true,
    description: job.description || job.summary || null,
    last_run_at: job.last_run_at || job.lastRunAt || job.last_run || null,
    next_run_at: job.next_run_at || job.nextRunAt || job.next_run || null,
    raw_payload: job.raw_payload || job.payload || job,
  };
}

async function main() {
  let output = '';
  try {
    output = await runOpenClaw(['cron', 'list', '--json']);
  } catch (err) {
    console.warn('openclaw cron list --json failed, falling back to plain output');
    output = await runOpenClaw(['cron', 'list']);
  }

  const jobs = parseJobs(output).map(normalizeJob);

  if (!jobs.length) {
    console.log('No cron jobs found.');
    return;
  }

  const { error } = await supabase
    .from('cron_jobs')
    .upsert(jobs, { onConflict: 'name' });

  if (error) {
    console.error('Failed to upsert cron jobs:', error.message);
    process.exit(1);
  }

  console.log(`Upserted ${jobs.length} cron jobs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
