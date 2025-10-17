import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

interface CurrentPipelineRow {
  id: string
  pipeline_data: any
  picksheet_text: string | null
  updated_at: string
  metadata: any
}

export async function POST() {
  try {
    // Load current pipeline from database
    const { data, error } = await supabase
      .from('current_pipeline')
      .select('*')
      .eq('id', 'current')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({
          success: false,
          error: 'No pipeline data found',
          message: 'Please process a picksheet first in the Control Panel'
        }, { status: 404 })
      }

      throw error
    }

    const row = data as CurrentPipelineRow

    // Return the current pipeline (refresh functionality can be added later)
    return NextResponse.json({
      success: true,
      pipeline: row.pipeline_data,
      message: 'Returning current pipeline data. To update with latest market odds, re-process in Control Panel.'
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

// Keep GET for compatibility
export async function GET() {
  return POST()
}
