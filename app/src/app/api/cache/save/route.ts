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
 * typed client resolves its rows to `never`. Following the house pattern
 * (see api/pipeline/current/route.ts): cast the client at the call site and
 * type the payload and the result, rather than hand-rolling a fake of
 * supabase-js's fluent API — that would only drift from the real one.
 */
interface SharedAnalysisInsert {
  share_id: string
  pipeline_data: unknown
  metadata: { source: string; version: string }
}

interface SavedAnalysisRow {
  expires_at: string | null
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    // Generate a unique ID for this analysis
    const shareId = nanoid(10)

    // No service role means the insert cannot succeed. Returning success with
    // a /share/<id> URL would hand back a link that 404s — a confidently wrong
    // answer, which is the failure mode this codebase keeps producing.
    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          error: 'Sharing unavailable',
          message: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.'
        },
        { status: 503 }
      )
    }

    const row: SharedAnalysisInsert = {
      share_id: shareId,
      pipeline_data: data,
      metadata: { source: 'web', version: '1.0' }
    }
    
    // Store in Supabase
    const { data: savedData, error } = await (supabaseAdmin as any)
      .from('shared_analyses')
      .insert(row)
      .select()
      .single() as { data: SavedAnalysisRow | null; error: { code?: string; message: string } | null }
    
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