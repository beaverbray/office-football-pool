#!/usr/bin/env node

/**
 * Test script to verify game matching improvements
 * Usage: node scripts/test-matching.mjs
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

const samplePicksheetGames = [
  { homeTeam: 'Cowboys', awayTeam: 'Eagles', spread: -3 },
  { homeTeam: 'Kansas City', awayTeam: 'Buffalo', spread: -2.5 },
  { homeTeam: 'San Francisco', awayTeam: 'Seattle', spread: -7 },
  { homeTeam: 'Alabama', awayTeam: 'Georgia', spread: 3.5 },
  { homeTeam: 'Ohio State', awayTeam: 'Michigan', spread: -10 }
]

async function testDebugMatching() {
  console.log('🔍 Testing debug matching endpoint...\n')

  try {
    const response = await fetch(`${BASE_URL}/api/debug-matching`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        picksheetGames: samplePicksheetGames,
        fetchMarketGames: true
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = await response.json()

    console.log('📊 Matching Summary:')
    console.log(`  Total Picksheet Games: ${result.summary.totalPicksheet}`)
    console.log(`  Total Market Games: ${result.summary.totalMarket}`)
    console.log(`  Matched: ${result.summary.matched}`)
    console.log(`  Unmatched: ${result.summary.unmatched}`)
    console.log(`  Match Rate: ${result.summary.matchRate}`)
    console.log()

    if (result.unmatchedPicksheet.length > 0) {
      console.log('❌ Unmatched Picksheet Games:')
      result.unmatchedPicksheet.forEach((game, idx) => {
        console.log(`  ${idx + 1}. ${game.picksheetGame.awayTeam} @ ${game.picksheetGame.homeTeam}`)
        console.log(`     Resolved: ${game.picksheetResolved.away} vs ${game.picksheetResolved.home}`)
        if (game.allCandidates.length > 0) {
          console.log(`     Candidates found: ${game.allCandidates.length}`)
          game.allCandidates.forEach(c => {
            console.log(`       - ${c.game} (${c.confidence.toFixed(2)} confidence, ${c.matchType})`)
          })
        } else {
          console.log(`     No candidates found`)
        }
        console.log()
      })
    }

    if (result.unmatchedMarket.length > 0) {
      console.log(`\n📋 Unmatched Market Games (${result.unmatchedMarket.length} games):`)
      result.unmatchedMarket.slice(0, 5).forEach(game => {
        console.log(`  - ${game.game} [${game.league}]`)
      })
      if (result.unmatchedMarket.length > 5) {
        console.log(`  ... and ${result.unmatchedMarket.length - 5} more`)
      }
    }

    console.log('\n✅ Debug matching test completed!')

  } catch (error) {
    console.error('❌ Error testing debug matching:', error.message)
    process.exit(1)
  }
}

async function testPipeline() {
  console.log('\n🔄 Testing pipeline endpoint...\n')

  try {
    const response = await fetch(`${BASE_URL}/api/pipeline/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        picksheetGames: samplePicksheetGames,
        useOddsAPI: true,
        includeLogs: true
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = await response.json()

    console.log('📊 Pipeline Results:')
    console.log(`  Status: ${result.pipeline.status}`)
    console.log(`  Stage: ${result.pipeline.stage}`)
    console.log(`  Duration: ${result.pipeline.totalDuration}ms`)
    console.log()

    if (result.pipeline.matching) {
      console.log('🎯 Matching Results:')
      console.log(`  Match Rate: ${(result.pipeline.matching.matchRate * 100).toFixed(1)}%`)
      console.log(`  Matches: ${result.pipeline.matching.matches}/${result.pipeline.matching.totalGames}`)
      console.log(`  Duration: ${result.pipeline.matching.duration}ms`)
      console.log()
    }

    if (result.pipeline.comparison?.kpis) {
      const kpis = result.pipeline.comparison.kpis
      console.log('📈 Comparison KPIs:')
      console.log(`  Avg Spread Delta: ${kpis.avgSpreadDelta}`)
      console.log(`  Median Spread Delta: ${kpis.medianSpreadDelta}`)
      console.log(`  Key Number Crossings: ${kpis.keyNumberCrossings} (${(kpis.keyNumberCrossingRate * 100).toFixed(1)}%)`)
      console.log(`  Favorite Flips: ${kpis.favoriteFlips} (${(kpis.favoriteFlipRate * 100).toFixed(1)}%)`)
      console.log()
    }

    if (result.pipeline.logs && result.pipeline.logs.length > 0) {
      console.log('📝 Recent Logs:')
      result.pipeline.logs.slice(-5).forEach(log => console.log(`  ${log}`))
    }

    console.log('\n✅ Pipeline test completed!')

  } catch (error) {
    console.error('❌ Error testing pipeline:', error.message)
    process.exit(1)
  }
}

// Run tests
async function main() {
  console.log('🚀 Testing Game Matching Improvements\n')
  console.log(`Using base URL: ${BASE_URL}\n`)
  console.log('=' .repeat(60))

  await testDebugMatching()
  console.log('\n' + '='.repeat(60))
  await testPipeline()

  console.log('\n' + '='.repeat(60))
  console.log('\n✨ All tests completed!\n')
}

main().catch(console.error)
