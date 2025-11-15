#!/usr/bin/env tsx
/**
 * Compute Performance Metrics Script
 *
 * This script compares pool picks vs market spreads and outcomes to compute performance metrics.
 * It joins pool_picks with historical_games, calculates spread differences, determines cover
 * outcomes, and identifies key number crossings.
 *
 * Usage: npx tsx scripts/compute-performance-metrics.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js'
import path from 'path'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables')
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are set in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'afbp' }
})

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

// Key numbers in football (common final margins)
const NFL_KEY_NUMBERS = [3, 7, 10, 14, 4, 6]
const NCAAF_KEY_NUMBERS = [3, 7, 14, 10, 4, 21]

interface PoolPick {
  id: string
  season: number
  week: number
  league: string
  game_date: string
  home_team: string
  away_team: string
  pool_spread: number | null
}

interface HistoricalGame {
  id: string
  season: number
  week: number
  league: string
  home_team: string
  away_team: string
  spread: number | null
  actual_margin: number | null
  home_score: number | null
  away_score: number | null
  favorite_covered: boolean | null
}

interface PerformanceMetric {
  pool_pick_id: string
  historical_game_id: string
  season: number
  week: number
  league: string
  home_team: string
  away_team: string
  pool_spread: number | null
  market_spread: number | null
  spread_difference: number | null
  actual_margin: number | null
  pool_pick_covered: boolean | null
  market_pick_covered: boolean | null
  pool_had_edge: boolean | null
  pool_edge_points: number | null
  key_numbers_crossed: number[]
  pool_winner: boolean | null
  market_winner: boolean | null
  result_type: string | null
}

/**
 * Normalize team name for matching
 */
function normalizeTeamName(name: string): string {
  return name.toLowerCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
}

/**
 * Check if a spread covers the actual margin
 * Positive spread = home team favored by that many points
 * Negative spread = away team favored
 */
function spreadCovers(spread: number, actualMargin: number): boolean {
  // actualMargin = home_score - away_score
  // If home team favored (-spread), they need to win by more than |spread|
  // If away team favored (+spread), away needs to win or lose by less than spread

  // Convert spread to home team perspective
  const coverMargin = actualMargin + spread
  return coverMargin > 0
}

/**
 * Identify key numbers crossed between two spreads
 */
function identifyKeyNumbersCrossed(spread1: number, spread2: number, league: string): number[] {
  const keyNumbers = league === 'NFL' ? NFL_KEY_NUMBERS : NCAAF_KEY_NUMBERS
  const crossed: number[] = []

  const min = Math.min(Math.abs(spread1), Math.abs(spread2))
  const max = Math.max(Math.abs(spread1), Math.abs(spread2))

  for (const key of keyNumbers) {
    if (key > min && key <= max) {
      crossed.push(key)
    }
  }

  return crossed.sort((a, b) => a - b)
}

/**
 * Determine result type based on outcomes
 */
function determineResultType(
  poolCovered: boolean | null,
  marketCovered: boolean | null,
  poolWinner: boolean | null,
  marketWinner: boolean | null
): string | null {
  if (poolCovered === null || marketCovered === null) {
    return 'incomplete'
  }

  if (poolWinner && marketWinner) {
    return 'both_win'
  } else if (poolWinner && !marketWinner) {
    return 'pool_only'
  } else if (!poolWinner && marketWinner) {
    return 'market_only'
  } else {
    return 'both_lose'
  }
}

/**
 * Fetch pool picks that need performance analysis
 */
async function fetchPoolPicks(): Promise<PoolPick[]> {
  console.log('📋 Fetching pool picks...')

  const { data, error } = await supabase
    .from('pool_picks')
    .select('id, season, week, league, game_date, home_team, away_team, pool_spread')
    .not('pool_spread', 'is', null)

  if (error) {
    console.error('❌ Failed to fetch pool picks:', error)
    throw error
  }

  console.log(`✅ Found ${data.length} pool picks with spreads`)
  return data as PoolPick[]
}

/**
 * Fetch historical games with outcomes
 */
