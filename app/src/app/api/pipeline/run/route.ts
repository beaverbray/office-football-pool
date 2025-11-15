import { NextRequest, NextResponse } from 'next/server'
import { pipelineOrchestrator } from '@/services/pipeline-orchestrator'
import { WeekDetector } from '@/services/week-detector'
import { jobQueue } from '@/services/job-queue'

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

    // ASYNC MODE: Create job and return immediately
    if (useAsync) {
      const jobId = jobQueue.createJob({
        input: pipelineInput,
        config: pipelineConfig
      })

      // Execute pipeline in background (non-blocking)
      setImmediate(async () => {
        try {
          jobQueue.startJob(jobId)
          jobQueue.addLog(jobId, 'Pipeline execution started')

          const result = await pipelineOrchestrator.runPipeline(
            pipelineInput,
            pipelineConfig,
            // Progress callback
            (stage: string, progress: number) => {
              jobQueue.updateJob(jobId, { stage, progress })
              jobQueue.addLog(jobId, `Stage: ${stage} (${progress}%)`)
            }
          )

          jobQueue.completeJob(jobId, result)
          jobQueue.addLog(jobId, 'Pipeline execution completed successfully')
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          jobQueue.failJob(jobId, errorMessage)
          jobQueue.addLog(jobId, `Pipeline execution failed: ${errorMessage}`)
          console.error('Background pipeline execution error:', error)
        }
      })

      return NextResponse.json({
        jobId,
        status: 'queued',
        message: 'Pipeline execution started in background',
        statusEndpoint: `/api/pipeline/status?jobId=${jobId}`
      })
    }

    // SYNC MODE: Run pipeline synchronously (legacy behavior)
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