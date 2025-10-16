import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { pipeline, picksheetText } = body

    if (!pipeline) {
      return NextResponse.json(
        { error: 'Pipeline data is required' },
        { status: 400 }
      )
    }

    // For now, this is a stub that just returns success
    // In the future, this would save to a current_pipeline table:
    // const { data, error } = await supabase
    //   .from('current_pipeline')
    //   .upsert({
    //     pipeline_data: pipeline,
    //     picksheet_text: picksheetText,
    //     updated_at: new Date().toISOString()
    //   })

    console.log('Pipeline save requested (stub - not persisted to DB)')

    return NextResponse.json({
      success: true,
      message: 'Pipeline data received (not persisted - stub implementation)'
    })
  } catch (error) {
    console.error('Error saving pipeline:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save pipeline',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
