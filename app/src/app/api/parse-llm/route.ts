import { NextRequest, NextResponse } from 'next/server'
import { LLMPicksheetParser } from '@/services/llm-picksheet-parser'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text } = body

    if (!text) {
      return NextResponse.json(
        { error: 'No text provided' },
        { status: 400 }
      )
    }

    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key not found in environment variables')
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to your .env file' },
        { status: 503 }
      )
    }

    // Parse with LLM
    console.log('Parsing with LLM...')
    console.log('API Key present:', !!process.env.OPENAI_API_KEY)
    const parsed = await LLMPicksheetParser.parseWithLLM(text)
    
    // Convert to database format for consistency
    const dbRows = LLMPicksheetParser.toDatabase(parsed)
    
    // Format for display
    const displayRows = LLMPicksheetParser.formatForDisplay(parsed)

    return NextResponse.json({
      success: true,
      parsed: parsed,
      rows: dbRows,
      displayRows: displayRows,
      summary: {
        total: parsed.totalGames,
        nfl: parsed.nflGames,
        ncaaf: parsed.ncaafGames,
        title: parsed.title,
        week: parsed.week
      }
    })

  } catch (error) {
    console.error('Error in LLM parsing:', error)
    
    // Check if it's an OpenAI API error
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return NextResponse.json(
          { error: 'OpenAI API key not configured or invalid' },
          { status: 503 }
        )
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to parse picksheet with LLM' },
      { status: 500 }
    )
  }
}