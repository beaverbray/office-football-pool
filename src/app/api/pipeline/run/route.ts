import { NextRequest, NextResponse } from 'next/server'
import { pipelineOrchestrator } from '@/services/pipeline-orchestrator'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate input
    if (!body.picksheetText && !body.picksheetGames) {
      return NextResponse.json(
        { error: 'Either picksheetText or picksheetGames must be provided' },
        { status: 400 }
      )
    }

    // Run pipeline
    const result = await pipelineOrchestrator.runPipeline(
      {
        picksheetText: body.picksheetText,
        picksheetGames: body.picksheetGames,
        marketGames: body.marketGames
      },
      {
        useOddsAPI: body.useOddsAPI ?? true,
        useLLM: body.useLLM ?? true,
        includeLogs: body.includeLogs ?? false,
        matchingThreshold: body.matchingThreshold ?? 0.6
      }
    )

    return NextResponse.json({
      success: result.status !== 'failed',
      pipeline: result
    })

  } catch (error) {
    console.error('Pipeline execution error:', error)
    return NextResponse.json(
      { 
        error: 'Pipeline execution failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}