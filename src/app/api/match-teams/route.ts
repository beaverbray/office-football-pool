import { NextRequest, NextResponse } from 'next/server'
import { EntityResolver } from '@/services/entity-resolution'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { teams, games, useLLM = false } = body

    const resolver = new EntityResolver()

    // Match individual teams if provided
    if (teams && Array.isArray(teams)) {
      const matches = await Promise.all(
        teams.map(team => resolver.matchTeam(team.name, team.league))
      )
      
      return NextResponse.json({
        success: true,
        matches,
        summary: {
          total: matches.length,
          highConfidence: matches.filter(m => m.confidence >= 0.8).length,
          mediumConfidence: matches.filter(m => m.confidence >= 0.6 && m.confidence < 0.8).length,
          lowConfidence: matches.filter(m => m.confidence < 0.6).length
        }
      })
    }

    // Match games if provided
    if (games && Array.isArray(games)) {
      const matches = await resolver.matchGames(games)
      
      return NextResponse.json({
        success: true,
        matches,
        summary: {
          total: matches.length,
          needsVerification: matches.filter(m => m.needsVerification).length,
          avgConfidence: matches.reduce((sum, m) => sum + m.overallConfidence, 0) / matches.length
        }
      })
    }

    return NextResponse.json(
      { error: 'No teams or games provided' },
      { status: 400 }
    )

  } catch (error) {
    console.error('Error matching teams:', error)
    return NextResponse.json(
      { error: 'Failed to match teams', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}