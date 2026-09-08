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

import 'dotenv/config'
// puppeteer-extra + stealth, NOT plain puppeteer: officefootballpool.com sits
// behind a CloudFront WAF that fingerprints headless Chrome. Plain puppeteer
// advertises `HeadlessChrome/xxx` in its UA and `navigator.webdriver === true`,
// and the WAF answers with a 403 "Request blocked" page. (Plain curl gets 200,
// so this is headless detection, not UA filtering.) The stealth plugin patches
// those tells.
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { createClient } from '@supabase/supabase-js'
import { WeekDetector } from '@/services/week-detector'
import { loadSession, restoreSession, describeSessionAge } from './lib/session'
import {
  assertLooksLikePicksheet,
  PicksheetAuthError,
  PicksheetNotReadyError
} from './lib/picksheet-content'

puppeteer.use(StealthPlugin())

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
  /**
   * True when the run deliberately did nothing (e.g. it is not the regular
   * season). A skip is not a failure: it must not fail the scheduled job,
   * otherwise the weekly cron reports red for the whole off-season and real
   * failures get lost in the noise.
   */
  skipped?: boolean
  weekId: number
  nflWeek: number
  season: number
  picksheetLength?: number
  error?: string
  durationMs: number
}

/** Thrown to abort the run as a deliberate no-op rather than a failure. */
class SeasonSkip extends Error {}

/** Thrown when no saved session exists; the fix is `npm run login`, not a retry. */
class SessionMissingError extends Error {}

/**
 * Get the current NFL week via the shared WeekDetector.
 *
 * This deliberately reuses src/services/week-detector.ts rather than making its
 * own ESPN call: this script previously duplicated that fetch and, like the
 * original, ignored ESPN's `season.type`. That meant during preseason it read
 * "week 3" and computed a weekId ~2 weeks off, silently fetching the wrong
 * picksheet. One implementation, one place to get the season phase right.
 */
async function getCurrentWeek(): Promise<{ week: number; season: number; seasonType: string; isRegularSeason: boolean }> {
  console.log('Detecting current NFL week...')

  const info = await WeekDetector.getCurrentNFLWeek()

  console.log(
    `Current NFL week: ${info.week}, season: ${info.seasonYear} ` +
    `(phase: ${info.seasonType}${info.rawWeek !== info.week ? `, ESPN raw week: ${info.rawWeek}` : ''})`
  )

  return {
    week: info.week,
    season: info.seasonYear,
    seasonType: info.seasonType,
    isRegularSeason: info.isRegularSeason
  }
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
 * Fetch the picksheet using a previously saved, human-established session.
 *
 * There is deliberately no automated login here. The Splash Sports sign-in page
 * is reCAPTCHA-protected, and an automated login cannot complete it (verified:
 * both synthetic and trusted clicks finish with no session cookie and no error).
 * A human runs `npm run login` once; this reuses that session.
 */
async function fetchPicksheet(weekId: number): Promise<string> {
  const session = await loadSession()
  if (!session) {
    throw new SessionMissingError(
      `No saved session found. Create one with:  npm run login\n` +
      `  (or provide PICKSHEET_SESSION_B64 for scheduled runs)`
    )
  }

  const age = describeSessionAge(session)
  console.log(`Using saved session (${age.text}, from ${session.savedAt})`)
  if (age.ageDays >= 14) {
    console.warn(`  WARNING: session is ${age.ageDays} days old and may have expired.`)
  }

  console.log(`Launching browser to fetch weekId: ${weekId}`)
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })

    console.log('Restoring session...')
    await restoreSession(browser, page, session)

    const picksheetUrl = `https://www.officefootballpool.com/picksheet_print.cfm?weekid=${weekId}`
    console.log(`Navigating to picksheet: ${picksheetUrl}`)
    await page.goto(picksheetUrl, { waitUntil: 'networkidle2', timeout: 45000 })

    await page.waitForSelector('body', { timeout: 10000 })

    // Extract picksheet text
    console.log('Extracting picksheet text...')
    const picksheetText = await page.evaluate(() => {
      return document.body.innerText
    })

    assertLooksLikePicksheet(picksheetText, weekId)

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

  // Both target tables live in the `afbp` schema (moved out of `public` by
  // migration 009_afbp_schema_migration.sql). Without this the client defaults
  // to `public` and every write fails with PGRST205 "table not found".
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'afbp' } }
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
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'afbp' } }
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
  // --force bypasses the regular-season guard below.
  const force = args.includes('--force')

  console.log('='.repeat(60))
  console.log('Picksheet Fetch Script')
  console.log('='.repeat(60))
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Source: ${source}`)
  console.log('')

  // Normalize env vars (support both SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL)
  if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  }

  // Validate environment
  // NOTE: OFFICE_POOL_EMAIL / OFFICE_POOL_PASSWORD are deliberately NOT required
  // here. This script no longer logs in — it replays a session created by
  // `npm run login`. Those credentials are only used by that interactive script.
  // Requiring them here would hard-fail CI, which supplies PICKSHEET_SESSION_B64
  // and no credentials.
  const requiredEnvVars = [
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

      // Refuse to fetch outside the regular season. Off-season/preseason/postseason
      // week numbers do not map onto the pool's weekIds, so proceeding would
      // silently store the wrong week's picksheet. An explicit --week=N override
      // (or --force) is the way to run deliberately outside the regular season.
      if (!weekData.isRegularSeason && !force) {
        throw new SeasonSkip(
          `Not in the NFL regular season (phase: ${weekData.seasonType}). ` +
          `Skipping picksheet fetch, since off-season week numbers would ` +
          `resolve to the wrong weekId. Re-run with --week=N to target a ` +
          `specific week, or --force to override this check.`
        )
      }
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
    // Two distinct "nothing to do" conditions, neither of which is a failure:
    //   SeasonSkip             -> not the regular season
    //   PicksheetNotReadyError -> in season and authenticated, but the pool
    //                             manager has not posted this week's schedule
    const skipped =
      error instanceof SeasonSkip || error instanceof PicksheetNotReadyError
    // A missing or expired session is a "needs a human" condition, not a bug.
    // Call it out separately so the log says what to actually do about it.
    const needsLogin =
      error instanceof SessionMissingError || error instanceof PicksheetAuthError

    result = {
      success: false,
      skipped,
      weekId: 0,
      nflWeek: 0,
      season: 0,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime
    }

    if (skipped) {
      console.log('\nSkipped:', result.error)
    } else if (needsLogin) {
      console.error('\nAuthentication required:', result.error)
      console.error('\n  Fix: run `npm run login` to create/refresh the saved session.')
      console.error('  For scheduled runs, update the PICKSHEET_SESSION_B64 secret')
      console.error('  using: npm run login -- --print-b64')
    } else {
      console.error('\nFetch failed:', result.error)
    }
  }

  // Log result (unless dry run)
  if (!dryRun) {
    await logFetchResult(result, source)
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('Summary')
  console.log('='.repeat(60))
  console.log(`Result: ${result.success ? 'SUCCESS' : result.skipped ? 'SKIPPED' : 'FAILED'}`)
  console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`)
  if (result.success) {
    console.log(`Week ID: ${result.weekId}`)
    console.log(`NFL Week: ${result.nflWeek}`)
    console.log(`Picksheet Length: ${result.picksheetLength} chars`)
  } else {
    console.log(`${result.skipped ? 'Reason' : 'Error'}: ${result.error}`)
  }

  // Exit code: a deliberate skip is not a failure, so it must not fail the cron.
  process.exit(result.success || result.skipped ? 0 : 1)
}

main().catch(error => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
