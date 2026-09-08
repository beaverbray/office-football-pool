import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

interface CurrentPipelineRow {
  id: string
  pipeline_data: unknown
  picksheet_text: string | null
  updated_at: string
  metadata: unknown
}

// afbp.pipeline_current isn't in the generated Database type yet (tracked separately).
// Narrow, local cast instead of `any`: we control the row shape via CurrentPipelineRow.
interface PipelineCurrentClient {
  from(table: 'pipeline_current'): {
    upsert(row: CurrentPipelineRow): {
      select(): {
        single(): Promise<{ data: CurrentPipelineRow | null; error: { message: string; code?: string } | null }>
      }
    }
  }
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

    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'Service role key not configured' },
        { status: 500 }
      )
    }

    // Save to pipeline_current table using upsert (insert or update)
    // Writes require the service-role client: anon writes are blocked by RLS
    // (see supabase/migrations/20260813120000_restrict_pipeline_current_anon_writes.sql)
    const { data, error } = await (supabaseAdmin as unknown as PipelineCurrentClient)
      .from('pipeline_current')
      .upsert({
        id: 'current',
        pipeline_data: pipeline,
        picksheet_text: picksheetText || null,
        updated_at: new Date().toISOString(),
        metadata: {
          source: 'control-panel',
          version: '1.0'
        }
      })
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
