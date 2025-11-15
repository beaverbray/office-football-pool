import { NextRequest, NextResponse } from 'next/server'
import { PicksheetParser } from '@/services/picksheet-parser'

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

    // Parse the picksheet text without database
    const parsedRows = PicksheetParser.parseText(text)
    
    // Add mock IDs for display
    const rowsWithIds = parsedRows.map((row, index) => ({
      ...row,
      id: `test-${index + 1}`
    }))

    return NextResponse.json({
      success: true,
      parsedCount: rowsWithIds.length,
      rows: rowsWithIds,
      message: 'Test parse successful (database not used)'
    })

  } catch (error) {
    console.error('Error parsing picksheet:', error)
    return NextResponse.json(
      { error: 'Failed to parse picksheet' },
      { status: 500 }
    )
  }
}