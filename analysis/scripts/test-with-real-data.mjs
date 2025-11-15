#!/usr/bin/env node

/**
 * Test script with real picksheet data
 * Usage: node scripts/test-with-real-data.mjs
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// Real picksheet data from user
const realPicksheetGames = [
  // NFL Games
  { homeTeam: 'LA RAMS', awayTeam: 'San Francisco', spread: -5.5 },
  { homeTeam: 'CLEVELAND', awayTeam: 'Minnesota', spread: 3.5 },
  { homeTeam: 'NY JETS', awayTeam: 'Dallas', spread: 2.5 },
  { homeTeam: 'PHILADELPHIA', awayTeam: 'Denver', spread: -3.5 },
  { homeTeam: 'BALTIMORE', awayTeam: 'Houston', spread: -3.5 },
  { homeTeam: 'NEW ORLEANS', awayTeam: 'NY Giants', spread: -1.5 },
  { homeTeam: 'INDIANAPOLIS', awayTeam: 'Las Vegas', spread: -6.5 },
  { homeTeam: 'CAROLINA', awayTeam: 'Miami', spread: -0.5 },
  { homeTeam: 'SEATTLE', awayTeam: 'Tampa Bay', spread: -3.5 },
  { homeTeam: 'ARIZONA', awayTeam: 'Tennessee', spread: -8.5 },
  { homeTeam: 'LA CHARGERS', awayTeam: 'Washington', spread: -2.5 },
  { homeTeam: 'CINCINNATI', awayTeam: 'Detroit', spread: 9.5 },
  { homeTeam: 'BUFFALO', awayTeam: 'New England', spread: -7.5 },
  { homeTeam: 'JACKSONVILLE', awayTeam: 'Kansas City', spread: 3.5 },

  // NCAAF Games
  { homeTeam: 'NEW MEXICO ST.', awayTeam: 'Sam Houston State', spread: 2.5 },
  { homeTeam: 'DELAWARE', awayTeam: 'Western Kentucky', spread: -2.5 },
  { homeTeam: 'S. FLORIDA', awayTeam: 'Charlotte 49ers', spread: -27.5 },
  { homeTeam: 'SAN JOSE ST.', awayTeam: 'New Mexico', spread: -2.5 },
  { homeTeam: '#23 BYU', awayTeam: 'West Virginia', spread: -18.5 },
  { homeTeam: 'SAN DIEGO ST.', awayTeam: 'Colorado St.', spread: -5.5 },
  { homeTeam: 'PITTSBURGH', awayTeam: 'Boston College', spread: -6.5 },
  { homeTeam: 'NORTH CAROLINA', awayTeam: 'Clemson', spread: 13.5 },
  { homeTeam: 'NAVY', awayTeam: 'Air Force', spread: -11.5 },
  { homeTeam: '#20 MICHIGAN', awayTeam: 'Wisconsin', spread: -16.5 },
  { homeTeam: 'BALL ST.', awayTeam: 'Ohio', spread: 14.5 },
  { homeTeam: 'UAB', awayTeam: 'Army', spread: 6.5 },
  { homeTeam: 'PURDUE', awayTeam: '#22 Illinois', spread: 9.5 },
  { homeTeam: 'BAYLOR', awayTeam: 'Kansas St.', spread: -6.5 },
  { homeTeam: 'CINCINNATI', awayTeam: '#14 Iowa St.', spread: -1.5 },
  { homeTeam: '#12 GEORGIA', awayTeam: 'Kentucky', spread: -20.5 },
  { homeTeam: 'VIRGINIA TECH', awayTeam: 'Wake Forest', spread: -6.5 },
  { homeTeam: 'TEMPLE', awayTeam: 'UTSA', spread: 6.5 },
  { homeTeam: 'MASSACHUSETTS', awayTeam: 'Western Mich', spread: 12.5 },
  { homeTeam: 'ARIZONA', awayTeam: 'Oklahoma St.', spread: -20.5 },
  { homeTeam: 'UCLA', awayTeam: '#7 Penn St.', spread: 25.5 },
  { homeTeam: 'CONNECTICUT', awayTeam: 'FIU', spread: -7.5 },
  { homeTeam: 'LOUISVILLE', awayTeam: '#24 Virginia', spread: -7.5 },
  { homeTeam: 'APPALACHIAN STATE', awayTeam: 'Oregon St.', spread: 1.5 },
  { homeTeam: '#10 ALABAMA', awayTeam: '#16 Vanderbilt', spread: -10.5 },
  { homeTeam: 'SMU', awayTeam: 'Syracuse', spread: -16.5 },
  { homeTeam: 'NORTHWESTERN', awayTeam: 'UL Monroe', spread: -10.5 },
  { homeTeam: 'BUFFALO', awayTeam: 'Eastern Mich', spread: -9.5 },
  { homeTeam: 'AKRON', awayTeam: 'Central Mich', spread: 8.5 },
  { homeTeam: 'GEORGIA ST.', awayTeam: 'James Madison', spread: 19.5 },
  { homeTeam: 'NORTHERN ILL', awayTeam: 'Miami Ohio', spread: 4.5 },
  { homeTeam: 'MARYLAND', awayTeam: 'Washington', spread: 5.5 },
  { homeTeam: 'FLORIDA', awayTeam: '#9 Texas', spread: 6.5 },
  { homeTeam: '#21 NOTRE DAME', awayTeam: 'Boise St.', spread: -20.5 },
  { homeTeam: 'ARKANSAS ST.', awayTeam: 'Texas State', spread: 13.5 },
  { homeTeam: '#5 OKLAHOMA', awayTeam: 'Kent State', spread: -45.5 },
  { homeTeam: 'NEBRASKA', awayTeam: 'Michigan St.', spread: -10.5 },
  { homeTeam: 'OLD DOMINION', awayTeam: 'Coastal Carolina', spread: -18.5 },
  { homeTeam: 'TROY', awayTeam: 'South Alabama', spread: -2.5 },
  { homeTeam: 'HOUSTON', awayTeam: '#11 Texas Tech', spread: 11.5 },
  { homeTeam: 'RICE', awayTeam: 'Florida Atl.', spread: -4.5 },
  { homeTeam: 'WYOMING', awayTeam: 'UNLV', spread: 3.5 },
  { homeTeam: '#18 FLORIDA ST.', awayTeam: '#3 Miami Fla', spread: 4.5 },
  { homeTeam: 'TCU', awayTeam: 'Colorado', spread: -13.5 },
  { homeTeam: 'UCF', awayTeam: 'Kansas', spread: 4.5 },
  { homeTeam: '#1 OHIO ST.', awayTeam: 'Minnesota', spread: -23.5 },
  { homeTeam: '#6 TEXAS A&M', awayTeam: 'Mississippi St.', spread: -14.5 },
  { homeTeam: 'MEMPHIS', awayTeam: 'Tulsa', spread: -19.5 },
  { homeTeam: 'CALIFORNIA', awayTeam: 'Duke', spread: 2.5 },
  { homeTeam: 'FRESNO ST.', awayTeam: 'Nevada', spread: -13.5 }
]

async function testDebugMatching() {
  console.log('🔍 Testing with REAL picksheet data...\n')
  console.log(`Total games in picksheet: ${realPicksheetGames.length}`)
  console.log()

  try {
    const response = await fetch(`${BASE_URL}/api/debug-matching`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        picksheetGames: realPicksheetGames,
        fetchMarketGames: true
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    const result = await response.json()

    console.log('📊 Matching Summary:')
    console.log(`  Total Picksheet Games: ${result.summary.totalPicksheet}`)
    console.log(`  Total Market Games: ${result.summary.totalMarket}`)
    console.log(`  ✅ Matched: ${result.summary.matched}`)
    console.log(`  ❌ Unmatched: ${result.summary.unmatched}`)
    console.log(`  📈 Match Rate: ${result.summary.matchRate}`)
    console.log()

    if (result.unmatchedPicksheet.length > 0) {
      console.log('❌ Unmatched Picksheet Games:')
      console.log('=' .repeat(80))
      result.unmatchedPicksheet.forEach((game, idx) => {
        console.log(`\n${idx + 1}. ${game.picksheetGame.awayTeam} @ ${game.picksheetGame.homeTeam} (${game.picksheetGame.spread})`)
        console.log(`   Home Resolved: ${game.picksheetResolved.home}`)
        console.log(`   Away Resolved: ${game.picksheetResolved.away}`)

        if (game.allCandidates.length > 0) {
          console.log(`   Found ${game.allCandidates.length} candidate(s):`)
          game.allCandidates.forEach((c, i) => {
            console.log(`     ${i + 1}. ${c.game} - ${(c.confidence * 100).toFixed(0)}% confidence (${c.matchType})`)
          })
        } else {
          console.log(`   ⚠️  No candidates found - possible reasons:`)
          console.log(`       - Game not in market data (already started or not available)`)
          console.log(`       - Team name mismatch in entity resolution`)
        }
      })
      console.log()
    } else {
      console.log('✅ All picksheet games matched!\n')
    }

    // Show some matched games as examples
    if (result.matchAnalysis) {
      const matched = result.matchAnalysis.filter(m => m.matched).slice(0, 5)
      if (matched.length > 0) {
        console.log('✅ Example Matched Games:')
        console.log('=' .repeat(80))
        matched.forEach((match, idx) => {
          console.log(`\n${idx + 1}. Picksheet: ${match.picksheetGame.awayTeam} @ ${match.picksheetGame.homeTeam}`)
          console.log(`   Market:     ${match.bestMatch.marketGame.awayTeam} @ ${match.bestMatch.marketGame.homeTeam} [${match.bestMatch.marketGame.league}]`)
          console.log(`   Confidence: ${(match.bestMatch.confidence * 100).toFixed(0)}% (${match.bestMatch.matchType})`)
        })
        console.log()
      }
    }

    // Summary statistics
    const nflUnmatched = result.unmatchedPicksheet.filter(g =>
      !g.picksheetGame.homeTeam.includes('State') &&
      !g.picksheetGame.homeTeam.includes('University')
    ).length

    const ncaafUnmatched = result.unmatchedPicksheet.length - nflUnmatched

    console.log('📊 Breakdown by League:')
    console.log(`  NFL unmatched: ~${nflUnmatched}`)
    console.log(`  NCAAF unmatched: ~${ncaafUnmatched}`)
    console.log()

    if (result.unmatchedMarket && result.unmatchedMarket.length > 0) {
      console.log(`📋 Market has ${result.unmatchedMarket.length} additional games not in your picksheet`)
      const nflMarket = result.unmatchedMarket.filter(g => g.league === 'NFL').length
      const ncaafMarket = result.unmatchedMarket.filter(g => g.league === 'NCAAF').length
      console.log(`   NFL: ${nflMarket}, NCAAF: ${ncaafMarket}`)
      console.log()
    }

    console.log('✅ Debug matching test completed!')

    return result

  } catch (error) {
    console.error('❌ Error testing debug matching:', error.message)
    if (error.stack) {
      console.error('\nStack trace:')
      console.error(error.stack)
    }
    process.exit(1)
  }
}

async function testPipeline() {
  console.log('\n' + '='.repeat(80))
  console.log('🔄 Testing FULL PIPELINE with real data...\n')

  try {
    const response = await fetch(`${BASE_URL}/api/pipeline/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        picksheetGames: realPicksheetGames,
        useOddsAPI: true,
        includeLogs: true
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    const result = await response.json()

    console.log('📊 Pipeline Results:')
    console.log(`  Status: ${result.pipeline.status.toUpperCase()}`)
    console.log(`  Stage: ${result.pipeline.stage}`)
    console.log(`  Duration: ${result.pipeline.totalDuration}ms`)
    console.log()

    if (result.pipeline.oddsRetrieval) {
      console.log('📡 Odds Retrieval:')
      console.log(`  NFL Games: ${result.pipeline.oddsRetrieval.nflGames}`)
      console.log(`  NCAAF Games: ${result.pipeline.oddsRetrieval.ncaafGames}`)
      console.log(`  Duration: ${result.pipeline.oddsRetrieval.duration}ms`)
      console.log()
    }

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
      console.log(`  Matched Games: ${kpis.matchedGames}/${kpis.totalGames}`)
      console.log(`  Avg Spread Delta: ${kpis.avgSpreadDelta}`)
      console.log(`  Median Spread Delta: ${kpis.medianSpreadDelta}`)
      console.log(`  95th Percentile: ${kpis.p95SpreadDelta}`)
      console.log(`  Std Dev: ${kpis.stdDevSpreadDelta}`)
      console.log(`  Key Number Crossings: ${kpis.keyNumberCrossings} (${(kpis.keyNumberCrossingRate * 100).toFixed(1)}%)`)
      console.log(`  Favorite Flips: ${kpis.favoriteFlips} (${(kpis.favoriteFlipRate * 100).toFixed(1)}%)`)

      if (kpis.largestDelta) {
        console.log(`  Largest Delta: ${kpis.largestDelta.teams} (${kpis.largestDelta.delta})`)
      }
      console.log()
    }

    if (result.pipeline.comparison?.unmatched && result.pipeline.comparison.unmatched.length > 0) {
      console.log(`⚠️  Unmatched games: ${result.pipeline.comparison.unmatched.length}`)
      const picksheetUnmatched = result.pipeline.comparison.unmatched.filter(u => u.source === 'picksheet')
      if (picksheetUnmatched.length > 0) {
        console.log(`   From picksheet: ${picksheetUnmatched.length}`)
        picksheetUnmatched.slice(0, 3).forEach(u => {
          console.log(`     - ${u.gameInfo}`)
        })
        if (picksheetUnmatched.length > 3) {
          console.log(`     ... and ${picksheetUnmatched.length - 3} more`)
        }
      }
      console.log()
    }

    if (result.pipeline.logs && result.pipeline.logs.length > 0) {
      console.log('📝 Recent Pipeline Logs:')
      result.pipeline.logs.slice(-10).forEach(log => {
        // Remove timestamp for cleaner output
        const cleanLog = log.replace(/\[.*?\]\s*/, '')
        console.log(`  ${cleanLog}`)
      })
      console.log()
    }

    console.log('✅ Pipeline test completed!')

    return result

  } catch (error) {
    console.error('❌ Error testing pipeline:', error.message)
    if (error.stack) {
      console.error('\nStack trace:')
      console.error(error.stack)
    }
    process.exit(1)
  }
}

// Run tests
async function main() {
  console.log('🚀 Testing Game Matching with REAL Data')
  console.log(`Using base URL: ${BASE_URL}`)
  console.log('=' .repeat(80))
  console.log()

  const debugResult = await testDebugMatching()
  const pipelineResult = await testPipeline()

  console.log('=' .repeat(80))
  console.log('\n✨ All tests completed!\n')

  // Final summary
  console.log('📋 FINAL SUMMARY:')
  console.log(`  Total games tested: ${realPicksheetGames.length}`)
  console.log(`  Successfully matched: ${debugResult.summary.matched}`)
  console.log(`  Failed to match: ${debugResult.summary.unmatched}`)
  console.log(`  Match rate: ${debugResult.summary.matchRate}`)

  if (debugResult.summary.unmatched > 0) {
    console.log('\n💡 TIP: Check the unmatched games above to see:')
    console.log('   1. If they have candidates (team name resolution issue)')
    console.log('   2. If no candidates (game not in market data)')
    console.log('   3. Use the debug endpoint to investigate specific games')
  }

  console.log()
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
