import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Create Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

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
    if (!supabaseUrl || !supabaseAnonKey) {
      console.log('Supabase not configured')
      return NextResponse.json(
        { 
          error: 'Database not configured',
          message: 'Please configure Supabase environment variables'
        },
        { status: 503 }
      )
    }
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    
    // Get from Supabase
    const { data: sharedAnalysis, error } = await supabase
      .from('shared_analyses')
      .select('*')
      .eq('share_id', id)
      .single()
    
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
    
    // Check if expired
    if (sharedAnalysis.expires_at && new Date(sharedAnalysis.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Share link has expired' },
        { status: 410 }
      )
    }
    
    // Increment view count (optional)
    await supabase
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