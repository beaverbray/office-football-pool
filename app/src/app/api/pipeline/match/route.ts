import { NextRequest, NextResponse } from 'next/server'
import { GameMatchingService, SourceGame } from '@/services/game-matching-service'
import { ScheduleService } from '@/services/schedule-service'

/**
 * Pipeline matching endpoint - matches picksheet and market games via schedule
 * Called by the Edge Function to leverage full entity resolution
 *
 * POST /api/pipeline/match
 * Body: {
 *   picksheetGames: Array<{ homeTeam, awayTeam, spread, gameType }>,
 *   marketGames: Array<{ homeTeam, awayTeam, homeSpread, gameTime, league }>,
 *   week: number
 * }
 *
 * Returns: {
 *   success: boolean,
 *   matches: Array<{
 *     matchNumber: number,
 *     scheduleGame: { home_team, away_team, league },
 *     picksheetGame: { homeTeam, awayTeam, spread },
 *     marketGame: { homeTeam, awayTeam, homeSpread },
 *     confidence: number
 *   }>,
 *   unmatched: {
 *     picksheet: Array<{ homeTeam, awayTeam, reason }>,
 *     market: Array<{ homeTeam, awayTeam, reason }>
 *   },
 *   summary: { matched, total, matchRate }
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const { picksheetGames, marketGames, week } = body

    if (!picksheetGames || !Array.isArray(picksheetGames)) {
      return NextResponse.json(
        { error: 'picksheetGames array is required' },
        { status: 400 }
      )
    }

    if (!marketGames || !Array.isArray(marketGames)) {
      return NextResponse.json(
        { error: 'marketGames array is required' },
        { status: 400 }
      )
    }

    if (!week) {
      return NextResponse.json(
        { error: 'week is required' },
        { status: 400 }
      )
    }

    console.log(`[MATCH API] Matching ${picksheetGames.length} picksheet games and ${marketGames.length} market games for week ${week}`)

    // Load schedule games
    const scheduleGames = await ScheduleService.getGamesByWeek(week)
    console.log(`[MATCH API] Loaded ${scheduleGames.length} schedule games`)

    if (scheduleGames.length === 0) {
      return NextResponse.json({
        success: false,
        error: `No schedule games found for week ${week}`,
        matches: [],
        unmatched: {
          picksheet: picksheetGames.map(g => ({ ...g, reason: 'No schedule games' })),
          market: marketGames.map(g => ({ ...g, reason: 'No schedule games' }))
        },
        summary: { matched: 0, total: picksheetGames.length, matchRate: 0 }
      })
    }

    // Convert picksheet games to SourceGame format
    const picksheetSourceGames: SourceGame[] = picksheetGames.map((g: any) => ({
      homeTeam: g.homeTeam || g.home_team,
      awayTeam: g.awayTeam || g.away_team,
      spread: g.spread,
      gameType: g.gameType || g.game_type
    }))

    // Convert market games to SourceGame format
    const marketSourceGames: SourceGame[] = marketGames.map((g: any) => ({
      homeTeam: g.homeTeam || g.home_team,
      awayTeam: g.awayTeam || g.away_team,
      homeSpread: g.homeSpread,
      gameTime: g.gameTime,
      league: g.league
    }))

    // Match picksheet games to schedule
    console.log(`[MATCH API] Matching picksheet games to schedule...`)
    const picksheetMatches = GameMatchingService.matchPicksheetToSchedule(
      picksheetSourceGames,
      scheduleGames
    )
    console.log(`[MATCH API] Picksheet matched: ${picksheetMatches.size}/${picksheetSourceGames.length}`)

    // Match market games to schedule
    console.log(`[MATCH API] Matching market games to schedule...`)
    const marketMatches = GameMatchingService.matchMarketToSchedule(
      marketSourceGames,
      scheduleGames
    )
    console.log(`[MATCH API] Market matched: ${marketMatches.size}/${marketSourceGames.length}`)

    // Build final matches by joining on match_number
    const matches: any[] = []
    const matchedPicksheetIndices = new Set<number>()
    const matchedMarketIndices = new Set<number>()

    for (const scheduleGame of scheduleGames) {
      const pickMatch = picksheetMatches.get(scheduleGame.match_number)
      const marketMatch = marketMatches.get(scheduleGame.match_number)

      if (pickMatch && marketMatch) {
        // Find original indices for tracking
        const pickIdx = picksheetSourceGames.findIndex(
          g => g.homeTeam === pickMatch.game.homeTeam && g.awayTeam === pickMatch.game.awayTeam
        )
        const marketIdx = marketSourceGames.findIndex(
          g => g.homeTeam === marketMatch.game.homeTeam && g.awayTeam === marketMatch.game.awayTeam
        )

        if (pickIdx >= 0) matchedPicksheetIndices.add(pickIdx)
        if (marketIdx >= 0) matchedMarketIndices.add(marketIdx)

        matches.push({
          matchNumber: scheduleGame.match_number,
          scheduleGame: {
            match_number: scheduleGame.match_number,
            home_team: scheduleGame.home_team,
            away_team: scheduleGame.away_team,
            league: scheduleGame.league,
            week: scheduleGame.week
          },
          picksheetGame: pickMatch.game,
          marketGame: marketMatch.game,
          confidence: Math.min(pickMatch.confidence, marketMatch.confidence)
        })
      }
    }

    // Track unmatched games
    const unmatchedPicksheet = picksheetSourceGames
      .filter((_, idx) => !matchedPicksheetIndices.has(idx))
      .map(g => {
        // Check if it matched to schedule but not to market
        const matchedToSchedule = Array.from(picksheetMatches.values())
          .some(m => m.game.homeTeam === g.homeTeam && m.game.awayTeam === g.awayTeam)

        return {
          homeTeam: g.homeTeam,
          awayTeam: g.awayTeam,
          spread: g.spread,
          reason: matchedToSchedule
            ? 'Matched to schedule but no market odds available'
            : 'Could not match to schedule'
        }
      })

    const unmatchedMarket = marketSourceGames
      .filter((_, idx) => !matchedMarketIndices.has(idx))
      .map(g => {
        const matchedToSchedule = Array.from(marketMatches.values())
          .some(m => m.game.homeTeam === g.homeTeam && m.game.awayTeam === g.awayTeam)

        return {
          homeTeam: g.homeTeam,
          awayTeam: g.awayTeam,
          league: g.league,
          reason: matchedToSchedule
            ? 'Matched to schedule but not on picksheet'
            : 'Could not match to schedule'
        }
      })

    const duration = Date.now() - startTime
    console.log(`[MATCH API] Completed in ${duration}ms - ${matches.length} full matches`)

    return NextResponse.json({
      success: true,
      matches,
      unmatched: {
        picksheet: unmatchedPicksheet,
        market: unmatchedMarket
      },
      summary: {
        matched: matches.length,
        total: picksheetGames.length,
        matchRate: picksheetGames.length > 0
          ? (matches.length / picksheetGames.length * 100).toFixed(1) + '%'
          : '0%',
        scheduleGames: scheduleGames.length,
        picksheetMatchedToSchedule: picksheetMatches.size,
        marketMatchedToSchedule: marketMatches.size
      },
      duration
    })

  } catch (error) {
    console.error('[MATCH API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Matching failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
