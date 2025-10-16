import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database'

type CurrentPipelineInsert = Database['public']['Tables']['current_pipeline']['Insert']
type CurrentPipelineRow = Database['public']['Tables']['current_pipeline']['Row']

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

    // First, set all existing pipelines to is_current = false
    const { error: updateError } = await supabase
      .from('current_pipeline')
      // @ts-expect-error - Supabase type inference issue with new table
      .update({ is_current: false })
      .eq('is_current', true)

    if (updateError) {
      console.error('Error updating previous pipelines:', updateError)
      // Continue anyway - not critical
    }

    // Insert new current pipeline
    const { data, error } = await supabase
      .from('current_pipeline')
      // @ts-expect-error - Supabase type inference issue with new table
      .insert({
        pipeline_data: pipeline,
        picksheet_text: picksheetText,
        is_current: true,
        updated_at: new Date().toISOString()
      })
      .select()
      .single() as { data: CurrentPipelineRow | null, error: any }

    if (error || !data) {
      console.error('Error saving pipeline to database:', error)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to save pipeline to database',
          message: error?.message || 'No data returned'
        },
        { status: 500 }
      )
    }

    console.log('Pipeline saved successfully to database:', data.id)

    return NextResponse.json({
      success: true,
      id: data.id,
      message: 'Pipeline data saved successfully'
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
