import { NextRequest, NextResponse } from 'next/server'
import { pipelineOrchestrator } from '@/services/pipeline-orchestrator'
import { WeekDetector } from '@/services/week-detector'
import { supabaseJobQueue } from '@/services/job-queue-supabase'

// Supabase Edge Function URL
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://eoslblqescncxcypkmvj.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

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
    const nflWeek = await WeekDetector.getCurrentNFLWeek()
    const week = body.week ?? nflWeek.week

    // Check if async mode is requested (default to true for better UX)
    const useAsync = body.async ?? true

    const pipelineInput = {
      picksheetText: body.picksheetText,
      picksheetGames: body.picksheetGames,
      marketGames: body.marketGames
    }

    const pipelineConfig = {
      useOddsAPI: body.useOddsAPI ?? true,
      useLLM: body.useLLM ?? true,
      includeLogs: body.includeLogs ?? false,
      matchingThreshold: body.matchingThreshold ?? 0.4,
      week: week
    }

    // Log configuration for debugging
    console.log('Pipeline configuration:', {
      hasPicksheetText: !!body.picksheetText,
      textLength: body.picksheetText?.length,
      useOddsAPI: pipelineConfig.useOddsAPI,
      useLLM: pipelineConfig.useLLM,
      week: week,
      weekSource: body.week ? 'provided' : 'auto-detected',
      async: useAsync,
      hasOddsAPIKey: !!(process.env.ODDS_API_KEY || process.env.THE_ODDS_API_KEY),
      hasOpenAIKey: !!process.env.OPENAI_API_KEY
    })

    // ASYNC MODE: Create job and invoke Edge Function
    if (useAsync) {
      const jobId = await supabaseJobQueue.createJob({
        input: pipelineInput,
        config: pipelineConfig
      })

      // Invoke Supabase Edge Function (fire-and-forget)
      // The Edge Function has a 2-minute timeout vs Vercel's 10 seconds
      const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/run-pipeline`

      console.log(`Invoking Edge Function: ${edgeFunctionUrl}`)

      // Fire and forget - don't await the response
      fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          job_id: jobId,
          picksheet_text: body.picksheetText,
          week: week,
          config: pipelineConfig
        })
      }).catch(err => {
        console.error('Edge Function invocation error:', err)
        // Don't fail the request - the job is created, Edge Function may still work
      })

      return NextResponse.json({
        jobId,
        status: 'queued',
        message: 'Pipeline execution started in Edge Function',
        statusEndpoint: `/api/pipeline/status?jobId=${jobId}`
      })
    }

    // SYNC MODE: Run pipeline synchronously (legacy behavior - will timeout on Vercel free tier)
    const result = await pipelineOrchestrator.runPipeline(
      pipelineInput,
      pipelineConfig
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