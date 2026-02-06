#!/usr/bin/env node
/**
 * Push local JSONL events into public.system_events.
 * Safe/idempotent by tracking last pushed timestamp + hashes in a local state file.
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gatnjthisbqtvbjbqcqh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STATE_PATH = process.env.SYSTEM_EVENTS_STATE_PATH || join(process.cwd(), 'data', 'system-events-state.json');

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function toDate(value) {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getEventHash(event) {
  const base = `${event.ts}|${event.source || ''}|${event.level || ''}|${event.message || ''}`;
  return createHash('sha1').update(base).digest('hex');
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { last_ts: null, last_hashes: [] };
  try {
    const data = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
    return {
      last_ts: data.last_ts || null,
      last_hashes: Array.isArray(data.last_hashes) ? data.last_hashes : [],
    };
  } catch {
    return { last_ts: null, last_hashes: [] };
  }
}

function saveState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function getEventPaths() {
  if (process.env.LOCAL_EVENTS_PATHS) {
    return process.env.LOCAL_EVENTS_PATHS
      .split(',')
      .map((path) => path.trim())
      .filter(Boolean);
  }

  if (process.env.LOCAL_EVENTS_PATH) {
    return [process.env.LOCAL_EVENTS_PATH];
  }

  return [
    join(homedir(), 'mail', 'state', 'local-events.jsonl'),
    join(process.cwd(), 'data', 'local-events.jsonl'),
  ];
}

function readEvents(paths) {
  const events = [];
  paths.forEach((path) => {
    if (!existsSync(path)) return;
    const lines = readFileSync(path, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    lines.forEach((line) => {
      try {
        const parsed = JSON.parse(line);
        if (!parsed?.ts || !parsed?.message) return;
        events.push({
          ts: parsed.ts,
          source: parsed.source || 'unknown',
          level: parsed.level || 'info',
          message: parsed.message,
        });
      } catch {
        // skip malformed lines
      }
    });
  });
  return events;
}

async function pushEvents() {
  const state = loadState();
  const eventPaths = getEventPaths();
  const events = readEvents(eventPaths);

  if (!events.length) {
    console.log('ℹ️  No local events found to push.');
    return;
  }

  const lastTsDate = toDate(state.last_ts);
  const lastHashes = new Set(state.last_hashes || []);
  const filtered = events.filter((event) => {
    const eventDate = toDate(event.ts);
    if (!eventDate) return false;
    if (!lastTsDate) return true;
    if (eventDate > lastTsDate) return true;
    if (eventDate.getTime() === lastTsDate.getTime()) {
      return !lastHashes.has(getEventHash(event));
    }
    return false;
  });

  filtered.sort((a, b) => toDate(a.ts) - toDate(b.ts));

  const MAX_BATCH = 200;
  const batch = filtered.slice(0, MAX_BATCH);

  if (!batch.length) {
    console.log('ℹ️  No new events to push.');
    return;
  }

  const { error } = await supabase
    .from('system_events')
    .insert(batch);

  if (error) {
    console.error('❌ Supabase error:', error.message);
    process.exit(1);
  }

  const maxEvent = batch.reduce((acc, evt) => {
    const date = toDate(evt.ts);
    if (!acc) return { evt, date };
    return date > acc.date ? { evt, date } : acc;
  }, null);

  if (maxEvent) {
    const maxTs = maxEvent.evt.ts;
    const maxTsDate = toDate(maxTs);
    const maxHashes = batch
      .filter((evt) => toDate(evt.ts).getTime() === maxTsDate.getTime())
      .map((evt) => getEventHash(evt));
    saveState({
      last_ts: maxTs,
      last_hashes: Array.from(new Set(maxHashes)).slice(-100),
    });
  }

  console.log(`✅ Pushed ${batch.length} events.`);
}

pushEvents();
