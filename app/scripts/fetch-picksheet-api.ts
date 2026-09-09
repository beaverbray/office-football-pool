#!/usr/bin/env npx tsx
/**
 * Fetch the picksheet from the Splash Sports API and persist it.
 *
 * Replaces scripts/fetch-picksheet.ts (officefootballpool.com + Puppeteer).
 * No browser, no HTML parsing, no weekId arithmetic: the slate list tells us
 * which week is current, and games arrive structured.
 *
 * Because games arrive structured, this writes them straight into
 * `pipeline_data.parsing.games` — the shape `extractPicksheetGames()` in
 * /api/refresh-all already consumes — so the regex/LLM parsers are bypassed.
 *
 *   npm --prefix app run fetch-picksheet:api
 *   npm --prefix app run fetch-picksheet:api -- --dry-run
 *   npm --prefix app run fetch-picksheet:api -- --slate=week_3
 *
 * Env: SPLASH_CONTEST_ID, SPLASH_ENTRY_ID, SUPABASE_URL,
 *      SUPABASE_SERVICE_ROLE_KEY, optional APP_URL
 *
 * TOKEN MODEL IN CI: a workflow cannot write back to its own secret, so the
 * stored token pair stays at its login-time value. Refresh needs both tokens;
 * an 8-day-stale access token was observed to still refresh, but the outer
 * bound is unknown. The contract is therefore a periodic (~monthly) `npm run
 * login` plus a secret update, and an unmistakable exit on auth failure.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import {
  refreshAccessToken,
  getSlates,
  getPicksheet,
  normalizeGames,
  toSourceGames,
  SplashAuthError,
  type SplashSlate,
  type PipelineSourceGame
} from '@/services/splash-api'
import { loadSession, saveSession } from './lib/session'

/** Deliberate no-op: nothing to fetch, must not fail the scheduled job. */
class NothingToDo extends Error {}

interface Outcome {
  success: boolean
  skipped: boolean
  slate?: string
  week?: number
  games: number
  durationMs: number
  error?: string
}

function supabase() {
  // afbp, not public: migration 009 moved these tables. A default-schema
  // client fails every write with PGRST205.
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: 'afbp' }
  })
}

/** `week_1` -> 1, so picksheet_fetch_log stays queryable by week. */
function weekFromAbbreviation(abbr: string): number {
  const m = abbr.match(/(\d+)/)
  return m ? Number(m[1]) : 0
}

async function persist(
  slate: SplashSlate,
  sourceGames: PipelineSourceGame[],
  contestId: string
): Promise<void> {
  const { error } = await supabase()
    .from('pipeline_current')
    .upsert({
      id: 'current',
      // Deliberately null. Both /api/pipeline/refresh and /api/refresh-all read
      // pipeline_data.parsing.games FIRST and only fall back to picksheet_text +
      // LLM parsing when it is absent. Writing a rendering here would give that
      // fallback a string that is not in picksheet format to re-parse.
      picksheet_text: null,
      // parsing.games is what both readers consume, so the structured data goes
      // straight in and the regex/LLM parsers are bypassed entirely.
      pipeline_data: {
        parsing: { success: true, gamesFound: sourceGames.length, games: sourceGames },
        source: 'splash-api'
      },
      updated_at: new Date().toISOString(),
      metadata: {
        source: 'splash-api',
        contestId,
        slateId: slate.id,
        slateName: slate.name,
        fetchedAt: new Date().toISOString()
      }
    })

  if (error) throw new Error(`Failed to save picksheet: ${error.message}`)
}

async function logResult(outcome: Outcome, source: string): Promise<void> {
  const { error } = await supabase().from('picksheet_fetch_log').insert({
    week_id: 0,
    nfl_week: outcome.week ?? 0,
    season: new Date().getFullYear(),
    success: outcome.success,
    error_message: outcome.error ?? null,
    duration_ms: outcome.durationMs,
    source,
    picksheet_length: outcome.games
  })
  if (error) console.warn('Failed to log fetch result:', error.message)
}

async function triggerRefresh(): Promise<void> {
  const appUrl = process.env.APP_URL
  if (!appUrl) {
    console.log('APP_URL not set, skipping refresh trigger')
    return
  }
  const res = await fetch(`${appUrl}/api/refresh-all`, { method: 'POST' })
  console.log(res.ok ? 'Refresh triggered' : `Refresh trigger returned ${res.status}`)
}

