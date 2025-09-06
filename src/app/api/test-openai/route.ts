import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function GET(request: NextRequest) {
  try {
    // Check if API key exists
    const apiKey = process.env.OPENAI_API_KEY
    
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'OPENAI_API_KEY not found in environment variables'
      }, { status: 503 })
    }

    // Check API key format
    const keyInfo = {
      exists: true,
      length: apiKey.length,
      startsWithSk: apiKey.startsWith('sk-'),
      firstChars: apiKey.substring(0, 10) + '...',
    }

    // Try to initialize OpenAI client
    const openai = new OpenAI({
      apiKey: apiKey,
    })

    // Try a simple API call to test the key
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'Say "API key works!" in 3 words only.' }
        ],
        max_tokens: 10,
      })

      return NextResponse.json({
        success: true,
        keyInfo,
        testResponse: completion.choices[0].message.content,
        message: 'OpenAI API key is valid and working!'
      })
    } catch (apiError: any) {
      return NextResponse.json({
        success: false,
        keyInfo,
        error: apiError.message || 'Failed to call OpenAI API',
        statusCode: apiError.status,
        details: apiError.error?.message || apiError.message
      }, { status: 400 })
    }

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Unexpected error testing OpenAI API'
    }, { status: 500 })
  }
}