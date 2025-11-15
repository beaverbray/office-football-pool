import { NextRequest, NextResponse } from 'next/server'
import { LLMPicksheetParser } from '@/services/llm-picksheet-parser'

export async function POST(request: NextRequest) {
  try {
    const simplePicksheet = "1 pt Green Bay -3.5 Sun 1:00 PM CHICAGO +3.5"

    console.log('Starting simple parse test...')
    const startTime = Date.now()

    const parsed = await LLMPicksheetParser.parseWithLLM(simplePicksheet)

    const duration = Date.now() - startTime
    console.log(`Parse completed in ${duration}ms`)

    return NextResponse.json({
      success: true,
      duration,
      result: parsed
    })
  } catch (error) {
    console.error('Parse test error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}