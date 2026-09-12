import { NextRequest, NextResponse } from 'next/server'
import { WeekDetector, type WeekInfo } from '@/services/week-detector'
import { NFELOScraper, type NFELOScraperResult, type NFELOPrediction } from '@/services/nfelo-scraper'
import { WarrenNolanScraper, type WarrenNolanScraperResult, type WarrenNolanPrediction } from '@/services/warren-nolan-scraper'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ScheduleService } from '@/services/schedule-service'
import { GameMatchingService } from '@/services/game-matching-service'
import { recordOddsSnapshots, getOpeningSpreads } from '@/services/opening-lines'

export const dynamic = 'force-dynamic'
// The full pipeline measured 42s cold locally but exceeded 60s on Vercel
// (504 FUNCTION_INVOCATION_TIMEOUT at 62.5s, from the scheduled job), since the
// deployed function additionally pays cold start, region latency to Supabase
// and The Odds API, and the nfelo/Warren Nolan scrapes. 300s is the Fluid
// Compute ceiling and leaves real headroom; this route runs a handful of times
// a week, so a generous limit costs nothing.
export const maxDuration = 300

interface RefreshAllRequest {
  skipPredictions?: boolean
  forceWeek?: number
}

interface PredictionSaveResult {
  count: number
  week: number
  saved: boolean
  matchedCount?: number
  error?: string
}

interface TimingMetrics {
  weekDetection: number
  predictionsScrape: number
  nfeloScrape?: number
  warrenNolanScrape?: number
  pipelineExecution: number
  total: number
}

interface RefreshAllResponse {
  success: boolean
  // false when the refreshed pipeline could not be written back to the DB
  // (e.g. missing service-role key, or a transient DB error). The refreshed
  // data is still returned, but it was NOT persisted.
  // Same top-level shape as /api/pipeline/refresh so callers can read one field.
  persisted: boolean
  pipeline?: any
  timing: TimingMetrics
  predictions: {
    nfelo: PredictionSaveResult | null
    warrenNolan: PredictionSaveResult | null
  }
  meta: {
    nflWeek: number
    ncaaWeek: number
    gamesMatched: number
    picksheetSource: 'cached' | 'none'
  }
  error?: string
  message?: string
}

/**
 * Extract picksheet games from existing pipeline data
 * Supports both old format (parsing.games) and new format (comparison.comparisons)
 */
function extractPicksheetGames(pipelineData: any): any[] {
  if (pipelineData?.parsing?.games && pipelineData.parsing.games.length > 0) {
    return pipelineData.parsing.games
  }

  if (pipelineData?.comparison?.comparisons && pipelineData.comparison.comparisons.length > 0) {
    return pipelineData.comparison.comparisons.map((comp: any) => ({
      league: comp.league,
      homeTeam: comp.homeTeam,
      awayTeam: comp.awayTeam,
      spread: comp.picksheetSpread,
      gameTime: comp.gameTime
    }))
  }

  return []
}

/**
 * Save NFELO predictions to database
 * Following pattern from /api/nfelo/scrape
 */
