import { NextRequest, NextResponse } from 'next/server'
import { NFELOScraper } from '@/services/nfelo-scraper'
import { supabase } from '@/lib/supabase'
import { ScheduleService } from '@/services/schedule-service'
import { GameMatchingService } from '@/services/game-matching-service'
import { Database } from '@/types/database'

type PredictionInsert = Database['public']['Tables']['predictions']['Insert']

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const season = searchParams.get('season')
    const week = searchParams.get('week')

    let result
    if (season && week) {
      result = await NFELOScraper.scrapePredictions(parseInt(season), parseInt(week))
    } else {
      result = await NFELOScraper.scrapeCurrentWeek()
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('NFELO scrape error:', error)
    return NextResponse.json(
      {
        error: 'Failed to scrape NFELO predictions',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { season, week, saveToDatabase = false } = body

    let result
    if (season && week) {
      result = await NFELOScraper.scrapePredictions(season, week)
    } else {
      result = await NFELOScraper.scrapeCurrentWeek()
    }

    if (!result.success) {
      return NextResponse.json(result, { status: 500 })
    }

    // Optionally save to database
    if (saveToDatabase && result.predictions.length > 0) {
      // Load schedule for the week to match predictions
      const scheduleGames = await ScheduleService.getGamesByWeek(result.week, 'NFL')

      if (scheduleGames.length === 0) {
        console.warn(`No schedule games found for week ${result.week}`)
      }

      // Match predictions to schedule
      const matchedPredictions = GameMatchingService.matchPredictionsToSchedule(
        result.predictions,
        scheduleGames,
        'NFL'
      )

      console.log(`Matched ${matchedPredictions.size} of ${result.predictions.length} NFELO predictions to schedule`)

      // Build prediction records with schedule match info
      const predictionRecords: PredictionInsert[] = result.predictions.map(pred => {
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
          source: 'nfelo',
          game_time: pred.gameTime,
          home_team: pred.homeTeam,
          away_team: pred.awayTeam,
          predicted_winner: pred.predictedWinner,
          win_probability: pred.winProbability,
          confidence: (pred.winProbability >= 70 ? 'H' : pred.winProbability >= 55 ? 'M' : 'L') as 'H' | 'M' | 'L',
          spread: pred.spread,
          over_under: pred.overUnder ?? null,
          game_date: new Date().toISOString().split('T')[0], // Add current date
          metadata: {
            awayElo: pred.awayElo,
            homeElo: pred.homeElo,
            week: result.week,
            season: result.season,
            scheduleMatchNumber,
            matchConfidence,
          } as unknown as Database['public']['Tables']['predictions']['Row']['metadata'],
        }
      })

      const { error: insertError } = await supabase
        .from('predictions')
        .insert(predictionRecords as any)

      if (insertError) {
        console.error('Error saving NFELO predictions:', insertError)
        return NextResponse.json(
          {
            ...result,
            warning: 'Predictions scraped but failed to save to database',
            dbError: insertError.message,
          },
          { status: 207 }
        )
      }

      console.log(`Saved ${predictionRecords.length} NFELO predictions to database (${matchedPredictions.size} matched to schedule)`)
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('NFELO scrape error:', error)
    return NextResponse.json(
      {
        error: 'Failed to scrape NFELO predictions',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
