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
    const matches: Array<{
      picksheetIndex: number
      marketIndex: number
      confidence: number
    }> = []

    // Match each picksheet game to market games
    for (let pIdx = 0; pIdx < picksheetGames.length; pIdx++) {
      const picksheetGame = picksheetGames[pIdx]
      let bestMatch = {
        marketIndex: -1,
        confidence: 0
      }

      for (let mIdx = 0; mIdx < actualMarketGames.length; mIdx++) {
        const marketGame = actualMarketGames[mIdx]
        
        // Match home teams
        const homeMatch = await resolver.matchTeam(picksheetGame.homeTeam)
        const marketHomeMatch = await resolver.matchTeam(marketGame.homeTeam)
        
        // Match away teams
        const awayMatch = await resolver.matchTeam(picksheetGame.awayTeam)
        const marketAwayMatch = await resolver.matchTeam(marketGame.awayTeam)
        
        // Check if teams match
        const teamsMatch = 
          (homeMatch.matchedName === marketHomeMatch.matchedName &&
           awayMatch.matchedName === marketAwayMatch.matchedName) ||
          // Also check reversed (in case home/away are swapped)
          (homeMatch.matchedName === marketAwayMatch.matchedName &&
           awayMatch.matchedName === marketHomeMatch.matchedName)
        
        if (teamsMatch) {
          const confidence = Math.min(
            homeMatch.confidence,
            awayMatch.confidence,
            marketHomeMatch.confidence,
            marketAwayMatch.confidence
          )
          
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              marketIndex: mIdx,
              confidence
            }
          }
        }
      }

      if (bestMatch.marketIndex !== -1) {
        matches.push({
          picksheetIndex: pIdx,
          marketIndex: bestMatch.marketIndex,
          confidence: bestMatch.confidence
        })
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