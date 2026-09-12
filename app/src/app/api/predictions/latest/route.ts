import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { WeekDetector } from '@/services/week-detector'

// This handler reads live state (database rows / the ESPN feed), so it must
// run per request. Without this Next prerenders it as static content at
// build time and freezes the response: the deployed endpoint kept serving a
// snapshot of the predictions table taken during the build, so scrapes that
// landed afterwards were invisible no matter how the caches were busted.
export const dynamic = 'force-dynamic'

// Type inference from Supabase client - database types will be auto-generated
type PredictionRow = any

// Cache for predictions with timestamp and week
let predictionsCache: { data: any[], timestamp: number, week: number } | null = null
const CACHE_TTL = 60 * 1000 // 1 minute cache

export async function GET(request: NextRequest) {
  try {
    const now = Date.now()

    // Each league runs its own week number, and they differ: this slate is NFL
    // week 1 and CFB week 2. Filtering every row against the NFL week discarded
    // all college predictions, which is why MOD was blank for the 47 college
    // games on a 61-game board.
    const [weekInfo, ncaaWeekInfo] = await Promise.all([
      WeekDetector.getCurrentNFLWeek(),
      WeekDetector.getCurrentNCAAWeek()
    ])
    const currentWeek = weekInfo.week
    const weekForSource: Record<string, number> = {
      nfelo: weekInfo.week,
      'warren-nolan': ncaaWeekInfo.week
    }

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

    // Keep this week's rows for each league. Finished games are dropped later,
    // deliberately after deduplication.
    const currentWeekPredictions = allPredictions.filter((pred: PredictionRow) => {
      // Compare against the week for THIS row's league, not a single global one.
      const expectedWeek = weekForSource[pred.source] ?? currentWeek
      return pred.metadata?.week === expectedWeek
    })

    // Deduplicate by game, keeping the most recent row (the query is sorted by
    // scraped_at descending).
    const gameMap = new Map<string, PredictionRow>()

    for (const pred of currentWeekPredictions) {
      const gameKey = `${pred.home_team}|${pred.away_team}`
      if (!gameMap.has(gameKey)) {
        gameMap.set(gameKey, pred)
      }
    }

    // Drop finished games only now. Filtering them before the dedupe let an
    // older snapshot of the same game resurface once the latest scrape marked
    // it Final — Missouri @ Kansas came back as a stale "4th Qtr" row carrying
    // pre-correction numbers, while the current row said Final. A finished game
    // should disappear, not revert.
    const latestUnfinished = Array.from(gameMap.values()).filter(
      (pred: PredictionRow) => pred.game_time?.toLowerCase() !== 'final'
    )

    // Transform to prediction format (include source to distinguish NFL vs NCAAF)
    // Note: PostgreSQL numeric types come back as strings in JSON, so we parse them
    const transformedPredictions = latestUnfinished.map((pred: PredictionRow) => ({
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
