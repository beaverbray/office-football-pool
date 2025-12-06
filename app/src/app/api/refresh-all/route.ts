import { NextRequest, NextResponse } from 'next/server'
import { WeekDetector, type WeekInfo } from '@/services/week-detector'
import { NFELOScraper, type NFELOScraperResult, type NFELOPrediction } from '@/services/nfelo-scraper'
import { WarrenNolanScraper, type WarrenNolanScraperResult, type WarrenNolanPrediction } from '@/services/warren-nolan-scraper'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ScheduleService } from '@/services/schedule-service'
import { GameMatchingService } from '@/services/game-matching-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60 seconds for this endpoint

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
    // Stage 5: Save refreshed pipeline to database
    // =========================================================================
    console.log('Stage 5: Saving refreshed pipeline...')
    const { error: saveError } = await supabase
      .from('pipeline_current')
      .upsert({
        id: 'current',
        pipeline_data: refreshedPipeline,
        picksheet_text: currentPipelineRow.picksheet_text,
        updated_at: new Date().toISOString()
      } as any)

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
      message: `Refreshed successfully in ${(timing.total / 1000).toFixed(1)}s. ${gamesMatched} games matched.`
    } as RefreshAllResponse)

  } catch (error) {
    console.error('Error in refresh-all:', error)
    timing.total = Date.now() - startTime

    return NextResponse.json({
      success: false,
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
