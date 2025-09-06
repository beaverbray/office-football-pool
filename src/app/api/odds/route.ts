import { NextRequest, NextResponse } from 'next/server'
import { OddsAPIService } from '@/services/odds-api'

export async function GET(request: NextRequest) {
  try {
    // Check if API key is configured
    if (!process.env.THE_ODDS_API_KEY) {
      return NextResponse.json(
        { 
          error: 'The Odds API key not configured',
          message: 'Please add THE_ODDS_API_KEY to your .env file'
        },
        { status: 503 }
      )
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const sport = searchParams.get('sport') || 'all' // 'nfl', 'ncaaf', or 'all'
    const refresh = searchParams.get('refresh') === 'true' // Force cache refresh

    // Clear cache if requested
    if (refresh) {
      OddsAPIService.clearCache()
    }

    const oddsService = new OddsAPIService()
    let data

    switch (sport.toLowerCase()) {
      case 'nfl':
        const nflOdds = await oddsService.getNFLSpreads()
        data = {
          sport: 'NFL',
          games: OddsAPIService.formatOddsForDisplay(nflOdds),
          raw: nflOdds
        }
        break

      case 'ncaaf':
        const ncaafOdds = await oddsService.getNCAASpreads()
        data = {
          sport: 'NCAAF', 
          games: OddsAPIService.formatOddsForDisplay(ncaafOdds),
          raw: ncaafOdds
        }
        break

      case 'all':
      default:
        const allOdds = await oddsService.getAllSpreads()
        data = {
          nfl: {
            sport: 'NFL',
            games: OddsAPIService.formatOddsForDisplay(allOdds.nfl),
            count: allOdds.nfl.length
          },
          ncaaf: {
            sport: 'NCAAF',
            games: OddsAPIService.formatOddsForDisplay(allOdds.ncaaf),
            count: allOdds.ncaaf.length
          },
          timestamp: new Date().toISOString()
        }
        break
    }

    return NextResponse.json({
      success: true,
      data,
      cached: !refresh,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error fetching odds:', error)
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('Invalid API key')) {
        return NextResponse.json(
          { error: 'Invalid API key', message: 'Please check your THE_ODDS_API_KEY' },
          { status: 401 }
        )
      }
      
      if (error.message.includes('Rate limit')) {
        return NextResponse.json(
          { error: 'Rate limit exceeded', message: 'Too many requests. Please try again later.' },
          { status: 429 }
        )
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch odds', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}