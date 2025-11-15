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

export async function GET() {
  try {
    // Query the current_pipeline table for the latest pipeline
    const { data, error } = await (supabase as any)
      .from('pipeline_current')
      .select('*')
      .eq('id', 'current')
      .single()

    if (error) {
      // If no data found, return null (not an error)
      if (error.code === 'PGRST116') {
        return NextResponse.json({
          success: true,
          pipeline: null,
          message: 'No current pipeline data available'
        })
      }

      // If table doesn't exist, provide helpful message
      if (error.code === '42P01') {
        return NextResponse.json(
          {
            success: false,
            error: 'Database table not found',
            message: 'Please run the migration in supabase/migrations/006_create_current_pipeline.sql'
          },
          { status: 503 }
        )
      }

      throw error
    }

    const row = data as CurrentPipelineRow

    return NextResponse.json({
      success: true,
      pipeline: row.pipeline_data,
      updatedAt: row.updated_at,
      message: 'Current pipeline loaded successfully'
    })
  } catch (error) {
    console.error('Error fetching current pipeline:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch current pipeline',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
