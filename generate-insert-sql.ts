import { readFileSync, writeFileSync } from 'fs'
import { parse } from 'csv-parse/sync'

const csv = readFileSync('football_schedule_2025.csv', 'utf-8')
const records = parse(csv, {
  columns: true,
  skip_empty_lines: true
})

console.log(`Generating SQL for ${records.length} games...`)

let sql = '-- Import schedule data\n\nBEGIN;\n\n'

// Convert CSV records to INSERT statements in batches
const batchSize = 100
for (let i = 0; i < records.length; i += batchSize) {
  const batch = records.slice(i, i + batchSize)

  sql += `-- Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(records.length / batchSize)}\n`
  sql += `INSERT INTO afbp.core_schedule (league, match_number, week, date, location, home_team, away_team) VALUES\n`

  const values = batch.map((row: any) => {
    const league = (row.league || '').replace(/'/g, "''")
    const location = (row.location || '').replace(/'/g, "''")
    const home_team = (row.home_team || '').replace(/'/g, "''")
    const away_team = (row.away_team || '').replace(/'/g, "''")
    const date = (row.date || '').replace(/'/g, "''")

    return `  ('${league}', ${row.match_number || 0}, ${row.week || 0}, '${date}', '${location}', '${home_team}', '${away_team}')`
  })

  sql += values.join(',\n')
  sql += ';\n\n'
}

sql += 'COMMIT;\n\n'
sql += '-- Verify import\n'
sql += 'SELECT COUNT(*) as total_games FROM afbp.core_schedule;\n'
sql += 'SELECT league, COUNT(*) as count FROM afbp.core_schedule GROUP BY league;\n'

writeFileSync('import-schedule.sql', sql)
console.log('✅ Generated import-schedule.sql')
console.log('Now run this file in Supabase SQL Editor')
