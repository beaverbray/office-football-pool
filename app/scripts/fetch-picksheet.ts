#!/usr/bin/env npx tsx
/**
 * Fetch Picksheet Script
 *
 * Fetches the weekly picksheet from officefootballpool.com using Puppeteer.
 * Designed to run in GitHub Actions on a schedule (Thursday 6PM PT).
 *
 * Usage: npx tsx scripts/fetch-picksheet.ts [--dry-run] [--week=N]
 *
 * Environment Variables:
 *   OFFICE_POOL_EMAIL - Login email for splashsports.com
 *   OFFICE_POOL_PASSWORD - Login password
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key
 *   APP_URL - (Optional) Production app URL to trigger refresh
 */

import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'

// Week ID calculation reference point
// Week 14, 2024 season = weekId 648
const REFERENCE = { weekId: 648, nflWeek: 14, season: 2024 }

interface WeekInfo {
  week: number
  season: number
  weekId: number
}

interface FetchResult {
  success: boolean
  weekId: number
  nflWeek: number
  season: number
  picksheetLength?: number
  error?: string
  durationMs: number
}

/**
 * Get current NFL week from ESPN API
 */
async function getCurrentWeek(): Promise<{ week: number; season: number }> {
  console.log('Fetching current NFL week from ESPN...')

  const response = await fetch(
    'http://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
  )

  if (!response.ok) {
    throw new Error(`ESPN API returned ${response.status}`)
  }

  const data = await response.json()
  const week = data.week?.number ?? 1
  const season = data.season?.year ?? new Date().getFullYear()

  console.log(`Current NFL week: ${week}, season: ${season}`)
  return { week, season }
}

/**
 * Calculate weekId for officefootballpool.com
 */
function calculateWeekId(nflWeek: number, season: number): number {
  const weeksSinceReference =
    ((season - REFERENCE.season) * 18) + (nflWeek - REFERENCE.nflWeek)
  return REFERENCE.weekId + weeksSinceReference
}

/**
 * Fetch picksheet using Puppeteer
 */
async function fetchPicksheet(weekId: number): Promise<string> {
  console.log(`Launching browser to fetch weekId: ${weekId}`)

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  try {
    const page = await browser.newPage()

    // Set a reasonable viewport
    await page.setViewport({ width: 1280, height: 800 })

    // Login to splashsports.com
    console.log('Navigating to login page...')
    await page.goto('https://app.splashsports.com/sign-in', {
      waitUntil: 'networkidle2',
      timeout: 30000
    })

    // Wait for login form
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 })

    console.log('Entering credentials...')
    await page.type('input[type="email"], input[name="email"]', process.env.OFFICE_POOL_EMAIL!)
    await page.type('input[type="password"], input[name="password"]', process.env.OFFICE_POOL_PASSWORD!)

    // Click login button
    await page.click('button[type="submit"]')

    // Wait for navigation after login
    console.log('Waiting for login to complete...')
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })

    // Navigate to picksheet
    const picksheetUrl = `https://www.officefootballpool.com/picksheet_print.cfm?weekid=${weekId}`
    console.log(`Navigating to picksheet: ${picksheetUrl}`)
    await page.goto(picksheetUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    })

    // Wait for content to load
    await page.waitForSelector('body', { timeout: 10000 })

    // Extract picksheet text
    console.log('Extracting picksheet text...')
    const picksheetText = await page.evaluate(() => {
      return document.body.innerText
    })

    if (!picksheetText || picksheetText.length < 100) {
      throw new Error('Picksheet text appears empty or too short')
    }

    console.log(`Extracted ${picksheetText.length} characters`)
    return picksheetText

  } finally {
    await browser.close()
  }
}

/**
 * Save picksheet to Supabase
 */