async function fetchHistoricalGames(): Promise<HistoricalGame[]> {
  console.log('📋 Fetching historical games...')

  const { data, error } = await supabase
    .from('historical_games')
    .select('id, season, week, league, home_team, away_team, spread, actual_margin, home_score, away_score, favorite_covered')
    .not('actual_margin', 'is', null)

  if (error) {
    console.error('❌ Failed to fetch historical games:', error)
    throw error
  }

  console.log(`✅ Found ${data.length} historical games with outcomes`)
  return data as HistoricalGame[]
}

/**
 * Match pool picks to historical games
 */
function matchPicksToGames(picks: PoolPick[], games: HistoricalGame[]): Map<string, HistoricalGame> {
  console.log('\n🔗 Matching pool picks to historical games...')

  // Create index for fast lookup
  const gameIndex = new Map<string, HistoricalGame>()

  for (const game of games) {
    const key = `${game.league}|${game.season}|${game.week}|${normalizeTeamName(game.home_team)}|${normalizeTeamName(game.away_team)}`
    gameIndex.set(key, game)
  }

  // Match picks to games
  const matches = new Map<string, HistoricalGame>()
  let matchCount = 0

  for (const pick of picks) {
    const key = `${pick.league}|${pick.season}|${pick.week}|${normalizeTeamName(pick.home_team)}|${normalizeTeamName(pick.away_team)}`
    const game = gameIndex.get(key)

    if (game) {
      matches.set(pick.id, game)
      matchCount++
    }
  }

  console.log(`✅ Matched ${matchCount} pool picks to historical games`)
  return matches
}

/**
 * Compute performance metrics for matched picks
 */
function computeMetrics(
  picks: PoolPick[],
  matches: Map<string, HistoricalGame>
): PerformanceMetric[] {
  console.log('\n📊 Computing performance metrics...')

  const metrics: PerformanceMetric[] = []

  for (const pick of picks) {
    const game = matches.get(pick.id)
    if (!game) continue

    const poolSpread = pick.pool_spread!
    const marketSpread = game.spread
    const actualMargin = game.actual_margin!

    // Calculate spread difference
    const spreadDifference = marketSpread !== null ? poolSpread - marketSpread : null

    // Determine if picks covered
    const poolPickCovered = spreadCovers(poolSpread, actualMargin)
    const marketPickCovered = marketSpread !== null ? spreadCovers(marketSpread, actualMargin) : null

    // Calculate edge metrics
    const poolHadEdge = spreadDifference !== null ? spreadDifference > 0 : null
    const poolEdgePoints = spreadDifference !== null ? Math.abs(spreadDifference) : null

    // Identify key numbers crossed
    const keyNumbersCrossed = marketSpread !== null
      ? identifyKeyNumbersCrossed(poolSpread, marketSpread, pick.league)
      : []

    // Determine winners
    const poolWinner = poolPickCovered
    const marketWinner = marketPickCovered

    // Determine result type
    const resultType = determineResultType(poolPickCovered, marketPickCovered, poolWinner, marketWinner)

    metrics.push({
      pool_pick_id: pick.id,
      historical_game_id: game.id,
      season: pick.season,
      week: pick.week,
      league: pick.league,
      home_team: pick.home_team,
      away_team: pick.away_team,
      pool_spread: poolSpread,
      market_spread: marketSpread,
      spread_difference: spreadDifference,
      actual_margin: actualMargin,
      pool_pick_covered: poolPickCovered,
      market_pick_covered: marketPickCovered,
      pool_had_edge: poolHadEdge,
      pool_edge_points: poolEdgePoints,
      key_numbers_crossed: keyNumbersCrossed,
      pool_winner: poolWinner,
      market_winner: marketWinner,
      result_type: resultType
    })
  }

  console.log(`✅ Computed metrics for ${metrics.length} matched games`)
  return metrics
}

/**
 * Insert performance metrics into database
 */
