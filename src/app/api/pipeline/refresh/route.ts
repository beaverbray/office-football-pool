import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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
    const { data, error } = await supabase
      .from('current_pipeline')
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

    // Extract picksheet games from the current pipeline
    if (!currentPipeline?.parsing?.games || currentPipeline.parsing.games.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No picksheet games found',
        message: 'The current pipeline does not contain picksheet games. Please re-process in Control Panel.'
      }, { status: 400 })
    }

    console.log('Refreshing market data with', currentPipeline.parsing.games.length, 'picksheet games')

    // Import pipeline orchestrator
    const { pipelineOrchestrator } = await import('@/services/pipeline-orchestrator')

    // Re-run pipeline with fresh odds
    const refreshedPipeline = await pipelineOrchestrator.runPipeline(
      {
        picksheetGames: currentPipeline.parsing.games
      },
      {
        useOddsAPI: true,
        useLLM: false, // Don't need LLM since we already have structured games
        includeLogs: false,
        matchingThreshold: currentPipeline.config?.matchingThreshold || 0.4,
        week: currentPipeline.config?.week
      }
    )

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
      .from('current_pipeline')
      .upsert({
        id: 'current',
        pipeline_data: refreshedPipeline,
        updated_at: new Date().toISOString()
      } as any)

    if (updateError) {
      console.error('Failed to save refreshed pipeline:', updateError)
      // Still return the refreshed data even if save fails
    }

    return NextResponse.json({
      success: true,
      pipeline: refreshedPipeline,
      message: `Market data refreshed successfully! ${refreshedPipeline.matching?.matches || 0} games matched.`
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
