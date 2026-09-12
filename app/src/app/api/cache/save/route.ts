import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { nanoid } from 'nanoid'

// Writes go through the service role. Two reasons this route could not use an
// ad-hoc anon client, and it was failing on both:
//
//   1. `shared_analyses` is service_role-only since the RLS hardening, so the
//      anon key got `42501 permission denied` and every Share click returned
//      "Failed to save analysis".
//   2. The table lives in the `afbp` schema. A bare createClient() defaults to
//      `public`, where it does not exist — so even with permission this wrote
//      nowhere. supabaseAdmin sets `db: { schema: 'afbp' }`.
//
// This is a server route handler, so the service key stays server-side.

/**
 * `afbp.shared_analyses` is absent from the generated Database type, so the
 * typed client resolves it to `never`. Narrowed to the one insert this route
 * performs rather than cast to `any`.
 */
type SharedAnalysesInsert = {
  from(table: 'shared_analyses'): {
    insert(row: {
      share_id: string
      pipeline_data: unknown
      metadata: { source: string; version: string }
    }): {
      select(): {
        single(): Promise<{
          data: { expires_at: string | null } | null
          error: { code?: string; message: string } | null
        }>
      }
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    // Generate a unique ID for this analysis
    const shareId = nanoid(10)

    if (!supabaseAdmin) {
      console.log('Service role not configured, returning share ID for local use')
      return NextResponse.json({
        success: true,
        shareId,
        shareUrl: `/share/${shareId}`,
        warning: 'Database not configured - share link will not persist'
      })
    }

    const supabase = supabaseAdmin as unknown as SharedAnalysesInsert
    
    // Store in Supabase
    const { data: savedData, error } = await supabase
      .from('shared_analyses')
      .insert({
        share_id: shareId,
        pipeline_data: data,
        metadata: {
          source: 'web',
          version: '1.0'
        }
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error saving to Supabase:', error)
      
      // If table doesn't exist, provide helpful message
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
    
    return NextResponse.json({
      success: true,
      shareId,
      shareUrl: `/share/${shareId}`,
      expiresAt: savedData?.expires_at ?? null
    })
  } catch (error) {
    console.error('Error saving to cache:', error)
    return NextResponse.json(
      { error: 'Failed to save analysis' },
      { status: 500 }
    )
  }
}