import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // For now, this is a stub that returns the same as /current
    // In the future, this would refresh the pipeline data:
    // - Re-fetch predictions
    // - Re-run odds API
    // - Re-calculate comparisons
    // - Update current_pipeline table

    return NextResponse.json({
      success: true,
      pipeline: null,
      message: 'Refresh functionality not yet implemented (use Control Panel to process new picksheet)'
    })
  } catch (error) {
    console.error('Error refreshing pipeline:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to refresh pipeline',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