async function main(): Promise<void> {
  const started = Date.now()
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const slateArg = args.find(a => a.startsWith('--slate='))?.split('=')[1]
  const source = process.env.GITHUB_ACTIONS ? 'github_actions' : 'manual'

  let outcome: Outcome = { success: false, skipped: false, games: 0, durationMs: 0 }

  try {
    const contestId = process.env.SPLASH_CONTEST_ID
    const entryId = process.env.SPLASH_ENTRY_ID
    if (!contestId || !entryId) {
      throw new Error(
        'Missing SPLASH_CONTEST_ID and/or SPLASH_ENTRY_ID. Both appear in the picksheet URL: ' +
        'contests.app.splashsports.com/team-pickem/contests/<CONTEST_ID>/picks?entryId=<ENTRY_ID>'
      )
    }
    if (!dryRun && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      throw new Error('Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY')
    }

    const session = await loadSession()
    if (!session) {
      throw new SplashAuthError('No saved session. Create one with: npm run login')
    }
    const accessToken = session.cookies.find(c => c.name === 'accessToken')?.value
    const refreshToken = session.cookies.find(c => c.name === 'refreshToken')?.value
    if (!accessToken || !refreshToken) {
      throw new SplashAuthError('Saved session has no Splash tokens. Re-run: npm run login')
    }

    const token = await refreshAccessToken({ accessToken, refreshToken })

    // Locally this keeps the stored token current. In CI the session comes from
    // a secret and this write is discarded with the runner — see TOKEN MODEL.
    session.cookies = session.cookies.map(c =>
      c.name === 'accessToken' ? { ...c, value: token } : c
    )
    session.savedAt = new Date().toISOString()
    await saveSession(session).catch(() => { /* read-only FS in CI is fine */ })

    const slates = await getSlates(token, contestId)
    const slate = slateArg
      ? slates.find(s => s.abbreviation === slateArg || s.id === slateArg)
      : slates.find(s => s.isCurrentSlate)

    if (!slate) {
      if (slateArg) {
        throw new Error(`No slate matching "${slateArg}". Available: ${slates.map(s => s.abbreviation).join(', ')}`)
      }
      throw new NothingToDo('No slate is currently marked current by the pool.')
    }

    const picksheet = await getPicksheet(token, { contestId, slateId: slate.id, entryId })
    const games = normalizeGames(picksheet)
    const priced = games.filter(g => g.spread !== null)

    console.log(`${slate.name} (${slate.abbreviation}) — ${games.length} games, ${priced.length} with a spread`)

    if (games.length === 0) {
      throw new NothingToDo(`Slate ${slate.abbreviation} has no games posted yet.`)
    }
    if (priced.length === 0) {
      throw new NothingToDo(`Slate ${slate.abbreviation} has games but no spreads posted yet.`)
    }

    const sourceGames = toSourceGames(picksheet)
    outcome = {
      success: true,
      skipped: false,
      slate: slate.abbreviation,
      week: weekFromAbbreviation(slate.abbreviation),
      games: sourceGames.length,
      durationMs: 0
    }

    if (dryRun) {
      console.log('[DRY RUN] would persist to afbp.pipeline_current and trigger refresh')
    } else {
      await persist(slate, sourceGames, contestId)
      console.log('Saved to afbp.pipeline_current')
      await triggerRefresh()
    }
  } catch (error) {
    const skipped = error instanceof NothingToDo
    outcome = {
      ...outcome,
      success: false,
      skipped,
      error: error instanceof Error ? error.message : String(error)
    }
    if (skipped) {
      console.log('Skipped:', outcome.error)
    } else if (error instanceof SplashAuthError) {
      console.error('\nAuthentication required:', outcome.error)
      console.error('  Re-authenticate:  npm --prefix app run login')
      console.error('  Then update the PICKSHEET_SESSION_B64 secret:')
      console.error('                    npm --prefix app run login -- --print-b64')
    } else {
      console.error('Failed:', outcome.error)
    }
  }

  outcome.durationMs = Date.now() - started
  if (!dryRun && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await logResult(outcome, source)
  }

  console.log(`Result: ${outcome.success ? 'SUCCESS' : outcome.skipped ? 'SKIPPED' : 'FAILED'} (${(outcome.durationMs / 1000).toFixed(1)}s)`)
  // A deliberate skip must not fail the scheduled job.
  process.exit(outcome.success || outcome.skipped ? 0 : 1)
}

main().catch(error => {
  console.error('Unhandled error:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