async function saveNfeloPredictions(
  result: NFELOScraperResult,
  nflWeek: WeekInfo
): Promise<PredictionSaveResult> {
  if (!result.success || result.predictions.length === 0) {
    return {
      count: 0,
      week: nflWeek.week,
      saved: false,
      error: result.error || 'No predictions to save'
    }
  }

  try {
    // Load schedule for matching
    const scheduleGames = await ScheduleService.getGamesByWeek(result.week, 'NFL')

    // Match predictions to schedule
    const matchedPredictions = GameMatchingService.matchPredictionsToSchedule(
      result.predictions,
      scheduleGames,
      'NFL'
    )

    // Build prediction records
    const predictionRecords = result.predictions.map((pred: NFELOPrediction) => {
      let scheduleMatchNumber: number | undefined
      let matchConfidence = 0

      for (const [matchNumber, match] of matchedPredictions.entries()) {
        if (match.prediction === pred) {
          scheduleMatchNumber = matchNumber
          matchConfidence = match.confidence
          break
        }
      }

      return {
        source: 'nfelo',
        game_time: pred.gameTime,
        home_team: pred.homeTeam,
        away_team: pred.awayTeam,
        predicted_winner: pred.predictedWinner,
        win_probability: pred.winProbability,
        confidence: (pred.winProbability >= 70 ? 'H' : pred.winProbability >= 55 ? 'M' : 'L') as 'H' | 'M' | 'L',
        spread: pred.spread,
        over_under: pred.overUnder ?? null,
        game_date: new Date().toISOString().split('T')[0],
        metadata: {
          awayElo: pred.awayElo,
          homeElo: pred.homeElo,
          week: result.week,
          season: result.season,
          scheduleMatchNumber,
          matchConfidence
        }
      }
    })

    if (!supabaseAdmin) {
      throw new Error('Service role key not configured')
    }

    const { error: insertError } = await supabaseAdmin
      .from('analysis_predictions')
      .insert(predictionRecords as any)

    if (insertError) {
      console.error('Error saving NFELO predictions:', insertError)
      return {
        count: result.predictions.length,
        week: result.week,
        saved: false,
        matchedCount: matchedPredictions.size,
        error: insertError.message
      }
    }

    console.log(`Saved ${predictionRecords.length} NFELO predictions (${matchedPredictions.size} matched to schedule)`)
    return {
      count: result.predictions.length,
      week: result.week,
      saved: true,
      matchedCount: matchedPredictions.size
    }
  } catch (error) {
    console.error('Error in saveNfeloPredictions:', error)
    return {
      count: result.predictions.length,
      week: result.week,
      saved: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Save Warren Nolan predictions to database
 * Following pattern from /api/warren-nolan/scrape
 */
async function saveWarrenNolanPredictions(
  result: WarrenNolanScraperResult,
  ncaaWeek: WeekInfo
): Promise<PredictionSaveResult> {
  if (!result.success || result.predictions.length === 0) {
    return {
      count: 0,
      week: ncaaWeek.week,
      saved: false,
      error: result.error || 'No predictions to save'
    }
  }

  try {
    // Determine week - ESPN shows upcoming week, so we may need to adjust
    const currentWeek = result.week !== undefined ? result.week : ncaaWeek.week

    // Load schedule for matching (NCAA)
    const scheduleGames = await ScheduleService.getGamesByWeek(currentWeek, 'NCAA')

    // Match predictions to schedule
    const matchedPredictions = GameMatchingService.matchPredictionsToSchedule(
      result.predictions,
      scheduleGames,
      'NCAA' as any
    )

    // Build prediction records
    const predictionRecords = result.predictions.map((pred: WarrenNolanPrediction) => {
      let scheduleMatchNumber: number | undefined
      let matchConfidence = 0

      for (const [matchNumber, match] of matchedPredictions.entries()) {
        if (match.prediction === pred) {
          scheduleMatchNumber = matchNumber
          matchConfidence = match.confidence
          break
        }
      }

      return {
        source: 'warren-nolan',
        game_time: pred.gameTime,
        home_team: pred.homeTeam,
        away_team: pred.awayTeam,
        predicted_winner: pred.predictedWinner,
        win_probability: pred.winProbability,
        confidence: pred.confidence,
        spread: pred.spread,
        over_under: pred.overUnder ?? null,
        game_date: result.gameDate,
        scraped_at: result.scrapedAt,
        metadata: {
          rawData: pred,
          week: currentWeek,
          scheduleMatchNumber,
          matchConfidence
        }
      }
    })

    if (!supabaseAdmin) {
      throw new Error('Service role key not configured')
    }

    const { error: insertError } = await supabaseAdmin
      .from('analysis_predictions')
      .insert(predictionRecords as any)

    if (insertError) {
      console.error('Error saving Warren Nolan predictions:', insertError)
      return {
        count: result.predictions.length,
        week: currentWeek,
        saved: false,
        matchedCount: matchedPredictions.size,
        error: insertError.message
      }
    }

    console.log(`Saved ${predictionRecords.length} Warren Nolan predictions (${matchedPredictions.size} matched to schedule)`)
    return {
      count: result.predictions.length,
      week: currentWeek,
      saved: true,
      matchedCount: matchedPredictions.size
    }
  } catch (error) {
    console.error('Error in saveWarrenNolanPredictions:', error)
    return {
      count: result.predictions.length,
      week: result.week ?? ncaaWeek.week,
      saved: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const timing: TimingMetrics = {
    weekDetection: 0,
    predictionsScrape: 0,
    pipelineExecution: 0,
    total: 0
  }

  try {
    // Parse request body (optional)
    let body: RefreshAllRequest = {}
    try {
      body = await request.json()
    } catch {
      // Empty body is fine
    }

    const { skipPredictions = false, forceWeek } = body

    // =========================================================================
    // Stage 1: Detect current weeks (NFL and NCAA in parallel)
    // =========================================================================
    console.log('Stage 1: Detecting current weeks...')
    const weekStart = Date.now()

    const [nflWeek, ncaaWeek] = await Promise.all([
      WeekDetector.getCurrentNFLWeek(),
      WeekDetector.getCurrentNCAAWeek()
    ])

    timing.weekDetection = Date.now() - weekStart
    console.log(`Week detection complete: NFL Week ${nflWeek.week}, NCAA Week ${ncaaWeek.week} (${timing.weekDetection}ms)`)

    // =========================================================================
    // Stage 2: Load existing picksheet from database
    // =========================================================================
    console.log('Stage 2: Loading existing picksheet...')
    const { data: currentPipelineRow, error: loadError } = await (supabase as any)
      .from('pipeline_current')
      .select('*')
      .eq('id', 'current')
      .single()

    if (loadError) {
      if (loadError.code === 'PGRST116') {
        return NextResponse.json({
          success: false,
          persisted: false,
          error: 'No picksheet data found',
          message: 'Please upload a picksheet in the Control Panel first',
          timing: { ...timing, total: Date.now() - startTime },
          predictions: { nfelo: null, warrenNolan: null },
          meta: { nflWeek: nflWeek.week, ncaaWeek: ncaaWeek.week, gamesMatched: 0, picksheetSource: 'none' as const }
        } as RefreshAllResponse, { status: 400 })
      }
      throw loadError
    }

    const picksheetGames = extractPicksheetGames(currentPipelineRow.pipeline_data)
    if (picksheetGames.length === 0) {
      return NextResponse.json({
        success: false,
        persisted: false,
        error: 'No picksheet games found',
        message: 'The current pipeline has no games. Please upload a new picksheet in the Control Panel.',
        timing: { ...timing, total: Date.now() - startTime },
        predictions: { nfelo: null, warrenNolan: null },
        meta: { nflWeek: nflWeek.week, ncaaWeek: ncaaWeek.week, gamesMatched: 0, picksheetSource: 'none' as const }
      } as RefreshAllResponse, { status: 400 })
    }

    console.log(`Loaded ${picksheetGames.length} picksheet games from database`)

    // =========================================================================
    // Stage 3: Scrape predictions in parallel (if not skipped)
    // =========================================================================
    let nfeloSaveResult: PredictionSaveResult | null = null
    let wnSaveResult: PredictionSaveResult | null = null

    if (!skipPredictions) {
      console.log('Stage 3: Scraping predictions in parallel...')
      const predictionStart = Date.now()

      // Use forceWeek if provided, otherwise use detected weeks
      const nflWeekToUse = forceWeek ?? nflWeek.week
      // For NCAA, ESPN shows upcoming week, so subtract 1 to get current/recent week
      const ncaaWeekToUse = forceWeek ?? Math.max(0, ncaaWeek.week - 1)

      const [nfeloResult, wnResult] = await Promise.allSettled([
        NFELOScraper.scrapePredictions(nflWeek.seasonYear, nflWeekToUse),
        WarrenNolanScraper.scrapePredictionsByWeek(ncaaWeek.seasonYear, ncaaWeekToUse)
      ])

      timing.predictionsScrape = Date.now() - predictionStart

      // Process NFELO result
      if (nfeloResult.status === 'fulfilled') {
        console.log(`NFELO scrape: ${nfeloResult.value.predictions.length} predictions`)
        nfeloSaveResult = await saveNfeloPredictions(nfeloResult.value, nflWeek)
      } else {
        console.warn('NFELO scrape failed:', nfeloResult.reason)
        nfeloSaveResult = {
          count: 0,
          week: nflWeekToUse,
          saved: false,
          error: nfeloResult.reason?.message || 'Scrape failed'
        }
      }

      // Process Warren Nolan result
      if (wnResult.status === 'fulfilled') {
        console.log(`Warren Nolan scrape: ${wnResult.value.predictions.length} predictions`)
        wnSaveResult = await saveWarrenNolanPredictions(wnResult.value, ncaaWeek)
      } else {
        console.warn('Warren Nolan scrape failed:', wnResult.reason)
        wnSaveResult = {
          count: 0,
          week: ncaaWeekToUse,
          saved: false,
          error: wnResult.reason?.message || 'Scrape failed'
        }
      }

      console.log(`Predictions scrape complete (${timing.predictionsScrape}ms)`)
    } else {
      console.log('Stage 3: Skipping predictions scrape (skipPredictions=true)')
    }

    // =========================================================================
    // Stage 4: Run pipeline refresh with fresh odds
    // =========================================================================
    console.log('Stage 4: Running pipeline refresh...')
    const pipelineStart = Date.now()

    const { pipelineOrchestrator } = await import('@/services/pipeline-orchestrator')

    const refreshedPipeline = await pipelineOrchestrator.runPipeline(
      { picksheetGames },
      {
        useOddsAPI: true,
        useLLM: false, // Don't need LLM since we already have structured games
        includeLogs: false,
        matchingThreshold: currentPipelineRow.pipeline_data?.config?.matchingThreshold || 0.4,
        week: forceWeek ?? nflWeek.week
      }
    )

    timing.pipelineExecution = Date.now() - pipelineStart
    console.log(`Pipeline refresh complete: ${refreshedPipeline.matching?.matches || 0} games matched (${timing.pipelineExecution}ms)`)

    // =========================================================================
    // Stage 4b: Record this observation, and attach the earliest one we have
    // =========================================================================
    // The odds were already fetched and paid for above; without this they are
    // discarded every run, which is why afbp.odds_snapshots sat empty and the
    // dashboard's OPEN column had nothing real to show.
    //
    // Best-effort throughout: the pipeline's own output does not depend on it,
    // so a snapshot failure must not fail a refresh that otherwise succeeded.
    try {
      const marketGames = (refreshedPipeline.oddsRetrieval as { games?: Array<{ gameId: string; homeSpread?: number }> })?.games ?? []

      const snap = await recordOddsSnapshots(marketGames)
      if (snap.error) console.warn('Odds snapshot not recorded:', snap.error)
      else console.log(`Recorded ${snap.recorded} odds snapshots`)

      const comparisons = refreshedPipeline.comparison?.comparisons as Array<Record<string, unknown>> | undefined
      if (comparisons?.length) {
        // comparison.gameId is the Odds API event id, so it joins directly to
        // event_provider_key (verified: 62/62 on the live board).
        const keys = comparisons.map(c => String(c.gameId)).filter(Boolean)
        // Kickoffs let the lookup pick each game's own Tuesday capture rather
        // than the first time the season-long NFL feed ever mentioned it.
        const kickoffs = new Map<string, string>()
        for (const c of comparisons) {
          if (c.gameId && c.gameTime) kickoffs.set(String(c.gameId), String(c.gameTime))
        }
        const opening = await getOpeningSpreads(keys, kickoffs)
        for (const c of comparisons) {
          const hit = opening.get(String(c.gameId))
          // Home-perspective, matching marketSpread/picksheetSpread.
          c.openingSpread = hit ? hit.spread : null
          c.openingLineTimestamp = hit ? hit.observedAt : null
        }
        console.log(`Attached opening lines to ${[...opening.keys()].length} of ${comparisons.length} comparisons`)
      }
    } catch (error) {
      console.warn('Opening-line step failed (non-fatal):', error instanceof Error ? error.message : String(error))
    }

    // =========================================================================
    // Stage 5: Save refreshed pipeline to database
    // =========================================================================
    console.log('Stage 5: Saving refreshed pipeline...')
    // Writes require the service-role client: anon writes are blocked by RLS
    // (see supabase/migrations/20260813120000_restrict_pipeline_current_anon_writes.sql)
    // afbp.pipeline_current isn't in the generated Database type yet (tracked separately);
    // narrow local cast instead of `any` since we control the row shape here.
    let saveError: { message: string } | null = null
    if (!supabaseAdmin) {
      saveError = { message: 'Service role key not configured' }
    } else {
      const admin = supabaseAdmin as unknown as {
        from(table: 'pipeline_current'): {
          upsert(row: {
            id: string
            pipeline_data: unknown
            picksheet_text: string | null
            updated_at: string
          }): Promise<{ error: { message: string } | null }>
        }
      }
      const result = await admin
        .from('pipeline_current')
        .upsert({
          id: 'current',
          // Carry `parsing` forward (issue #31). The orchestrator's result has
          // no `parsing` key, so replacing pipeline_data wholesale destroyed
          // the picksheet games written by the fetch. extractPicksheetGames
          // then falls back to `comparison.comparisons`, meaning a refresh run
          // without a preceding fetch consumes its own previous output —
          // monotonically lossy, observed collapsing 65 games to 1.
          pipeline_data: {
            ...refreshedPipeline,
            parsing: refreshedPipeline.parsing ?? currentPipelineRow.pipeline_data?.parsing ?? null,
            // Same reasoning as `parsing` (#31): the orchestrator result has no
            // `entry`, so replacing pipeline_data wholesale would discard which
            // picks we have already made and which have locked. Only the fetch
            // can produce it — Splash blocks datacenter IPs, so Vercel cannot
            // re-read it.
            entry: currentPipelineRow.pipeline_data?.entry ?? null
          },
          picksheet_text: currentPipelineRow.picksheet_text,
          updated_at: new Date().toISOString()
        })
      saveError = result.error
    }

    if (saveError) {
      console.error('Failed to save refreshed pipeline:', saveError)
      // Continue anyway - we can still return the refreshed data
    }

    // =========================================================================
    // Stage 6: Return comprehensive response
    // =========================================================================
    timing.total = Date.now() - startTime

    const gamesMatched = refreshedPipeline.matching?.matches || 0
    console.log(`Refresh complete in ${timing.total}ms`)

    return NextResponse.json({
      success: true,
      persisted: !saveError,
      pipeline: refreshedPipeline,
      timing,
      predictions: {
        nfelo: nfeloSaveResult,
        warrenNolan: wnSaveResult
      },
      meta: {
        nflWeek: nflWeek.week,
        ncaaWeek: ncaaWeek.week,
        gamesMatched,
        picksheetSource: 'cached' as const
      },
      message: saveError
        ? `Refreshed in ${(timing.total / 1000).toFixed(1)}s (${gamesMatched} games matched), but the result could NOT be saved: ${saveError.message}`
        : `Refreshed successfully in ${(timing.total / 1000).toFixed(1)}s. ${gamesMatched} games matched.`
    } as RefreshAllResponse)

  } catch (error) {
    console.error('Error in refresh-all:', error)
    timing.total = Date.now() - startTime

    return NextResponse.json({
      success: false,
      persisted: false,
      error: 'Refresh failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timing,
      predictions: { nfelo: null, warrenNolan: null },
      meta: { nflWeek: 0, ncaaWeek: 0, gamesMatched: 0, picksheetSource: 'none' as const }
    } as RefreshAllResponse, { status: 500 })
  }
}

// GET endpoint for easy testing
export async function GET(request: NextRequest) {
  // Convert GET to POST with empty body
  return POST(request)
}
