#!/usr/bin/env npx tsx
/**
 * Record the week's opening lines.
 *
 * "Opening" here means the Tuesday-morning line: by then the previous week's
 * results are in and the injury picture has settled, so books have repriced and
 * the number is the one the pool is actually playing against. That is a
 * different and more useful definition than the book's literal first post,
 * which can be months old for a Week 1 game.
 *
 * The label is only honest if something actually looks on Tuesday. Without this
 * job the earliest observation would be whenever the Thursday fetch happened to
 * run — measured at 8.5 hours before the first kickoff, which is a near-closing
 * line, not an opening one.
 *
 * Writes the same row shape /api/refresh-all does, so the two interleave and
 * getOpeningSpreads' earliest-wins lookup treats them uniformly.
 *
 * Env: ODDS_API_KEY (or THE_ODDS_API_KEY), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import 'dotenv/config'
import { OddsAPIService, getOddsAPI, SPORTS, MARKETS } from '@/services/odds-api'
import { recordOddsSnapshots } from '@/services/opening-lines'

async function main(): Promise<void> {
  // The service-role client reads SUPABASE_URL; .env carries the NEXT_PUBLIC_ name.
  if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  }

  const started = Date.now()
  const api = getOddsAPI()

  const [nfl, ncaaf] = await Promise.all([
    api.getOdds(SPORTS.NFL, [MARKETS.SPREADS]),
    api.getOdds(SPORTS.NCAAF, [MARKETS.SPREADS])
  ])

  const games = [
    ...OddsAPIService.formatOddsForDisplay(nfl),
    ...OddsAPIService.formatOddsForDisplay(ncaaf)
  ]
  const priced = games.filter(g => g.homeSpread != null)
  console.log(`Fetched ${games.length} games (${priced.length} with a spread) — NFL ${nfl.length}, NCAAF ${ncaaf.length}`)

  const result = await recordOddsSnapshots(priced, { capture: 'weekly-open' })
  if (result.error) {
    throw new Error(`Snapshot write failed: ${result.error}`)
  }

  console.log(`Recorded ${result.recorded} odds snapshots (${((Date.now() - started) / 1000).toFixed(1)}s)`)
}

main().catch(error => {
  console.error('Snapshot failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
