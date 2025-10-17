import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

interface CurrentPipelineRow {
  id: string
  pipeline_data: any
  picksheet_text: string | null
  updated_at: string
  metadata: any
}

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

    // Save to current_pipeline table using upsert (insert or update)
    const { data, error } = await supabase
      .from('current_pipeline')
      .upsert({
        id: 'current',
        pipeline_data: pipeline,
        picksheet_text: picksheetText || null,
        updated_at: new Date().toISOString(),
        metadata: {
          source: 'control-panel',
          version: '1.0'
        }
      } as any)
      .select()
      .single()

    if (error) {
      console.error('Error saving pipeline to database:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))

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

      // RLS policy error
      if (error.code === '42501') {
        return NextResponse.json(
          {
            success: false,
            error: 'Permission denied',
            message: 'RLS policies may be preventing the insert. Check your Supabase policies.'
          },
          { status: 403 }
        )
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Database error',
          message: error.message,
          code: error.code
        },
        { status: 500 }
      )
    }

    console.log('Pipeline saved successfully to database')
    console.log('Saved data:', data ? 'Data returned' : 'No data returned')

    const row = data as CurrentPipelineRow | null

    return NextResponse.json({
      success: true,
      message: 'Pipeline data saved successfully',
      timestamp: row?.updated_at || new Date().toISOString()
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
