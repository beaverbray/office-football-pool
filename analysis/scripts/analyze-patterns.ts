#!/usr/bin/env tsx
/**
 * Pattern Detection Analysis Script
 *
 * Analyzes systematic patterns in pool vs market betting including:
 * - Spread bias detection
 * - League-specific differences
 * - Key number behaviors
 * - Historical spread bucket analysis
 *
 * Usage: npx tsx scripts/analyze-patterns.ts [--league NFL|NCAAF] [--output path/to/report.json]
 */

import { createClient } from '@supabase/supabase-js'
import path from 'path'
import dotenv from 'dotenv'
import fs from 'fs'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables')
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) are set in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'afbp' }
})

// Parse command line arguments
const args = process.argv.slice(2)
const leagueArg = args.find(arg => arg.startsWith('--league='))?.split('=')[1]
const outputArg = args.find(arg => arg.startsWith('--output='))?.split('=')[1]

const targetLeague = leagueArg as 'NFL' | 'NCAAF' | undefined

// Key numbers in football
const NFL_KEY_NUMBERS = [3, 7, 10, 14, 4, 6]
const NCAAF_KEY_NUMBERS = [3, 7, 14, 10, 4, 21]

/**
 * Check data availability
 */
async function checkDataStatus() {
  console.log('\n📊 Checking data availability...\n')

  const checks = await Promise.all([
    supabase.from('pool_picks').select('*', { count: 'exact', head: true }),
    supabase.from('historical_games').select('*', { count: 'exact', head: true }),
    supabase.from('pool_performance_analysis').select('*', { count: 'exact', head: true })
  ])

  const status = {
    pool_picks: checks[0].count || 0,
    historical_games: checks[1].count || 0,
    pool_performance_analysis: checks[2].count || 0
  }

  console.log(`Pool Picks: ${status.pool_picks}`)
  console.log(`Historical Games: ${status.historical_games}`)
  console.log(`Performance Analysis: ${status.pool_performance_analysis}`)

  if (status.pool_performance_analysis === 0) {
    console.log('\n⚠️  No performance analysis data available yet.')
    console.log('   Run compute-performance-metrics.ts first to populate data.\n')
  }

  return status
}

/**
 * Analyze historical spread bucket patterns
 * This works with current historical_games data
 */
async function analyzeHistoricalSpreadBuckets(league?: string) {
  console.log('\n📈 Analyzing historical spread buckets...\n')

  const { data, error } = await supabase
    .from('historical_spread_buckets')
    .select('*')
    .order('n_games', { ascending: false })

  if (error) {
    console.error('Error fetching spread buckets:', error)
    return []
  }

  const filtered = league
    ? data.filter(row => row.league === league)
    : data

  // Display results
  console.log('Spread Bucket Analysis:')
  console.log('='.repeat(80))

  for (const row of filtered.slice(0, 10)) {
    console.log(`\n${row.league} - ${row.spread}`)
    console.log(`  Games: ${row.n_games}`)
    console.log(`  Cover Rate: ${(row.cover_rate * 100).toFixed(1)}%`)
    console.log(`  Mean Margin: ${row.mean_margin?.toFixed(1)} ± ${row.std_margin?.toFixed(1)}`)
    console.log(`  Median Margin: ${row.median_margin?.toFixed(1)}`)
  }

  return filtered
}

/**
 * Analyze pool pick spread distribution
 */
async function analyzePoolPickSpreads(league?: string) {
  console.log('\n📊 Analyzing pool pick spread distribution...\n')

  const query = supabase
    .from('pool_picks')
    .select('league, pool_spread')
    .not('pool_spread', 'is', null)

  if (league) {
    query.eq('league', league)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching pool picks:', error)
    return
  }

  // Group by spread ranges
  const buckets: Record<string, number> = {
    'Field Goal (±3)': 0,
    'Small (3.5-7)': 0,
    'Touchdown (7.5-10)': 0,
    'Medium (10.5-14)': 0,
    'Large (14.5+)': 0
  }

  for (const pick of data) {
    const spread = Math.abs(parseFloat(pick.pool_spread as any))
    if (spread <= 3) buckets['Field Goal (±3)']++
    else if (spread <= 7) buckets['Small (3.5-7)']++
    else if (spread <= 10) buckets['Touchdown (7.5-10)']++
    else if (spread <= 14) buckets['Medium (10.5-14)']++
    else buckets['Large (14.5+)']++
  }

  console.log('Pool Pick Spread Distribution:')
  console.log('='.repeat(60))
  for (const [bucket, count] of Object.entries(buckets)) {
    const pct = ((count / data.length) * 100).toFixed(1)
    console.log(`${bucket.padEnd(20)} ${count.toString().padStart(4)} (${pct}%)`)
  }

  return buckets
}

/**
 * Analyze key number frequency in pool picks
 */
async function analyzeKeyNumberFrequency(league: 'NFL' | 'NCAAF') {
  console.log(`\n🔢 Analyzing key number frequency for ${league}...\n`)

  const keyNumbers = league === 'NFL' ? NFL_KEY_NUMBERS : NCAAF_KEY_NUMBERS

  const { data, error } = await supabase
    .from('pool_picks')
    .select('pool_spread')
    .eq('league', league)
    .not('pool_spread', 'is', null)

  if (error) {
    console.error('Error fetching pool picks:', error)
    return
  }

  const keyNumberCounts: Record<number, number> = {}
  keyNumbers.forEach(kn => keyNumberCounts[kn] = 0)

  for (const pick of data) {
    const spread = Math.abs(parseFloat(pick.pool_spread as any))
    // Check if spread lands exactly on a key number
    if (keyNumbers.includes(spread)) {
      keyNumberCounts[spread]++
    }
  }

  console.log(`${league} Key Number Frequency:`)
  console.log('='.repeat(50))
  const sorted = Object.entries(keyNumberCounts).sort((a, b) => b[1] - a[1])
  for (const [kn, count] of sorted) {
    const pct = ((count / data.length) * 100).toFixed(1)
    console.log(`${kn.toString().padStart(3)}: ${count.toString().padStart(3)} times (${pct}%)`)
  }

  return keyNumberCounts
}

/**
 * Generate comprehensive analysis report
 */
async function generateReport() {
  const startTime = Date.now()
  console.log(`\n${'='.repeat(80)}`)
  console.log('🔍 Pattern Detection Analysis Report')
  console.log(`${'='.repeat(80)}`)

  const dataStatus = await checkDataStatus()

  const report: any = {
    generated_at: new Date().toISOString(),
    data_status: dataStatus,
    analyses: {}
  }

  // Run available analyses
  report.analyses.historical_spread_buckets = await analyzeHistoricalSpreadBuckets(targetLeague)
  report.analyses.pool_pick_spreads = await analyzePoolPickSpreads(targetLeague)

  if (targetLeague) {
    report.analyses.key_number_frequency = await analyzeKeyNumberFrequency(targetLeague)
  } else {
    report.analyses.key_number_frequency = {
      NFL: await analyzeKeyNumberFrequency('NFL'),
      NCAAF: await analyzeKeyNumberFrequency('NCAAF')
    }
  }

  const duration = Date.now() - startTime

  console.log(`\n${'='.repeat(80)}`)
  console.log(`✅ Analysis completed in ${duration}ms`)
  console.log(`${'='.repeat(80)}\n`)

  // Save report if output specified
  if (outputArg) {
    const outputPath = path.resolve(outputArg)
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
    console.log(`📄 Report saved to: ${outputPath}\n`)
  }

  return report
}

// Run the analysis
generateReport()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  })
