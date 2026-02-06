#!/usr/bin/env node
/**
 * OpenClaw System Status Sync Script
 * Pushes current OpenClaw config/sessions to Supabase every 10 minutes
 * This is a DUMB SCRIPT - no AI, just data movement
 */

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gatnjthisbqtvbjbqcqh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getOpenClawStatus() {
  const status = {
    timestamp: new Date().toISOString(),
    model: 'unknown',
    default_model: 'unknown',
    thinking: 'unknown',
    sessions_count: 0,
    sessions: [],
    config: {},
    runtime: {},
    email: {},
  };

  try {
    // Read OpenClaw config
    const configPath = join(homedir(), '.openclaw', 'config.json');
    const configData = JSON.parse(readFileSync(configPath, 'utf8'));
    
    status.model = configData.model || 'unknown';
    status.default_model = configData.defaultModel || 'unknown';
    status.thinking = configData.thinking || 'low';
    status.config = {
      voice: configData.voice || false,
      reactions: configData.reactions || 'none',
      channel: configData.channel || 'unknown',
    };
    
    // Runtime info (if available in config)
    if (configData.runtime) {
      status.runtime = configData.runtime;
    }
  } catch (error) {
    console.warn('⚠️  Could not read OpenClaw config:', error.message);
  }

  try {
    // Try to fetch active sessions (if gateway is available)
    // This would require OpenClaw gateway API access
    // For now, we'll just report 0 until we set up the API
    status.sessions_count = 0;
    status.sessions = [];
  } catch (error) {
    console.warn('⚠️  Could not fetch sessions:', error.message);
  }

  // Email intake status (Fastmail receiver writes this locally)
  try {
    const emailStatusPaths = [
      process.env.FASTMAIL_STATUS_PATH,
      join(homedir(), 'mail', 'state', 'fastmail_receiver_last.json'),
      join(homedir(), 'workspace-telegram', 'mail', 'state', 'fastmail_receiver_last.json'),
      join(process.cwd(), 'mail', 'state', 'fastmail_receiver_last.json'),
      join(process.cwd(), '..', 'workspace-telegram', 'mail', 'state', 'fastmail_receiver_last.json'),
    ].filter(Boolean);

    let emailData = null;
    for (const candidate of emailStatusPaths) {
      if (!existsSync(candidate)) continue;
      emailData = JSON.parse(readFileSync(candidate, 'utf8'));
      if (emailData) break;
    }
    status.email = emailData || { error: 'no-local-email-status' };
  } catch (error) {
    status.email = { error: 'no-local-email-status', detail: error.message };
  }

  // Optional: capture local event summary if available
  try {
    const localEventPaths = [
      process.env.LOCAL_EVENTS_PATH,
      join(homedir(), 'mail', 'state', 'local-events.jsonl'),
      join(process.cwd(), 'data', 'local-events.jsonl'),
    ].filter(Boolean);

    let eventsPath = null;
    for (const candidate of localEventPaths) {
      if (existsSync(candidate)) {
        eventsPath = candidate;
        break;
      }
    }

    if (eventsPath) {
      const lines = readFileSync(eventsPath, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const recent = lines.slice(-25).map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);
      const lastEvent = recent[recent.length - 1] || null;
      status.runtime = {
        ...status.runtime,
        local_events: {
          path: eventsPath,
          count: recent.length,
          last_ts: lastEvent?.ts || null,
        },
      };
    }
  } catch (error) {
    status.runtime = {
      ...status.runtime,
      local_events: { error: error.message },
    };
  }

  return status;
}

async function syncToSupabase() {
  try {
    console.log('🔄 Fetching OpenClaw status...');
    const status = await getOpenClawStatus();
    
    console.log(`📊 Model: ${status.model} | Sessions: ${status.sessions_count}`);
    
    // Insert into system_status table (upsert with single row)
    const { error } = await supabase
      .from('system_status')
      .upsert({
        id: 1, // Always update the same row
        ...status,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('❌ Supabase error:', error.message);
      process.exit(1);
    }

    console.log('✅ System status synced successfully');
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    process.exit(1);
  }
}

// Run sync
syncToSupabase();
