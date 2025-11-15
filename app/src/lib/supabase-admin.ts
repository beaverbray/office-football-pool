import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

// For server-side operations that need to bypass RLS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Admin client for server-side operations (bypasses RLS)
// Set schema to afbp for analysis predictions
export const supabaseAdmin = supabaseServiceKey
  ? createClient<Database>(supabaseUrl, supabaseServiceKey, {
      db: { schema: 'afbp' as any }
    })
  : null

// Regular client for client-side operations
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)