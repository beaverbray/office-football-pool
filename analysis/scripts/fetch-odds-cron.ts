#!/usr/bin/env tsx
/**
 * Odds Fetcher Cron Job
 *
 * This script fetches odds from The Odds API and stores them in the database.
 * It's designed to be run periodically via cron or a task scheduler.
 *
 * Usage:
 *   tsx scripts/fetch-odds-cron.ts [sport]
 *
 * Arguments:
 *   sport - Optional. 'nfl', 'ncaaf', or 'all' (default: 'all')
 *
 * Environment variables required:
 *   - THE_ODDS_API_KEY or ODDS_API_KEY
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - NEXT_PUBLIC_SUPABASE_URL
 *
 * Example crontab entries:
 *   # Fetch all odds every 30 minutes
 *   */30 * * * * cd /path/to/project && tsx scripts/fetch-odds-cron.ts all >> logs/odds-fetch.log 2>&1
 *
 *   # Fetch NFL odds every hour during NFL season
 *   0 * * * * cd /path/to/project && tsx scripts/fetch-odds-cron.ts nfl >> logs/odds-fetch-nfl.log 2>&1
 */

import dotenv from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { Database } from '../src/types/database'
import { OddsAPIService, MARKETS, SPORTS, OddsResponse } from '../src/services/odds-api'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') })

// Configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const oddsApiKey = process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY

// Validate environment variables
if (!supabaseUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL not configured')
  process.exit(1)
}

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not configured')
  process.exit(1)
}

if (!oddsApiKey) {
  console.error('❌ THE_ODDS_API_KEY or ODDS_API_KEY not configured')
  process.exit(1)
}

// Create Supabase client
const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'afbp' as any }
})

interface OddsSnapshot {
  event_provider_key: string
  book: string
  market: string
  home_spread?: number
  away_spread?: number
  home_ml?: number
  away_ml?: number
  total?: number
  over_price?: number
  under_price?: number
  prices?: Record<string, any>
  fetched_at: string
}

/**
 * Convert OddsResponse to OddsSnapshot records
 */
function convertToSnapshots(oddsData: OddsResponse[]): OddsSnapshot[] {
  const snapshots: OddsSnapshot[] = []
  const fetchedAt = new Date().toISOString()

  for (const game of oddsData) {
    for (const bookmaker of game.bookmakers) {
      // Process spreads
      const spreadMarket = bookmaker.markets.find(m => m.key === MARKETS.SPREADS)
      if (spreadMarket) {
        const homeOutcome = spreadMarket.outcomes.find(o => o.name === game.home_team)
        const awayOutcome = spreadMarket.outcomes.find(o => o.name === game.away_team)

        snapshots.push({
          event_provider_key: game.id,
          book: bookmaker.key,
          market: 'spread',
          home_spread: homeOutcome?.point ?? undefined,
          away_spread: awayOutcome?.point ?? undefined,
          home_ml: homeOutcome?.price ?? undefined,
          away_ml: awayOutcome?.price ?? undefined,
          prices: {
            home_price: homeOutcome?.price,
            away_price: awayOutcome?.price
          },
          fetched_at: fetchedAt
        })
      }

      // Process totals
      const totalsMarket = bookmaker.markets.find(m => m.key === MARKETS.TOTALS)
      if (totalsMarket) {
        const overOutcome = totalsMarket.outcomes.find(o => o.name === 'Over')
        const underOutcome = totalsMarket.outcomes.find(o => o.name === 'Under')

        snapshots.push({
          event_provider_key: game.id,
          book: bookmaker.key,
          market: 'totals',
          total: overOutcome?.point ?? underOutcome?.point ?? undefined,
          over_price: overOutcome?.price ?? undefined,
          under_price: underOutcome?.price ?? undefined,
          prices: {
            over_point: overOutcome?.point,
            under_point: underOutcome?.point
          },
          fetched_at: fetchedAt
        })
      }

      // Process moneylines (h2h)
      const h2hMarket = bookmaker.markets.find(m => m.key === MARKETS.H2H)
      if (h2hMarket) {
        const homeOutcome = h2hMarket.outcomes.find(o => o.name === game.home_team)
        const awayOutcome = h2hMarket.outcomes.find(o => o.name === game.away_team)

        snapshots.push({
          event_provider_key: game.id,
          book: bookmaker.key,
          market: 'h2h',
          home_ml: homeOutcome?.price ?? undefined,
          away_ml: awayOutcome?.price ?? undefined,
          prices: {
            home_price: homeOutcome?.price,
            away_price: awayOutcome?.price
          },
          fetched_at: fetchedAt
        })
      }
    }
  }

  return snapshots
}

