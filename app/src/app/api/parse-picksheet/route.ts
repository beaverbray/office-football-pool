import { NextRequest, NextResponse } from 'next/server'
import { PicksheetParser } from '@/services/picksheet-parser'
// import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text, sourceFileName } = body

    if (!text) {
      return NextResponse.json(
        { error: 'No text provided' },
        { status: 400 }
      )
    }

    // Commented out Supabase for now - using localStorage in production
    // // Create a job run
    // const { data: jobRun, error: jobError } = await supabase
    //   .from('job_runs')
    //   .insert({
    //     job_type: 'picksheet_parse',
    //     source_file_name: sourceFileName || null,
    //     status: 'running',
    //     counts: { total_lines: text.split('\n').length },
    //     metadata: { source: 'api' }
    //   })
    //   .select()
    //   .single()

    // if (jobError) {
    //   console.error('Error creating job run:', jobError)
      
    //   // Check if it's a table not found error
    //   if (jobError.code === 'PGRST205') {
    //     return NextResponse.json(
    //       { 
    //         error: 'Database tables not found. Please apply the database migrations first.',
    //         details: 'Run the SQL migrations in your Supabase dashboard. See supabase/apply-migrations.md for instructions.'
    //       },
    //       { status: 503 }
    //     )
    //   }
      
    //   return NextResponse.json(
    //     { error: 'Failed to create job run' },
    //     { status: 500 }
    //   )
    // }
    
    // Create a mock job run for compatibility
    const jobRun = {
      id: `job_${Date.now()}`,
      job_type: 'picksheet_parse',
      source_file_name: sourceFileName || null,
      status: 'running',
      counts: { total_lines: text.split('\n').length },
      metadata: { source: 'api' }
    }

    try {
      // Parse the picksheet text
      const parsedRows = PicksheetParser.parseText(text)
      
      // Convert to database format (keeping for compatibility)
      const dbRows = PicksheetParser.toDatabase(parsedRows, jobRun.id)
      
      // Commented out Supabase storage - returning parsed data directly
      // const { data: insertedRows, error: insertError } = await supabase
      //   .from('picks_rows')
      //   .insert(dbRows)
      //   .select()

      // if (insertError) {
      //   throw insertError
      // }

      // // Update job run as completed
      // await supabase
      //   .from('job_runs')
      //   .update({
      //     status: 'completed',
      //     ended_at: new Date().toISOString(),
      //     counts: { 
      //       total_lines: text.split('\n').length,
      //       parsed_rows: insertedRows?.length || 0
      //     }
      //   })
      //   .eq('id', jobRun.id)

      return NextResponse.json({
        success: true,
        jobRunId: jobRun.id,
        parsedCount: dbRows.length,
        rows: dbRows
      })

    } catch (parseError) {
      // Commented out Supabase update
      // await supabase
      //   .from('job_runs')
      //   .update({
      //     status: 'failed',
      //     ended_at: new Date().toISOString(),
      //     errors: [{ 
      //       error: parseError instanceof Error ? parseError.message : 'Unknown error',
      //       timestamp: new Date().toISOString()
      //     }]
      //   })
      //   .eq('id', jobRun.id)

      throw parseError
    }

  } catch (error) {
    console.error('Error parsing picksheet:', error)
    return NextResponse.json(
      { error: 'Failed to parse picksheet' },
      { status: 500 }
    )
  }
}