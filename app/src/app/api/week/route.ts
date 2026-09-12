import { NextResponse } from 'next/server'
import { WeekDetector } from '@/services/week-detector'

// This handler reads live state (database rows / the ESPN feed), so it must
// run per request. Without this Next prerenders it as static content at
// build time and freezes the response: the deployed endpoint kept serving a
// snapshot of the predictions table taken during the build, so scrapes that
// landed afterwards were invisible no matter how the caches were busted.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Fetch weeks in parallel for better performance
    const [nflWeek, ncaafWeek] = await Promise.all([
      WeekDetector.getCurrentNFLWeek(),
      WeekDetector.getCurrentNCAAWeek()
    ])

    const currentDate = new Date().toISOString().split('T')[0]

    return NextResponse.json({
      success: true,
      nfl: {
        week: nflWeek.week,
        seasonYear: nflWeek.seasonYear,
        formatted: `Week ${nflWeek.week}, ${nflWeek.seasonYear}`
      },
      ncaaf: {
        week: ncaafWeek.week,
        seasonYear: ncaafWeek.seasonYear,
        formatted: `Week ${ncaafWeek.week}, ${ncaafWeek.seasonYear}`
      },
      currentDate
    })
  } catch (error) {
    console.error('Week detection error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to detect current week',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Revalidate every hour
export const revalidate = 3600
