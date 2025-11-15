import { NextResponse } from 'next/server'
import { WeekDetector } from '@/services/week-detector'

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
