import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

console.log('🔍 Checking current_pipeline table...\n')

const { data, error } = await supabase
  .from('current_pipeline')
  .select('*')
  .eq('id', 'current')
  .single()

if (error) {
  if (error.code === 'PGRST116') {
    console.log('❌ No pipeline data found in database')
    console.log('\n✅ SOLUTION: Go to /control-panel and process a picksheet first\n')
  } else {
    console.error('❌ Database error:', error)
  }
  process.exit(1)
}

console.log('✅ Pipeline record found!')
console.log('   ID:', data.id)
console.log('   Last updated:', data.updated_at)

// Check structure
const pipelineData = data.pipeline_data

if (!pipelineData) {
  console.log('\n❌ pipeline_data is null/undefined')
  console.log('   SOLUTION: Re-process picksheet in Control Panel')
  process.exit(1)
}

console.log('\n📊 Pipeline structure:')
console.log('   Has parsing?:', !!pipelineData.parsing)
console.log('   Has parsing.games?:', !!pipelineData.parsing?.games)

if (pipelineData.parsing?.games) {
  console.log('   Games count:', pipelineData.parsing.games.length)
  console.log('\n✅ Data looks good! Refresh should work.')

  // Show sample game
  if (pipelineData.parsing.games[0]) {
    console.log('\n📝 Sample game:')
    console.log(JSON.stringify(pipelineData.parsing.games[0], null, 2))
  }
} else {
  console.log('\n❌ PROBLEM: No games in parsing.games array')
  console.log('   Current structure:', Object.keys(pipelineData))
  console.log('\n   SOLUTION: Re-process picksheet in Control Panel')
}
