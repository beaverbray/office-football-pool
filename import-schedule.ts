import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { parse } from 'csv-parse/sync'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function importSchedule() {
  console.log('Reading football_schedule_2025.csv...')

  const csv = readFileSync('football_schedule_2025.csv', 'utf-8')
  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true
  })

  console.log(`Found ${records.length} games to import`)

  // Convert CSV records to database format
  const scheduleData = records.map((row: any) => ({
    league: row.league,
    match_number: parseInt(row.match_number),
    week: parseInt(row.week),
    date: row.date,
    location: row.location,
    home_team: row.home_team,
    away_team: row.away_team
  }))

  // Insert in batches of 100
  const batchSize = 100
  for (let i = 0; i < scheduleData.length; i += batchSize) {
    const batch = scheduleData.slice(i, i + batchSize)
    console.log(`Importing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(scheduleData.length / batchSize)}...`)

    const { error } = await supabase
      .from('afbp.core_schedule')
      .insert(batch)

    if (error) {
      console.error('Error inserting batch:', error)
      throw error
    }
  }

  console.log('✅ Schedule import complete!')

  // Verify
  const { count } = await supabase
    .from('afbp.core_schedule')
    .select('*', { count: 'exact', head: true })

  console.log(`Total rows in afbp.core_schedule: ${count}`)
}

importSchedule().catch(console.error)
