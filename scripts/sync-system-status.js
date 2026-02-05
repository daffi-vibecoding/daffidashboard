#!/usr/bin/env node
/**
 * OpenClaw System Status Sync Script
 * Pushes current OpenClaw config/sessions to Supabase every 10 minutes
 * This is a DUMB SCRIPT - no AI, just data movement
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
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
