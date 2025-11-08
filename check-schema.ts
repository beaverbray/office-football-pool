import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSchema() {
  // Check if afbp schema exists and list tables
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT schemaname, tablename
      FROM pg_tables
      WHERE schemaname = 'afbp'
      ORDER BY tablename;
    `
  })

  if (error) {
    console.log('Error querying schema:', error.message)
    console.log('This likely means the afbp schema does not exist yet.')
  } else {
    console.log('Tables in afbp schema:')
    console.log(data)
  }

  // Also check public schema for our tables
  const { data: publicData, error: publicError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename IN ('schedule', 'current_pipeline', 'predictions', 'shared_analyses', 'job_runs', 'picks_rows')
      ORDER BY tablename;
    `
  })

  if (!publicError) {
    console.log('\nTables still in public schema:')
    console.log(publicData)
  }
}

checkSchema()
