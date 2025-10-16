import { NextRequest, NextResponse } from 'next/server'
import { WarrenNolanScraper } from '@/services/warren-nolan-scraper'
import { pipelineOrchestrator } from '@/services/pipeline-orchestrator'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, useOddsAPI = true, matchingThreshold = 0.4 } = body

    console.log('Warren Nolan pipeline request:', {
      date,
      useOddsAPI,
      matchingThreshold
    })

    // Step 1: Scrape Warren Nolan predictions
    const scrapeResult = date
      ? await WarrenNolanScraper.scrapePredictions(date)
      : await WarrenNolanScraper.scrapeTodaysPredictions()

    if (!scrapeResult.success) {
      return NextResponse.json(
        {
          error: 'Failed to scrape predictions',
          details: scrapeResult.error
        },
        { status: 500 }
      )
    }

    console.log(`Scraped ${scrapeResult.predictions.length} predictions from Warren Nolan`)

    // Step 2: Convert to pipeline format
    const picksheetGames = WarrenNolanScraper.convertToPipelineFormat(
      scrapeResult.predictions
    )

    // Step 3: Run through existing pipeline
    const pipelineResult = await pipelineOrchestrator.runPipeline(
      { picksheetGames },
      {
        useOddsAPI,
        useLLM: false, // No need for LLM parsing since we already have structured data
        includeLogs: true,
        matchingThreshold
      }
    )

    // Step 4: Return combined results
    return NextResponse.json({
      success: pipelineResult.status !== 'failed',
      scraping: {
        success: scrapeResult.success,
        predictionsCount: scrapeResult.predictions.length,
        scrapedAt: scrapeResult.scrapedAt,
        gameDate: scrapeResult.gameDate
      },
      pipeline: pipelineResult,
      predictions: scrapeResult.predictions
    })

  } catch (error) {
    console.error('Warren Nolan pipeline error:', error)
    return NextResponse.json(
      {
        error: 'Pipeline execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}
