import { NextRequest, NextResponse } from 'next/server'
import { EntityResolver } from '@/services/entity-resolution'
import { getOddsAPI } from '@/services/odds-api'

/**
 * Debug endpoint to analyze why games are not matching
 * Usage: POST with { picksheetGames: [...], fetchMarketGames: true/false }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { picksheetGames, marketGames: providedMarketGames, fetchMarketGames = false } = body

    if (!picksheetGames || !Array.isArray(picksheetGames)) {
      return NextResponse.json(
        { error: 'picksheetGames array is required' },
        { status: 400 }
      )
    }

    // Get market games
    let marketGames = providedMarketGames
    if (fetchMarketGames || !marketGames) {
      const oddsAPI = getOddsAPI()
      const { nfl, ncaaf } = await oddsAPI.getAllSpreads()

      marketGames = [...nfl, ...ncaaf].map(game => {
        const spread = (oddsAPI.constructor as any).getBestSpread(game)
        return {
          gameId: game.id,
          homeTeam: spread.homeTeam,
          awayTeam: spread.awayTeam,
          homeSpread: spread.homeSpread || 0,
          gameTime: game.commence_time,
          league: game.sport_key.includes('nfl') ? 'NFL' : 'NCAAF'
        }
      })
    }

    const resolver = new EntityResolver()

    // Pre-resolve all picksheet teams with game-level league detection
    console.log('\n=== Pre-resolving picksheet teams with game-level league detection ===')
    const picksheetResolved = await Promise.all(
      picksheetGames.map(async (game: any, idx: number) => {
        // Try to determine league from both team names
        const homeMatch = await resolver.matchTeam(game.homeTeam)
        const awayMatch = await resolver.matchTeam(game.awayTeam)

        console.log(`\nPicksheet Game ${idx}: ${game.awayTeam} @ ${game.homeTeam}`)
        console.log(`  Home: "${game.homeTeam}" => "${homeMatch.matchedName}" (${homeMatch.league}, ${homeMatch.confidence.toFixed(2)} confidence)`)
        console.log(`  Away: "${game.awayTeam}" => "${awayMatch.matchedName}" (${awayMatch.league}, ${awayMatch.confidence.toFixed(2)} confidence)`)

        // If both teams resolved to different leagues, retry with inferred league
        if (homeMatch.league !== awayMatch.league) {
          // Prefer NFL if either team is clearly NFL
          const inferredLeague = (homeMatch.league === 'NFL' || awayMatch.league === 'NFL') ? 'NFL' : 'NCAAF'
          console.log(`  ⚠️  League mismatch detected! Home=${homeMatch.league}, Away=${awayMatch.league}. Inferring: ${inferredLeague}`)

          // Re-resolve with inferred league for consistency
          const homeMatchFixed = await resolver.matchTeam(game.homeTeam, inferredLeague)
          const awayMatchFixed = await resolver.matchTeam(game.awayTeam, inferredLeague)

          console.log(`  ✓ Re-resolved: Home => "${homeMatchFixed.matchedName}" (${homeMatchFixed.league}, ${homeMatchFixed.confidence.toFixed(2)})`)
          console.log(`  ✓ Re-resolved: Away => "${awayMatchFixed.matchedName}" (${awayMatchFixed.league}, ${awayMatchFixed.confidence.toFixed(2)})`)

          return {
            original: game,
            homeMatch: homeMatchFixed,
            awayMatch: awayMatchFixed,
            index: idx
          }
        }

        return {
          original: game,
          homeMatch,
          awayMatch,
          index: idx
        }
      })
    )

    // Pre-resolve all market teams
    console.log('\n=== Pre-resolving market teams ===')
    const marketResolved = await Promise.all(
      marketGames.map(async (game: any, idx: number) => {
        const homeMatch = await resolver.matchTeam(game.homeTeam, game.league)
        const awayMatch = await resolver.matchTeam(game.awayTeam, game.league)

        console.log(`\nMarket Game ${idx}: ${game.awayTeam} @ ${game.homeTeam} [${game.league}]`)
        console.log(`  Home: "${game.homeTeam}" => "${homeMatch.matchedName}" (${homeMatch.confidence.toFixed(2)} confidence)`)
        console.log(`  Away: "${game.awayTeam}" => "${awayMatch.matchedName}" (${awayMatch.confidence.toFixed(2)} confidence)`)

        return {
          original: game,
          homeMatch,
          awayMatch,
          index: idx,
          league: game.league
        }
      })
    )

    // Find matches
    console.log('\n=== Finding matches ===')
    const matchAnalysis = []
    const matched = new Set<number>() // Track which market games have been matched

    for (const pGame of picksheetResolved) {
      const candidates = []

      for (const mGame of marketResolved) {
        // Skip if already matched
        if (matched.has(mGame.index)) continue

        // Check normal match
        const normalMatch =
          pGame.homeMatch.matchedName === mGame.homeMatch.matchedName &&
          pGame.awayMatch.matchedName === mGame.awayMatch.matchedName

        // Check swapped match
        const swappedMatch =
          pGame.homeMatch.matchedName === mGame.awayMatch.matchedName &&
          pGame.awayMatch.matchedName === mGame.homeMatch.matchedName

        if (normalMatch || swappedMatch) {
          const confidence = Math.min(
            pGame.homeMatch.confidence,
            pGame.awayMatch.confidence,
            mGame.homeMatch.confidence,
            mGame.awayMatch.confidence
          )

          candidates.push({
            marketIndex: mGame.index,
            marketGame: mGame.original,
            confidence,
            isSwapped: swappedMatch,
            matchType: normalMatch ? 'normal' : 'swapped'
          })
        }
      }

      // Sort by confidence
      candidates.sort((a, b) => b.confidence - a.confidence)

      const bestMatch = candidates[0]
      if (bestMatch) {
        matched.add(bestMatch.marketIndex)
      }

      matchAnalysis.push({
        picksheetIndex: pGame.index,
        picksheetGame: pGame.original,
        picksheetResolved: {
          home: `${pGame.original.homeTeam} => ${pGame.homeMatch.matchedName} (${pGame.homeMatch.league})`,
          away: `${pGame.original.awayTeam} => ${pGame.awayMatch.matchedName} (${pGame.awayMatch.league})`
        },
        matched: !!bestMatch,
        bestMatch: bestMatch ? {
          marketGame: bestMatch.marketGame,
          confidence: bestMatch.confidence,
          matchType: bestMatch.matchType
        } : null,
        allCandidates: candidates.map(c => ({
          game: `${c.marketGame.awayTeam} @ ${c.marketGame.homeTeam} [${c.marketGame.league}]`,
          confidence: c.confidence,
          matchType: c.matchType
        }))
      })
    }

    // Summary statistics
    const matchedCount = matchAnalysis.filter(m => m.matched).length
    const unmatchedCount = matchAnalysis.filter(m => !m.matched).length

    console.log(`\n=== Matching Summary ===`)
    console.log(`Matched: ${matchedCount}/${picksheetGames.length}`)
    console.log(`Unmatched: ${unmatchedCount}`)

    // List unmatched games
    const unmatchedPicksheet = matchAnalysis.filter(m => !m.matched)
    const unmatchedMarket = marketResolved
      .filter(m => !matched.has(m.index))
      .map(m => ({
        game: `${m.original.awayTeam} @ ${m.original.homeTeam}`,
        league: m.league,
        resolved: {
          home: `${m.original.homeTeam} => ${m.homeMatch.matchedName}`,
          away: `${m.original.awayTeam} => ${m.awayMatch.matchedName}`
        }
      }))

    return NextResponse.json({
      success: true,
      summary: {
        totalPicksheet: picksheetGames.length,
        totalMarket: marketGames.length,
        matched: matchedCount,
        unmatched: unmatchedCount,
        matchRate: (matchedCount / picksheetGames.length * 100).toFixed(1) + '%'
      },
      matchAnalysis,
      unmatchedPicksheet,
      unmatchedMarket
    })

  } catch (error) {
    console.error('Debug matching error:', error)
    return NextResponse.json(
      {
        error: 'Debug matching failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
