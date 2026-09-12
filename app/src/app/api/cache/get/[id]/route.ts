import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Same two faults as the save route: `shared_analyses` is service_role-only
// after the RLS hardening, and it lives in the `afbp` schema while a bare
// createClient() defaults to `public`. Reading a share link is server-side, so
// the service key stays off the client.

/**
 * `afbp.shared_analyses` is absent from the generated Database type, so the
 * typed client resolves its rows to `never`. House pattern (see
 * api/pipeline/current/route.ts): cast the client at the call site and type
 * the result, rather than hand-rolling a fake of supabase-js's fluent API.
 */
interface SharedAnalysisRow {
  pipeline_data: unknown
  created_at: string
  expires_at: string | null
  view_count: number | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    
    if (!id) {
      return NextResponse.json(
        { error: 'Share ID is required' },
        { status: 400 }
      )
    }
    
    // Check if Supabase is configured
    if (!supabaseAdmin) {
      console.log('Supabase not configured')
      return NextResponse.json(
        { 
          error: 'Database not configured',
          message: 'Please configure Supabase environment variables'
        },
        { status: 503 }
      )
    }
    
    // Get from Supabase
    const { data: sharedAnalysis, error } = await (supabaseAdmin as any)
      .from('shared_analyses')
      .select('*')
      .eq('share_id', id)
      .single() as { data: SharedAnalysisRow | null; error: { code?: string; message: string } | null }
    
    if (error) {
      console.error('Error fetching from Supabase:', error)
      
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Analysis not found or expired' },
          { status: 404 }
        )
      }
      
      if (error.code === '42P01') {
        return NextResponse.json(
          { 
            error: 'Database table not found',
            message: 'Please run the migration in supabase/migrations/002_create_shared_analyses.sql'
          },
          { status: 503 }
        )
      }
      
      throw error
    }

    // No row and no error: the narrow type surfaced this, and 404 is the honest
    // answer for an unknown share id.
    if (!sharedAnalysis) {
      return NextResponse.json(
        { error: 'Analysis not found or expired' },
        { status: 404 }
      )
    }
    
    // Check if expired
    if (sharedAnalysis.expires_at && new Date(sharedAnalysis.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Share link has expired' },
        { status: 410 }
      )
    }
    
    // Increment view count (optional)
    await (supabaseAdmin as any)
      .from('shared_analyses')
      .update({ view_count: (sharedAnalysis.view_count || 0) + 1 })
      .eq('share_id', id)
    
    return NextResponse.json({
      success: true,
      data: sharedAnalysis.pipeline_data,
      createdAt: sharedAnalysis.created_at,
      expiresAt: sharedAnalysis.expires_at,
      viewCount: sharedAnalysis.view_count
    })
  } catch (error) {
    console.error('Error retrieving from cache:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve analysis' },
      { status: 500 }
    )
  }
}