async function saveToSupabase(
  picksheetText: string,
  weekInfo: WeekInfo
): Promise<void> {
  console.log('Saving picksheet to Supabase...')

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Update pipeline_current with new picksheet
  const { error } = await supabase
    .from('pipeline_current')
    .upsert({
      id: 'current',
      picksheet_text: picksheetText,
      updated_at: new Date().toISOString(),
      // Clear pipeline_data to force re-processing
      pipeline_data: null
    })

  if (error) {
    throw new Error(`Failed to save picksheet: ${error.message}`)
  }

  console.log('Picksheet saved successfully')
}

/**
 * Log fetch result to database
 */
async function logFetchResult(result: FetchResult, source: string): Promise<void> {
  console.log('Logging fetch result...')

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await supabase
    .from('picksheet_fetch_log')
    .insert({
      week_id: result.weekId,
      nfl_week: result.nflWeek,
      season: result.season,
      success: result.success,
      error_message: result.error || null,
      duration_ms: result.durationMs,
      source,
      picksheet_length: result.picksheetLength || null
    })

  if (error) {
    console.warn('Failed to log fetch result:', error.message)
  }
}

/**
 * Trigger refresh-all endpoint
 */
async function triggerRefresh(): Promise<void> {
  const appUrl = process.env.APP_URL
  if (!appUrl) {
    console.log('APP_URL not set, skipping refresh trigger')
    return
  }

  console.log(`Triggering refresh at ${appUrl}/api/refresh-all...`)

  const response = await fetch(`${appUrl}/api/refresh-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })

  if (!response.ok) {
    console.warn(`Refresh trigger returned ${response.status}`)
  } else {
    const data = await response.json()
    console.log(`Refresh complete: ${data.message || 'success'}`)
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const startTime = Date.now()
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const source = process.env.GITHUB_ACTIONS ? 'github_actions' : 'manual'

  // Check for --week=N override
  const weekOverride = args.find(a => a.startsWith('--week='))

  console.log('='.repeat(60))
  console.log('Picksheet Fetch Script')
  console.log('='.repeat(60))
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Source: ${source}`)
  console.log('')

  // Validate environment
  const requiredEnvVars = [
    'OFFICE_POOL_EMAIL',
    'OFFICE_POOL_PASSWORD',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ]

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`)
    }
  }

  let result: FetchResult

  try {
    // Get current week
    let week: number
    let season: number

    if (weekOverride) {
      week = parseInt(weekOverride.split('=')[1], 10)
      season = new Date().getFullYear()
      console.log(`Using week override: ${week}`)
    } else {
      const weekData = await getCurrentWeek()
      week = weekData.week
      season = weekData.season
    }

    const weekId = calculateWeekId(week, season)
    console.log(`Calculated weekId: ${weekId}`)

    // Fetch picksheet
    const picksheetText = await fetchPicksheet(weekId)

    if (dryRun) {
      console.log('\n[DRY RUN] Would save picksheet:')
      console.log(picksheetText.substring(0, 500) + '...')
    } else {
      // Save to Supabase
      await saveToSupabase(picksheetText, { week, season, weekId })

      // Trigger refresh
      await triggerRefresh()
    }

    result = {
      success: true,
      weekId,
      nflWeek: week,
      season,
      picksheetLength: picksheetText.length,
      durationMs: Date.now() - startTime
    }

  } catch (error) {
    result = {
      success: false,
      weekId: 0,
      nflWeek: 0,
      season: 0,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime
    }

    console.error('\nFetch failed:', result.error)
  }

  // Log result (unless dry run)
  if (!dryRun) {
    await logFetchResult(result, source)
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('Summary')
  console.log('='.repeat(60))
  console.log(`Success: ${result.success}`)
  console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`)
  if (result.success) {
    console.log(`Week ID: ${result.weekId}`)
    console.log(`NFL Week: ${result.nflWeek}`)
    console.log(`Picksheet Length: ${result.picksheetLength} chars`)
  } else {
    console.log(`Error: ${result.error}`)
  }

  // Exit with appropriate code
  process.exit(result.success ? 0 : 1)
}

main().catch(error => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