/**
 * Save odds snapshots to database
 */
async function saveSnapshots(snapshots: OddsSnapshot[]): Promise<{
  success: number
  errors: number
}> {
  let success = 0
  let errors = 0

  // Insert in batches of 100 to avoid timeout
  const batchSize = 100
  for (let i = 0; i < snapshots.length; i += batchSize) {
    const batch = snapshots.slice(i, i + batchSize)

    const { error } = await supabase
      .from('odds_snapshots')
      .insert(batch as any)

    if (error) {
      console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, error)
      errors += batch.length
    } else {
      success += batch.length
    }
  }

  return { success, errors }
}

/**
 * Fetch and store odds for a specific sport
 */
async function fetchAndStoreOdds(sport: 'NFL' | 'NCAAF'): Promise<{
  sport: string
  gamesFound: number
  snapshotsCreated: number
  snapshotsStored: number
  errors: number
}> {
  console.log(`\n📊 Fetching ${sport} odds...`)

  const oddsAPI = new OddsAPIService(oddsApiKey!)
  const sportKey = sport === 'NFL' ? SPORTS.NFL : SPORTS.NCAAF

  // Fetch odds from API
  const oddsData = await oddsAPI.getOdds(
    sportKey,
    [MARKETS.SPREADS, MARKETS.TOTALS, MARKETS.H2H]
  )

  console.log(`✅ Found ${oddsData.length} ${sport} games`)

  // Convert to snapshot format
  const snapshots = convertToSnapshots(oddsData)
  console.log(`📸 Created ${snapshots.length} snapshots`)

  // Save to database
  const { success, errors } = await saveSnapshots(snapshots)
  console.log(`💾 Stored ${success} snapshots, ${errors} errors`)

  return {
    sport,
    gamesFound: oddsData.length,
    snapshotsCreated: snapshots.length,
    snapshotsStored: success,
    errors
  }
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now()
  const sport = process.argv[2]?.toUpperCase() || 'ALL'

  console.log(`\n${'='.repeat(60)}`)
  console.log(`🚀 Odds Fetcher Cron Job - ${new Date().toISOString()}`)
  console.log(`${'='.repeat(60)}`)

  try {
    let results

    if (sport === 'NFL') {
      results = [await fetchAndStoreOdds('NFL')]
    } else if (sport === 'NCAAF') {
      results = [await fetchAndStoreOdds('NCAAF')]
    } else {
      // Fetch both in parallel
      results = await Promise.all([
        fetchAndStoreOdds('NFL'),
        fetchAndStoreOdds('NCAAF')
      ])
    }

    const totalGames = results.reduce((sum, r) => sum + r.gamesFound, 0)
    const totalSnapshots = results.reduce((sum, r) => sum + r.snapshotsStored, 0)
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0)

    const duration = Date.now() - startTime

    console.log(`\n${'='.repeat(60)}`)
    console.log('✅ Odds fetch completed successfully')
    console.log(`   • Total games: ${totalGames}`)
    console.log(`   • Total snapshots stored: ${totalSnapshots}`)
    console.log(`   • Total errors: ${totalErrors}`)
    console.log(`   • Duration: ${duration}ms`)
    console.log(`${'='.repeat(60)}\n`)

    process.exit(totalErrors > 0 ? 1 : 0)

  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  }
}

// Run the script
main()
