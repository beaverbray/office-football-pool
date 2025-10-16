import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Cache for predictions with timestamp
let predictionsCache: { data: any[], timestamp: number } | null = null
const CACHE_TTL = 60 * 1000 // 1 minute cache

export async function GET(request: NextRequest) {
  try {
    const now = Date.now()

    // Return cached data if still fresh
    if (predictionsCache && (now - predictionsCache.timestamp) < CACHE_TTL) {
      return NextResponse.json({
        success: true,
        predictions: predictionsCache.data,
        count: predictionsCache.data.length,
        cached: true
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
        }
      })
    }

    // Fetch all recent predictions, then deduplicate by game
    // We need to get more than 100 to account for duplicates, then filter
    const { data: allPredictions, error } = await supabase
      .from('predictions')
      .select('*')
      .order('scraped_at', { ascending: false })
      .limit(500) // Get more rows to ensure we have all unique games

    if (error) {
      console.error('Error fetching predictions:', error)
      return NextResponse.json(
        { error: 'Failed to fetch predictions', details: error.message },
        { status: 500 }
      )
    }

    if (!allPredictions) {
      return NextResponse.json({
        success: true,
        predictions: [],
        count: 0
      })
    }

    // Deduplicate by game (home_team + away_team)
    // Keep only the most recent prediction for each unique game
    const gameMap = new Map<string, any>()

    for (const pred of allPredictions) {
      const gameKey = `${pred.home_team}|${pred.away_team}`

      // Only add if this game isn't in the map yet (since results are sorted by scraped_at desc)
      if (!gameMap.has(gameKey)) {
        gameMap.set(gameKey, pred)
      }
    }

    // Transform to ELOPrediction format
    const transformedPredictions = Array.from(gameMap.values()).map((pred: any) => ({
      homeTeam: pred.home_team,
      awayTeam: pred.away_team,
      predictedWinner: pred.predicted_winner,
      winProbability: pred.win_probability,
      spread: pred.spread,
    }))

    // Update cache
    predictionsCache = {
      data: transformedPredictions,
      timestamp: now
    }

    return NextResponse.json({
      success: true,
      predictions: transformedPredictions,
      count: transformedPredictions.length,
      cached: false
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
      }
    })
  } catch (error) {
    console.error('Predictions API error:', error)
    return NextResponse.json(
      {
        error: 'API request failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
