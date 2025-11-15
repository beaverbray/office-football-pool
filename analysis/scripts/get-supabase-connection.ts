#!/usr/bin/env tsx
/**
 * Generate Supabase connection string from environment variables
 */

import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabasePassword = process.env.SUPABASE_PASSWORD

if (!supabaseUrl || !supabasePassword) {
  console.error('❌ Missing required environment variables')
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_PASSWORD are set in .env')
  process.exit(1)
}

// Extract project reference from Supabase URL
// Format: https://PROJECT_REF.supabase.co
const urlMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)
if (!urlMatch) {
  console.error('❌ Invalid NEXT_PUBLIC_SUPABASE_URL format')
  console.error('Expected format: https://PROJECT_REF.supabase.co')
  process.exit(1)
}

const projectRef = urlMatch[1]

// Determine region from project ref (usually first part before hyphen)
// Common formats: abc-def-ghi or just abc
const region = 'us-east-1' // Default, adjust if your project is in a different region

// Generate connection string
const connectionString = `postgresql://postgres.${projectRef}:${supabasePassword}@aws-0-${region}.pooler.supabase.com:6543/postgres`

console.log('\n✅ Supabase Connection String:')
console.log(connectionString)
console.log('\n📋 Copy this to your .mcp.json supabase server args')
console.log('\nOr add to .env as:')
console.log(`SUPABASE_DATABASE_URL="${connectionString}"`)
