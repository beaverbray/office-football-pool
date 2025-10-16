import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database'

type CurrentPipelineRow = Database['public']['Tables']['current_pipeline']['Row']

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Query the current pipeline from database
    const { data, error } = await supabase
      .from('current_pipeline')
      .select('*')
      .eq('is_current', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle() as { data: CurrentPipelineRow | null, error: any }

    if (error) {
      console.error('Error fetching current pipeline:', error)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch current pipeline',
          message: error.message
        },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json({
        success: true,
        pipeline: null,
        picksheetText: null,
        message: 'No current pipeline data available'
      })
    }

    return NextResponse.json({
      success: true,
      pipeline: data.pipeline_data,
      picksheetText: data.picksheet_text,
      id: data.id,
      updatedAt: data.updated_at
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
