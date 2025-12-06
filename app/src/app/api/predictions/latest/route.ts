import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
// Type inference from Supabase client - database types will be auto-generated
type PredictionRow = any

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

    // Only fetch predictions scraped within the last 3 days
    // This filters out old games from previous weeks
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    const cutoffDate = threeDaysAgo.toISOString()

    // Fetch all recent predictions from NFELO (NFL) and Warren Nolan (NCAAF)
    // We need to get more than 100 to account for duplicates, then filter
    const { data: allPredictions, error } = await (supabase as any)
      .from('analysis_predictions')
      .select('*')
      .in('source', ['nfelo', 'warren-nolan']) // Fetch both NFL and NCAAF predictions
      .gte('scraped_at', cutoffDate) // Only predictions from the last 3 days
      .order('scraped_at', { ascending: false })
      .limit(500) as { data: PredictionRow[] | null, error: any } // Get more rows to ensure we have all unique games

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
    const gameMap = new Map<string, PredictionRow>()

    for (const pred of allPredictions) {
      const gameKey = `${pred.home_team}|${pred.away_team}`

      // Only add if this game isn't in the map yet (since results are sorted by scraped_at desc)
      if (!gameMap.has(gameKey)) {
        gameMap.set(gameKey, pred)
      }
    }

    // Transform to prediction format (include source to distinguish NFL vs NCAAF)
    // Note: PostgreSQL numeric types come back as strings in JSON, so we parse them
    const transformedPredictions = Array.from(gameMap.values()).map((pred: PredictionRow) => ({
      homeTeam: pred.home_team,
      awayTeam: pred.away_team,
      predictedWinner: pred.predicted_winner,
      winProbability: pred.win_probability != null ? parseFloat(pred.win_probability) : null,
      spread: pred.spread != null ? parseFloat(pred.spread) : null,
      source: pred.source, // Include source (nfelo or warren-nolan)
      confidence: pred.confidence, // Include confidence level
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
