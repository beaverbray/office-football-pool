import { NextRequest, NextResponse } from 'next/server'
import { WarrenNolanScraper, type WarrenNolanPrediction } from '@/services/warren-nolan-scraper'
import { supabase } from '@/lib/supabase'
import { ScheduleService } from '@/services/schedule-service'
import { GameMatchingService } from '@/services/game-matching-service'
import { Database } from '@/types/database'

// TODO: Update after regenerating database types with: npx supabase gen types typescript
type PredictionInsert = Database['public']['Tables']['analysis_predictions']['Insert']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, week, season, saveToDB = false } = body

    console.log('Warren Nolan scrape request:', { date, week, season, saveToDB })

    // Scrape predictions - prioritize week-based scraping
    let result: any
    if (week !== undefined && season) {
      result = await WarrenNolanScraper.scrapePredictionsByWeek(season, week)
    } else if (week !== undefined) {
      // Use current season if not specified
      const currentSeason = new Date().getFullYear()
      result = await WarrenNolanScraper.scrapePredictionsByWeek(currentSeason, week)
    } else if (date) {
      result = await WarrenNolanScraper.scrapePredictions(date)
    } else {
      // Default to current week scraping
      result = await WarrenNolanScraper.scrapeCurrentWeek()
    }

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Failed to scrape predictions',
          details: result.error
        },
        { status: 500 }
      )
    }

    // Optionally save to database
    if (saveToDB && result.predictions.length > 0) {
      // Get week - either from result or calculate from date
      let currentWeek: number
      if (result.week !== undefined) {
        currentWeek = result.week
      } else if (result.gameDate) {
        const gameDate = new Date(result.gameDate)
        const seasonStart = new Date(gameDate.getFullYear(), 7, 24) // August 24 (Week 0)
        const weeksPassed = Math.floor((gameDate.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
        currentWeek = Math.max(0, Math.min(14, weeksPassed))
      } else {
        currentWeek = 0
      }

      // Load schedule for the week to match predictions (NCAA)
      const scheduleGames = await ScheduleService.getGamesByWeek(currentWeek, 'NCAA')

      if (scheduleGames.length === 0) {
        console.warn(`No NCAA schedule games found for week ${currentWeek}`)
      }

      // Match predictions to schedule
      const matchedPredictions = GameMatchingService.matchPredictionsToSchedule(
        result.predictions,
        scheduleGames,
        'NCAAF'
      )

      console.log(`Matched ${matchedPredictions.size} of ${result.predictions.length} Warren Nolan predictions to schedule`)

      // Build prediction records with schedule match info
      const dbRecords: PredictionInsert[] = result.predictions.map((pred: WarrenNolanPrediction) => {
        // Find the schedule match for this prediction
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
            matchConfidence,
          } as unknown as Database['public']['Tables']['analysis_predictions']['Row']['metadata']
        }
      })

      const { data, error } = await supabase
        .from('analysis_predictions')
        .insert(dbRecords as any)
        .select()

      if (error) {
        console.error('Database insert error:', error)
        return NextResponse.json(
          {
            success: true,
            predictions: result.predictions,
            scrapedAt: result.scrapedAt,
            gameDate: result.gameDate,
            dbSaveError: error.message,
            warning: 'Predictions scraped but not saved to database'
          },
          { status: 207 } // Multi-status
        )
      }

      return NextResponse.json({
        success: true,
        predictions: result.predictions,
        scrapedAt: result.scrapedAt,
        gameDate: result.gameDate,
        week: result.week,
        season: result.season,
        savedToDb: true,
        dbRecordsCount: data?.length || 0,
        matchedCount: matchedPredictions.size
      })
    }

    return NextResponse.json({
      success: true,
      predictions: result.predictions,
      scrapedAt: result.scrapedAt,
      gameDate: result.gameDate,
      week: result.week,
      season: result.season,
      savedToDb: false
    })

  } catch (error) {
    console.error('Warren Nolan API error:', error)
    return NextResponse.json(
      {
        error: 'API request failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const date = searchParams.get('date')
    const weekParam = searchParams.get('week')
    const seasonParam = searchParams.get('season')

    // Scrape predictions - prioritize week-based scraping
    let result: any
    if (weekParam) {
      const week = parseInt(weekParam)
      const season = seasonParam ? parseInt(seasonParam) : new Date().getFullYear()
      result = await WarrenNolanScraper.scrapePredictionsByWeek(season, week)
    } else if (date) {
      result = await WarrenNolanScraper.scrapePredictions(date)
    } else {
      // Default to current week scraping
      result = await WarrenNolanScraper.scrapeCurrentWeek()
    }

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Failed to scrape predictions',
          details: result.error
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      predictions: result.predictions,
      scrapedAt: result.scrapedAt,
      gameDate: result.gameDate,
      week: result.week,
      season: result.season
    })

  } catch (error) {
    console.error('Warren Nolan API error:', error)
    return NextResponse.json(
      {
        error: 'API request failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
