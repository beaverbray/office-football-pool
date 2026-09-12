import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// This handler reads live database rows, so it must run per request. Without
// this Next prerenders it as static content at build time and freezes the
// response: the deployed endpoint kept serving a snapshot of the predictions
// table taken during the build, so scrapes that landed afterwards were
// invisible no matter how the caches were busted.
export const dynamic = 'force-dynamic'

// Type inference from Supabase client - database types will be auto-generated
type PredictionRow = any

let predictionsCache: { data: any[], timestamp: number, week: number | null } | null = null
const CACHE_TTL = 60 * 1000 // 1 minute cache

export async function GET() {
  try {
    const now = Date.now()

    if (predictionsCache && (now - predictionsCache.timestamp) < CACHE_TTL) {
      return NextResponse.json({
        success: true,
        predictions: predictionsCache.data,
        count: predictionsCache.data.length,
        week: predictionsCache.week,
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

    // Each league's current week comes from its own newest row. The query is
    // sorted by scraped_at descending, so the first row seen for a source is
    // from that source's latest scrape — and the latest scrape IS the current
    // week by construction.
    //
    // This previously called WeekDetector on every request and compared against
    // ESPN's answer. That made the response depend on a live third-party call
    // in the read path: one invocation disagreed about the college week and
    // served 16 rows (nfelo only, all 114 college rows filtered away), which
    // the CDN then handed to the dashboard. Reading the week off the data
    // removes the flake and two ESPN round-trips per request.
    const weekForSource = new Map<string, number>()
    for (const pred of allPredictions) {
      const week = pred.metadata?.week
      if (week != null && !weekForSource.has(pred.source)) {
        weekForSource.set(pred.source, week)
      }
    }

    const currentWeekPredictions = allPredictions.filter(
      (pred: PredictionRow) => pred.metadata?.week === weekForSource.get(pred.source)
    )

    // Deduplicate by game, keeping the most recent row.
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
    //
    // Prefix match, not equality: Warren Nolan also writes "Final/3OTs".
    const latestUnfinished = Array.from(gameMap.values()).filter(
      (pred: PredictionRow) => !pred.game_time?.toLowerCase().startsWith('final')
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

    const currentWeek = weekForSource.get('nfelo') ?? null

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
      // Per-league weeks, so a bad filter is visible in the payload rather than
      // showing up as silently missing games.
      weeks: Object.fromEntries(weekForSource),
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
