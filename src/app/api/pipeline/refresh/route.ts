import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { WeekDetector } from '@/services/week-detector'

export const dynamic = 'force-dynamic'

interface CurrentPipelineRow {
  id: string
  pipeline_data: any
  picksheet_text: string | null
  updated_at: string
  metadata: any
}

export async function POST() {
  try {
    // Load current pipeline from database
    const { data, error } = await (supabase as any)
      .from('pipeline_current')
      .select('*')
      .eq('id', 'current')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({
          success: false,
          error: 'No pipeline data found',
          message: 'Please process a picksheet first in the Control Panel'
        }, { status: 404 })
      }

      throw error
    }

    const row = data as CurrentPipelineRow
    const currentPipeline = row.pipeline_data
    const picksheetText = row.picksheet_text

    // Extract picksheet games from the current pipeline
    // Support both old format (parsing.games) and new format (comparison.comparisons)
    let picksheetGames: any[] = []
    let needsFullPipeline = false

    if (currentPipeline?.parsing?.games && currentPipeline.parsing.games.length > 0) {
      // Old format - already has correct structure
      picksheetGames = currentPipeline.parsing.games
    } else if (currentPipeline?.comparison?.comparisons && currentPipeline.comparison.comparisons.length > 0) {
      // New format - extract games from comparisons and convert to expected structure
      picksheetGames = currentPipeline.comparison.comparisons.map((comp: any) => ({
        league: comp.league,
        homeTeam: comp.homeTeam,
        awayTeam: comp.awayTeam,
        spread: comp.picksheetSpread, // Single spread value (home team's perspective)
        gameTime: comp.gameTime
      }))
    } else if (picksheetText && picksheetText.trim().length > 0) {
      // No valid picksheet games found, but we have picksheet text - run full pipeline
      console.log('No picksheet games found in pipeline data, but picksheet text is available. Running full pipeline with LLM parsing.')
      needsFullPipeline = true
    } else {
      return NextResponse.json({
        success: false,
        error: 'No picksheet data found',
        message: 'No picksheet games or text available. Please add a picksheet in the Control Panel.'
      }, { status: 400 })
    }

    // Import pipeline orchestrator
    const { pipelineOrchestrator } = await import('@/services/pipeline-orchestrator')

    // Detect current week dynamically
    const nflWeek = await WeekDetector.getCurrentNFLWeek()
    const currentWeek = nflWeek.week

    console.log('Using current week:', currentWeek, '(previously was:', currentPipeline?.config?.week, ')')

    let refreshedPipeline

    if (needsFullPipeline) {
      // Run full pipeline with LLM parsing
      console.log('Running full pipeline with LLM parsing from picksheet text')
      refreshedPipeline = await pipelineOrchestrator.runPipeline(
        {
          picksheetText: picksheetText || undefined
        },
        {
          useOddsAPI: true,
          useLLM: true, // Use LLM to parse picksheet text
          includeLogs: false,
          matchingThreshold: currentPipeline?.config?.matchingThreshold || 0.4,
          week: currentWeek
        }
      )
    } else {
      // Quick refresh with existing picksheet games
      console.log('Refreshing market data with', picksheetGames.length, 'picksheet games')
      refreshedPipeline = await pipelineOrchestrator.runPipeline(
        {
          picksheetGames: picksheetGames
        },
        {
          useOddsAPI: true,
          useLLM: false, // Don't need LLM since we already have structured games
          includeLogs: false,
          matchingThreshold: currentPipeline?.config?.matchingThreshold || 0.4,
          week: currentWeek
        }
      )
    }

    // Check if refresh found any matching games
    if (refreshedPipeline.matching?.matches === 0) {
      return NextResponse.json({
        success: false,
        error: 'No matching games found',
        message: 'The picksheet contains games that may have already finished or are not available in the odds API.'
      }, { status: 400 })
    }

    // Save refreshed pipeline back to database
    const { error: updateError } = await supabase
      .from('pipeline_current')
      .upsert({
        id: 'current',
        pipeline_data: refreshedPipeline,
        picksheet_text: picksheetText, // Preserve picksheet text
        updated_at: new Date().toISOString()
      } as any)

    if (updateError) {
      console.error('Failed to save refreshed pipeline:', updateError)
      // Still return the refreshed data even if save fails
    }

    const message = needsFullPipeline
      ? `Full pipeline completed successfully! ${refreshedPipeline.matching?.matches || 0} games matched.`
      : `Market data refreshed successfully! ${refreshedPipeline.matching?.matches || 0} games matched.`

    return NextResponse.json({
      success: true,
      pipeline: refreshedPipeline,
      message
    })
  } catch (error) {
    console.error('Error refreshing pipeline:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to refresh pipeline',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Keep GET for compatibility
export async function GET() {
  return POST()
}
