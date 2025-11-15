import { NextRequest, NextResponse } from 'next/server'
import { oddsFetcher } from '@/services/odds-fetcher'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max execution time

/**
 * POST /api/odds/fetch
 *
 * Fetches current odds from The Odds API and stores them in the database
 *
 * Query parameters:
 * - sport: 'nfl', 'ncaaf', or 'all' (default: 'all')
 *
 * Example: POST /api/odds/fetch?sport=nfl
 */
export async function POST(request: NextRequest) {
  try {
    // Check if API key is configured
    if (!process.env.THE_ODDS_API_KEY && !process.env.ODDS_API_KEY) {
      return NextResponse.json(
        {
          error: 'The Odds API key not configured',
          message: 'Please add THE_ODDS_API_KEY or ODDS_API_KEY to your environment variables'
        },
        { status: 503 }
      )
    }

    // Check if service role key is configured (needed for database writes)
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        {
          error: 'Supabase service role key not configured',
          message: 'Please add SUPABASE_SERVICE_ROLE_KEY to your environment variables'
        },
        { status: 503 }
      )
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const sport = searchParams.get('sport') || 'all'

    let result

    switch (sport.toLowerCase()) {
      case 'nfl':
        result = await oddsFetcher.fetchAndStoreOdds('NFL')
        break

      case 'ncaaf':
        result = await oddsFetcher.fetchAndStoreOdds('NCAAF')
        break

      case 'all':
      default:
        result = await oddsFetcher.fetchAndStoreAllOdds()
        break
    }

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error fetching and storing odds:', error)

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('Invalid API key')) {
        return NextResponse.json(
          {
            error: 'Invalid API key',
            message: 'Please check your THE_ODDS_API_KEY configuration'
          },
          { status: 401 }
        )
      }

      if (error.message.includes('Rate limit')) {
        return NextResponse.json(
          {
            error: 'Rate limit exceeded',
            message: 'Too many requests to The Odds API. Please try again later.'
          },
          { status: 429 }
        )
      }
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch and store odds',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/odds/fetch
 *
 * Returns information about the odds fetching endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/odds/fetch',
    method: 'POST',
    description: 'Fetches current odds from The Odds API and stores them in the database',
    parameters: {
      sport: 'nfl | ncaaf | all (default: all)'
    },
    example: 'POST /api/odds/fetch?sport=nfl',
    requiredEnvVars: [
      'THE_ODDS_API_KEY or ODDS_API_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'NEXT_PUBLIC_SUPABASE_URL'
    ]
  })
}
