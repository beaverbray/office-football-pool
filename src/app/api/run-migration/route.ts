import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { step } = body // 'drop' or 'migrate'

    if (!supabaseServiceKey) {
      return NextResponse.json({
        error: 'Service role key not configured',
        message: 'Add SUPABASE_SERVICE_ROLE_KEY to .env.local'
      }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    let sqlFile: string
    if (step === 'drop') {
      sqlFile = join(process.cwd(), 'supabase/migrations/009_drop_afbp_schema.sql')
    } else if (step === 'migrate') {
      sqlFile = join(process.cwd(), 'supabase/migrations/009_afbp_schema_migration.sql')
    } else {
      return NextResponse.json({
        error: 'Invalid step',
        message: 'Step must be "drop" or "migrate"'
      }, { status: 400 })
    }

    const sql = readFileSync(sqlFile, 'utf-8')

    // Execute via Supabase SQL Editor API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ query: sql })
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({
        error: 'Migration failed',
        details: error
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      step,
      message: step === 'drop'
        ? 'AFBP schema dropped successfully'
        : 'Migration completed successfully'
    })

  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json({
      error: 'Migration failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
