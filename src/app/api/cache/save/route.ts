import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { nanoid } from 'nanoid'

// Create Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    // Generate a unique ID for this analysis
    const shareId = nanoid(10)
    
    // Check if Supabase is configured
    if (!supabaseUrl || !supabaseAnonKey) {
      console.log('Supabase not configured, returning share ID for local use')
      return NextResponse.json({
        success: true,
        shareId,
        shareUrl: `/share/${shareId}`,
        warning: 'Database not configured - share link will not persist'
      })
    }
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    
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
      expiresAt: savedData.expires_at
    })
  } catch (error) {
    console.error('Error saving to cache:', error)
    return NextResponse.json(
      { error: 'Failed to save analysis' },
      { status: 500 }
    )
  }
}