async function insertMetrics(metrics: PerformanceMetric[]): Promise<void> {
  if (metrics.length === 0) {
    console.log('\n⚠️  No metrics to insert (no matched games)')
    return
  }

  console.log(`\n📤 Inserting ${metrics.length} performance metrics...`)

  if (dryRun) {
    console.log('🔍 DRY RUN - Sample metrics (first 3):')
    console.log(JSON.stringify(metrics.slice(0, 3), null, 2))
    return
  }

  // Insert in batches of 500
  const batchSize = 500
  for (let i = 0; i < metrics.length; i += batchSize) {
    const batch = metrics.slice(i, i + batchSize)
    console.log(`📤 Inserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(metrics.length / batchSize)} (${batch.length} metrics)...`)

    const { error } = await supabase
      .from('pool_performance_analysis')
      .upsert(batch, {
        onConflict: 'pool_pick_id',
        ignoreDuplicates: false
      })

    if (error) {
      console.error(`❌ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error)
      throw error
    }
  }

  console.log(`✅ Successfully inserted ${metrics.length} performance metrics`)
}

/**
 * Print summary statistics
 */
function printSummary(metrics: PerformanceMetric[]): void {
  if (metrics.length === 0) {
    console.log('\n📊 Summary: No metrics computed (no matched games)')
    return
  }

  console.log('\n📊 Performance Summary:')
  console.log('═══════════════════════════════════════════════════════════')

  const poolWins = metrics.filter(m => m.pool_winner).length
  const marketWins = metrics.filter(m => m.market_winner).length
  const bothWin = metrics.filter(m => m.result_type === 'both_win').length
  const poolOnly = metrics.filter(m => m.result_type === 'pool_only').length
  const marketOnly = metrics.filter(m => m.result_type === 'market_only').length
  const bothLose = metrics.filter(m => m.result_type === 'both_lose').length

  const avgSpreadDiff = metrics
    .filter(m => m.spread_difference !== null)
    .reduce((sum, m) => sum + Math.abs(m.spread_difference!), 0) / metrics.length

  const keyNumberGames = metrics.filter(m => m.key_numbers_crossed.length > 0).length

  console.log(`Total Games Analyzed: ${metrics.length}`)
  console.log(`\nWin Rates:`)
  console.log(`  Pool Picks: ${poolWins}/${metrics.length} (${((poolWins / metrics.length) * 100).toFixed(1)}%)`)
  console.log(`  Market Picks: ${marketWins}/${metrics.length} (${((marketWins / metrics.length) * 100).toFixed(1)}%)`)
  console.log(`\nResult Distribution:`)
  console.log(`  Both Win: ${bothWin} (${((bothWin / metrics.length) * 100).toFixed(1)}%)`)
  console.log(`  Pool Only: ${poolOnly} (${((poolOnly / metrics.length) * 100).toFixed(1)}%)`)
  console.log(`  Market Only: ${marketOnly} (${((marketOnly / metrics.length) * 100).toFixed(1)}%)`)
  console.log(`  Both Lose: ${bothLose} (${((bothLose / metrics.length) * 100).toFixed(1)}%)`)
  console.log(`\nSpread Analysis:`)
  console.log(`  Avg Spread Difference: ${avgSpreadDiff.toFixed(2)} points`)
  console.log(`  Games Crossing Key Numbers: ${keyNumberGames} (${((keyNumberGames / metrics.length) * 100).toFixed(1)}%)`)
  console.log('═══════════════════════════════════════════════════════════')
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Performance Metrics Computation\n')

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No data will be inserted\n')
  }

  try {
    // Fetch data
    const picks = await fetchPoolPicks()
    const games = await fetchHistoricalGames()

    // Match picks to games
    const matches = matchPicksToGames(picks, games)

    if (matches.size === 0) {
      console.log('\n⚠️  No matches found between pool picks and historical games')
      console.log('This is expected if:')
      console.log('  - Pool picks are from future seasons (e.g., 2025)')
      console.log('  - Historical games are from past seasons (e.g., 2019-2023)')
      console.log('  - No temporal overlap exists yet')
      console.log('\nThe script is ready to run when:')
      console.log('  - Current season games complete and are added to historical_games')
      console.log('  - Historical picksheets from 2019-2023 are loaded into pool_picks')
      return
    }

    // Compute metrics
    const metrics = computeMetrics(picks, matches)

    // Insert metrics
    await insertMetrics(metrics)

    // Print summary
    printSummary(metrics)

    console.log('\n✅ Performance metrics computation complete!')

  } catch (error) {
    console.error('\n❌ Error during metrics computation:', error)
    process.exit(1)
  }
}

main()
