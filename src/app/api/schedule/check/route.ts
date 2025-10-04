import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const week = searchParams.get('week')

    // Get total count
    const { count: totalCount, error: totalError } = await supabase
      .from('schedule')
      .select('*', { count: 'exact', head: true })

    if (totalError) {
      return NextResponse.json(
        { error: 'Failed to query schedule', details: totalError.message },
        { status: 500 }
      )
    }

    // Get distinct weeks
    const { data: weekData, error: weekError } = await supabase
      .from('schedule')
      .select('week')
      .order('week')

    if (weekError) {
      return NextResponse.json(
        { error: 'Failed to query weeks', details: weekError.message },
        { status: 500 }
      )
    }

    const weeks = [...new Set(weekData.map(w => w.week))].sort((a, b) => a - b)

    // Get distinct leagues
    const { data: leagueData, error: leagueError } = await supabase
      .from('schedule')
      .select('league')

    if (leagueError) {
      return NextResponse.json(
        { error: 'Failed to query leagues', details: leagueError.message },
        { status: 500 }
      )
    }

    const leagues = [...new Set(leagueData.map(l => l.league))]

    // If week specified, get count for that week
    let weekCount = 0
    let weekGames: any[] = []
    if (week) {
      const { data: weekGameData, count, error: weekCountError } = await supabase
        .from('schedule')
        .select('*', { count: 'exact' })
        .eq('week', parseInt(week))
        .limit(5)

      if (!weekCountError) {
        weekCount = count || 0
        weekGames = weekGameData || []
      }
    }

    return NextResponse.json({
      success: true,
      totalGames: totalCount || 0,
      weeks: weeks,
      leagues: leagues,
      weekQuery: week ? {
        week: parseInt(week),
        count: weekCount,
        sampleGames: weekGames.map(g => ({
          awayTeam: g.away_team,
          homeTeam: g.home_team,
          league: g.league,
          week: g.week
        }))
      } : null
    })
  } catch (error) {
    console.error('Schedule check error:', error)
    return NextResponse.json(
      {
        error: 'Failed to check schedule',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
