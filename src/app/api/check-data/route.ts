import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // Check actual data in afbp tables
    const [scheduleCheck, pipelineCheck, predictionsCheck, sharedCheck] = await Promise.all([
      supabase.from('core_schedule').select('*').limit(1),
      supabase.from('pipeline_current').select('*').limit(1),
      supabase.from('analysis_predictions').select('*').limit(1),
      supabase.from('shared_analyses').select('*').limit(1),
    ])

    // Check old public tables
    const [oldSchedule, oldPipeline, oldPredictions, oldShared] = await Promise.all([
      supabase.from('schedule').select('*').limit(1),
      supabase.from('current_pipeline').select('*').limit(1),
      supabase.from('predictions').select('*').limit(1),
      supabase.from('shared_analyses').select('*').limit(1),
    ])

    return NextResponse.json({
      afbpSchema: {
        core_schedule: {
          error: scheduleCheck.error?.message,
          hasData: scheduleCheck.data && scheduleCheck.data.length > 0,
          sampleRow: scheduleCheck.data?.[0]
        },
        pipeline_current: {
          error: pipelineCheck.error?.message,
          hasData: pipelineCheck.data && pipelineCheck.data.length > 0,
          sampleRow: pipelineCheck.data?.[0]?.id
        },
        analysis_predictions: {
          error: predictionsCheck.error?.message,
          hasData: predictionsCheck.data && predictionsCheck.data.length > 0,
          sampleRow: predictionsCheck.data?.[0]?.source
        },
        shared_analyses: {
          error: sharedCheck.error?.message,
          hasData: sharedCheck.data && sharedCheck.data.length > 0,
          sampleRow: sharedCheck.data?.[0]?.share_id
        }
      },
      publicSchema: {
        schedule: {
          error: oldSchedule.error?.message,
          hasData: oldSchedule.data && oldSchedule.data.length > 0,
          exists: !oldSchedule.error
        },
        current_pipeline: {
          error: oldPipeline.error?.message,
          hasData: oldPipeline.data && oldPipeline.data.length > 0,
          exists: !oldPipeline.error
        },
        predictions: {
          error: oldPredictions.error?.message,
          hasData: oldPredictions.data && oldPredictions.data.length > 0,
          exists: !oldPredictions.error
        },
        shared_analyses: {
          error: oldShared.error?.message,
          hasData: oldShared.data && oldShared.data.length > 0,
          exists: !oldShared.error
        }
      }
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to check data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
