import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // For now, return empty/null pipeline since we don't have a current_pipeline table yet
    // This is a stub that prevents 404 errors

    // In the future, this would query a current_pipeline table:
    // const { data, error } = await supabase
    //   .from('current_pipeline')
    //   .select('*')
    //   .single()

    return NextResponse.json({
      success: true,
      pipeline: null,
      message: 'No current pipeline data available'
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
