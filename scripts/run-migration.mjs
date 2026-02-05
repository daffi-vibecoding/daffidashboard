#!/usr/bin/env node
import { readFileSync } from 'fs';
import postgres from 'postgres';

const connectionString = `postgresql://postgres.gatnjthisbqtvbjbqcqh:${process.env.SUPABASE_SERVICE_ROLE_KEY}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

const sql = postgres(connectionString, {
  ssl: 'require'
});

try {
  const migration = readFileSync('supabase/seed.sql', 'utf-8');
  await sql.unsafe(migration);
  console.log('✅ Migration completed successfully!');
  process.exit(0);
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
