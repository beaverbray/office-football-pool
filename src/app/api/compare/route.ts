import { NextRequest, NextResponse } from 'next/server'
import { comparisonEngine } from '@/services/comparison-engine'
import { EntityResolver } from '@/services/entity-resolution'
import { getOddsAPI } from '@/services/odds-api'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { picksheetGames, marketGames, useOddsAPI = false } = body

    // If useOddsAPI is true, fetch live odds
    let actualMarketGames = marketGames
    if (useOddsAPI && !marketGames) {
      try {
        const oddsAPI = getOddsAPI()
        const { nfl, ncaaf } = await oddsAPI.getAllSpreads()
        
        // Convert odds API format to our format
        actualMarketGames = [...nfl, ...ncaaf].map(game => {
          const spread = (oddsAPI.constructor as any).getBestSpread(game)
          return {
            gameId: game.id,
            homeTeam: spread.homeTeam,
            awayTeam: spread.awayTeam,
            homeSpread: spread.homeSpread || 0,
            gameTime: game.commence_time
          }
        })
      } catch (error) {
        console.error('Failed to fetch odds from API:', error)
        return NextResponse.json(
          { error: 'Failed to fetch market odds' },
          { status: 500 }
        )
      }
    }

    if (!picksheetGames || !actualMarketGames) {
      return NextResponse.json(
        { error: 'Missing picksheetGames or marketGames' },
        { status: 400 }
      )
    }

    // Use entity resolver to match games
    const resolver = new EntityResolver()

    // PRE-RESOLVE all team names once (O(n+m) instead of O(n*m))
    // For picksheet games, do game-level league detection
    const picksheetResolved = await Promise.all(
      picksheetGames.map(async (game: any, idx: number) => {
        // Try to determine league from both team names
        const homeMatch = await resolver.matchTeam(game.homeTeam)
        const awayMatch = await resolver.matchTeam(game.awayTeam)

        // If both teams resolved to different leagues, retry with inferred league
        if (homeMatch.league !== awayMatch.league) {
          // Prefer NFL if either team is clearly NFL
          const inferredLeague = (homeMatch.league === 'NFL' || awayMatch.league === 'NFL') ? 'NFL' : 'NCAAF'

          // Re-resolve with inferred league for consistency
          const homeMatchFixed = await resolver.matchTeam(game.homeTeam, inferredLeague)
          const awayMatchFixed = await resolver.matchTeam(game.awayTeam, inferredLeague)

          return {
            index: idx,
            homeMatch: homeMatchFixed,
            awayMatch: awayMatchFixed,
            original: game
          }
        }

        return {
          index: idx,
          homeMatch,
          awayMatch,
          original: game
        }
      })
    )

    const marketResolved = await Promise.all(
      actualMarketGames.map(async (game: any, idx: number) => ({
        index: idx,
        homeMatch: await resolver.matchTeam(game.homeTeam, game.league),
        awayMatch: await resolver.matchTeam(game.awayTeam, game.league),
        original: game,
        league: game.league
      }))
    )

    const matches: Array<{
      picksheetIndex: number
      marketIndex: number
      confidence: number
      isSwapped?: boolean
    }> = []

    const usedMarketIndices = new Set<number>() // Prevent duplicate matches

    // Match each picksheet game to market games
    for (const pGame of picksheetResolved) {
      let bestMatch = {
        marketIndex: -1,
        confidence: 0,
        isSwapped: false
      }

      for (const mGame of marketResolved) {
        // Skip if this market game is already matched
        if (usedMarketIndices.has(mGame.index)) {
          continue
        }

        // Check if teams match (normal or swapped)
        const normalMatch =
          pGame.homeMatch.matchedName === mGame.homeMatch.matchedName &&
          pGame.awayMatch.matchedName === mGame.awayMatch.matchedName

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

          if (confidence > bestMatch.confidence) {
            bestMatch = {
              marketIndex: mGame.index,
              confidence,
              isSwapped: swappedMatch
            }
          }
        }
      }

      if (bestMatch.marketIndex !== -1) {
        matches.push({
          picksheetIndex: pGame.index,
          marketIndex: bestMatch.marketIndex,
          confidence: bestMatch.confidence,
          isSwapped: bestMatch.isSwapped
        })
        usedMarketIndices.add(bestMatch.marketIndex) // Mark as used
      }
    }

    // Run comparison
    const result = comparisonEngine.compareGames(
      picksheetGames,
      actualMarketGames,
      matches
    )

    return NextResponse.json({
      success: true,
      ...result
    })

  } catch (error) {
    console.error('Error in comparison:', error)
    return NextResponse.json(
      { error: 'Failed to compare games', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}