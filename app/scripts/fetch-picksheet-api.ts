#!/usr/bin/env npx tsx
/**
 * Fetch the picksheet from the Splash Sports API — no browser, no scraping.
 *
 * Replaces the officefootballpool.com Puppeteer scrape. Reads the saved session
 * for tokens, refreshes the access token, resolves the current slate, and pulls
 * the picksheet.
 *
 * This deliberately does NOT write to the database yet: run it alongside the
 * existing scraper until parity is confirmed, then switch the pipeline over.
 *
 *   npm --prefix app run fetch-picksheet:api
 *   npm --prefix app run fetch-picksheet:api -- --slate=week_3
 *   npm --prefix app run fetch-picksheet:api -- --json
 *
 * Config (env): SPLASH_CONTEST_ID, SPLASH_ENTRY_ID
 */

import 'dotenv/config'
import {
  refreshAccessToken,
  getSlates,
  getPicksheet,
  normalizeGames,
  SplashAuthError
} from '@/services/splash-api'
import { loadSession, saveSession } from './lib/session'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const asJson = args.includes('--json')
  const slateArg = args.find(a => a.startsWith('--slate='))?.split('=')[1]

  const contestId = process.env.SPLASH_CONTEST_ID
  const entryId = process.env.SPLASH_ENTRY_ID
  if (!contestId || !entryId) {
    throw new Error(
      'Missing SPLASH_CONTEST_ID and/or SPLASH_ENTRY_ID.\n' +
      '  Both appear in the picksheet URL:\n' +
      '  contests.app.splashsports.com/team-pickem/contests/<SPLASH_CONTEST_ID>/picks' +
      '?entryId=<SPLASH_ENTRY_ID>&slateId=...'
    )
  }

  const session = await loadSession()
  if (!session) throw new Error('No saved session. Create one with: npm run login')

  const accessToken = session.cookies.find(c => c.name === 'accessToken')?.value
  const refreshToken = session.cookies.find(c => c.name === 'refreshToken')?.value
  if (!accessToken || !refreshToken) {
    throw new Error('Saved session has no Splash tokens. Re-run: npm run login')
  }

  const fresh = await refreshAccessToken({ accessToken, refreshToken })

  // Persist the rotated token: the refresh endpoint requires the previous
  // access token as input, so letting the stored one drift is what eventually
  // breaks unattended runs.
  session.cookies = session.cookies.map(c =>
    c.name === 'accessToken' ? { ...c, value: fresh } : c
  )
  session.savedAt = new Date().toISOString()
  await saveSession(session)

  const slates = await getSlates(fresh, contestId)
  const slate = slateArg
    ? slates.find(s => s.abbreviation === slateArg || s.id === slateArg)
    : slates.find(s => s.isCurrentSlate)

  if (!slate) {
    throw new Error(
      slateArg
        ? `No slate matching "${slateArg}". Available: ${slates.map(s => s.abbreviation).join(', ')}`
        : 'No slate is currently marked as current by the pool.'
    )
  }

  const picksheet = await getPicksheet(fresh, { contestId, slateId: slate.id, entryId })
  const games = normalizeGames(picksheet)

  if (asJson) {
    console.log(JSON.stringify({ slate, games }, null, 2))
    return
  }

  const withSpread = games.filter(g => g.spread !== null)
  console.log(`${slate.name}  (${slate.abbreviation})`)
  console.log(`  status ${slate.status} | locked ${slate.isLocked ?? false} | picks lock ${slate.pickLockDate ?? 'n/a'}`)
  console.log(`  ${games.length} games, ${withSpread.length} with a posted spread`)
  console.log(`  NFL ${games.filter(g => g.league === 'NFL').length} | NCAA ${games.filter(g => g.league === 'NCAAF').length}`)
  console.log('')

  for (const g of games.slice(0, 12)) {
    const spread = g.spread === null ? '  n/a' : (g.spread > 0 ? `+${g.spread}` : `${g.spread}`).padStart(5)
    const prob = g.homeWinProbability === null ? '   -' : `${(g.homeWinProbability * 100).toFixed(1)}%`.padStart(6)
    console.log(`  ${g.league.padEnd(4)} ${g.awayAlias.padStart(4)} @ ${g.homeAlias.padEnd(4)}  home ${spread}  win ${prob}`)
  }
  if (games.length > 12) console.log(`  ... ${games.length - 12} more (use --json for all)`)
}

main().catch(error => {
  if (error instanceof SplashAuthError) {
    console.error('\nAuthentication required:', error.message)
    process.exit(1)
  }
  console.error('\nFailed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
