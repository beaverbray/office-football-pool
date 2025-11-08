import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // Check if afbp schema tables exist
    const afbpChecks = await Promise.all([
      supabase.from('core_schedule').select('count', { count: 'exact', head: true }),
      supabase.from('pipeline_current').select('count', { count: 'exact', head: true }),
      supabase.from('analysis_predictions').select('count', { count: 'exact', head: true }),
      supabase.from('shared_analyses').select('count', { count: 'exact', head: true }),
    ])

    // Check if old public schema tables still exist
    const publicChecks = await Promise.all([
      supabase.from('schedule').select('count', { count: 'exact', head: true }),
      supabase.from('current_pipeline').select('count', { count: 'exact', head: true }),
      supabase.from('predictions').select('count', { count: 'exact', head: true }),
      supabase.from('shared_analyses').select('count', { count: 'exact', head: true }),
    ])

    return NextResponse.json({
      afbpSchema: {
        core_schedule: afbpChecks[0].error ? 'NOT FOUND' : `EXISTS (${afbpChecks[0].count} rows)`,
        pipeline_current: afbpChecks[1].error ? 'NOT FOUND' : `EXISTS (${afbpChecks[1].count} rows)`,
        analysis_predictions: afbpChecks[2].error ? 'NOT FOUND' : `EXISTS (${afbpChecks[2].count} rows)`,
        shared_analyses: afbpChecks[3].error ? 'NOT FOUND' : `EXISTS (${afbpChecks[3].count} rows)`,
      },
      publicSchema: {
        schedule: publicChecks[0].error ? 'NOT FOUND' : `EXISTS (${publicChecks[0].count} rows)`,
        current_pipeline: publicChecks[1].error ? 'NOT FOUND' : `EXISTS (${publicChecks[1].count} rows)`,
        predictions: publicChecks[2].error ? 'NOT FOUND' : `EXISTS (${publicChecks[2].count} rows)`,
        shared_analyses: publicChecks[3].error ? 'NOT FOUND' : `EXISTS (${publicChecks[3].count} rows)`,
      },
      migrationStatus: afbpChecks[0].error
        ? 'NOT RUN - afbp schema does not exist yet'
        : 'COMPLETED - afbp schema exists',
      errors: {
        afbp: afbpChecks.map(c => c.error?.message).filter(Boolean),
        public: publicChecks.map(c => c.error?.message).filter(Boolean),
      }
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to check schema',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
