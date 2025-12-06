import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { WeekDetector } from '@/services/week-detector'

// Type inference from Supabase client - database types will be auto-generated
type PredictionRow = any

// Cache for predictions with timestamp and week
let predictionsCache: { data: any[], timestamp: number, week: number } | null = null
const CACHE_TTL = 60 * 1000 // 1 minute cache

export async function GET(request: NextRequest) {
  try {
    const now = Date.now()

    // Get current NFL week
    const weekInfo = await WeekDetector.getCurrentNFLWeek()
    const currentWeek = weekInfo.week

    // Return cached data if still fresh and same week
    if (predictionsCache &&
        (now - predictionsCache.timestamp) < CACHE_TTL &&
        predictionsCache.week === currentWeek) {
      return NextResponse.json({
        success: true,
        predictions: predictionsCache.data,
        count: predictionsCache.data.length,
        week: currentWeek,
        cached: true
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
        }
      })
    }

    // Fetch all recent predictions from NFELO (NFL) and Warren Nolan (NCAAF)
    const { data: allPredictions, error } = await (supabase as any)
      .from('analysis_predictions')
      .select('*')
      .in('source', ['nfelo', 'warren-nolan'])
      .order('scraped_at', { ascending: false })
      .limit(500) as { data: PredictionRow[] | null, error: any }

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

    // Filter to current week only using metadata.week
    // Also filter out games marked as "Final" (already played)
    const currentWeekPredictions = allPredictions.filter((pred: PredictionRow) => {
      const predWeek = pred.metadata?.week
      const gameTime = pred.game_time?.toLowerCase()

      // Skip if no week in metadata or wrong week
      if (predWeek !== currentWeek) return false

      // Skip games that have already been played
      if (gameTime === 'final') return false

      return true
    })

    // Deduplicate by game (home_team + away_team)
    // Keep only the most recent prediction for each unique game
    const gameMap = new Map<string, PredictionRow>()

    for (const pred of currentWeekPredictions) {
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
      timestamp: now,
      week: currentWeek
    }

    return NextResponse.json({
      success: true,
      predictions: transformedPredictions,
      count: transformedPredictions.length,
      week: currentWeek,
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
