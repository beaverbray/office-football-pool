import { NextRequest, NextResponse } from 'next/server'
import { WarrenNolanScraper } from '@/services/warren-nolan-scraper'
import { supabase } from '@/lib/supabase'
import { ScheduleService } from '@/services/schedule-service'
import { GameMatchingService } from '@/services/game-matching-service'
import { Database } from '@/types/database'

type PredictionInsert = Database['public']['Tables']['predictions']['Insert']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, saveToDB = false } = body

    console.log('Warren Nolan scrape request:', { date, saveToDB })

    // Scrape predictions
    const result = date
      ? await WarrenNolanScraper.scrapePredictions(date)
      : await WarrenNolanScraper.scrapeTodaysPredictions()

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
      // Parse game date to determine week (Warren Nolan uses current date)
      const gameDate = new Date(result.gameDate)
      const seasonStart = new Date(gameDate.getFullYear(), 8, 1) // September 1
      const weeksPassed = Math.floor((gameDate.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
      const currentWeek = Math.max(0, Math.min(15, weeksPassed))

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
      const dbRecords: PredictionInsert[] = result.predictions.map(pred => {
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
          } as unknown as Database['public']['Tables']['predictions']['Row']['metadata']
        }
      })

      const { data, error } = await supabase
        .from('predictions')
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

    // Scrape predictions
    const result = date
      ? await WarrenNolanScraper.scrapePredictions(date)
      : await WarrenNolanScraper.scrapeTodaysPredictions()

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
      gameDate: result.gameDate
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
