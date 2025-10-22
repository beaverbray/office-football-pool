import { NextRequest, NextResponse } from 'next/server'
import { pipelineOrchestrator } from '@/services/pipeline-orchestrator'
import { WeekDetector } from '@/services/week-detector'

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

    // Use dynamic week detection if not explicitly provided
    const week = body.week ?? WeekDetector.getCurrentNFLWeek().week

    // Log configuration for debugging
    console.log('Pipeline configuration:', {
      hasPicksheetText: !!body.picksheetText,
      textLength: body.picksheetText?.length,
      useOddsAPI: body.useOddsAPI ?? true,
      useLLM: body.useLLM ?? true,
      week: week,
      weekSource: body.week ? 'provided' : 'auto-detected',
      hasOddsAPIKey: !!(process.env.ODDS_API_KEY || process.env.THE_ODDS_API_KEY),
      hasOpenAIKey: !!process.env.OPENAI_API_KEY
    })

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
        matchingThreshold: body.matchingThreshold ?? 0.4, // Lowered from 0.6
        week: week // Use dynamically detected week by default
      }
    )

    return NextResponse.json({
      success: result.status !== 'failed',
      pipeline: result
    })

  } catch (error) {
    console.error('Pipeline execution error:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')

    // Provide more detailed error information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorDetails = {
      error: 'Pipeline execution failed',
      message: errorMessage,
      stage: 'pipeline_execution',
      hasOddsAPIKey: !!(process.env.ODDS_API_KEY || process.env.THE_ODDS_API_KEY),
      hasOpenAIKey: !!process.env.OPENAI_API_KEY
    }

    return NextResponse.json(errorDetails, { status: 500 })
  }
}