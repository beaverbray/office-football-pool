#!/usr/bin/env tsx
/**
 * Load 2025 Picksheets Script
 *
 * This script parses picksheet files and matches them to the 2025 schedule,
 * then loads pool picks into the database.
 *
 * Usage: npx tsx scripts/load-picksheets.ts [--dry-run] [--week N]
 */

import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'
import { PicksheetParser } from '../src/services/picksheet-parser'
import { GameMatchingService } from '../src/services/game-matching-service'

// Load environment variables
import dotenv from 'dotenv'
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables')
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are set in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'afbp' }
})

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const weekFilter = args.find(arg => arg.startsWith('--week='))?.split('=')[1]

interface ScheduleGame {
  league: string
  match_number: number
  week: number
  date: string
  location: string
  home_team: string
  away_team: string
}

let scheduleGames: ScheduleGame[] = []

/**
 * Load 2025 schedule from CSV
 */
function loadSchedule(): void {
  console.log('📅 Loading 2025 schedule from CSV...')

  const schedulePath = path.join(__dirname, '..', 'football_schedule_2025.csv')
  let csvContent = fs.readFileSync(schedulePath, 'utf-8')

  // Remove BOM if present
  if (csvContent.charCodeAt(0) === 0xFEFF) {
    csvContent = csvContent.slice(1)
  }

  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  })

  scheduleGames = records.map((record: any) => ({
    league: record.league,
    match_number: parseInt(record.match_number),
    week: parseInt(record.week),
    date: record.date,
    location: record.location,
    home_team: record.home_team,
    away_team: record.away_team
  }))

  const nflGames = scheduleGames.filter(g => g.league === 'NFL').length
  const ncaafGames = scheduleGames.filter(g => g.league === 'NCAA').length

  console.log(`✅ Loaded ${scheduleGames.length} total schedule games`)
  console.log(`   - NFL: ${nflGames} games`)
  console.log(`   - NCAAF: ${ncaafGames} games`)
}

/**
 * Parse and match a single picksheet file to schedule
 */
async function loadPicksheet(filePath: string, week: number): Promise<void> {
  const fileName = path.basename(filePath)
  console.log(`\n📄 Processing ${fileName} (Week ${week})...`)

  // Read file content
  const content = fs.readFileSync(filePath, 'utf-8')

  // Parse with PicksheetParser
  const parsedRows = PicksheetParser.parseText(content)
  console.log(`📊 Parsed ${parsedRows.length} games from picksheet`)

  // Filter schedule for this week
  const weekSchedule = scheduleGames.filter(g => g.week === week)
  console.log(`🗓️  Matching against ${weekSchedule.length} scheduled games for week ${week}`)

  // Convert parsed rows to SourceGame format for matching
  const sourceGames = parsedRows.map(row => ({
    homeTeam: row.homeTeamRaw,
    awayTeam: row.awayTeamRaw,
    spread: row.homeSpread,
    total: row.total,
    rawText: row.rawText,
    eventDate: row.eventDate,
    league: row.league || 'NFL'
  }))

  // Match picksheet games to schedule using GameMatchingService
  const matches = GameMatchingService.matchPicksheetToSchedule(sourceGames, weekSchedule as any)

  console.log(`✅ Matched ${matches.size} games out of ${sourceGames.length} picksheet entries`)

  // Prepare data for insertion
  const picksData = []
  const unmatchedGames: string[] = []
  const matchedSourceGames = new Set<string>()

  // Iterate through matched games
  for (const [matchNumber, matchResult] of matches.entries()) {
    const scheduleGame = weekSchedule.find(g => g.match_number === matchNumber)

    if (scheduleGame) {
      const sourceGame = matchResult.game

      picksData.push({
        season: 2025,
        week: week,
        league: scheduleGame.league === 'NCAA' ? 'NCAAF' : scheduleGame.league,
        game_date: scheduleGame.date,
        home_team: scheduleGame.home_team,
        away_team: scheduleGame.away_team,
        pool_spread: sourceGame.spread !== undefined ? sourceGame.spread : null,
        pool_total: sourceGame.total || null,
        source_file: fileName,
        raw_text: sourceGame.rawText
      })

      // Track which source games were matched
      matchedSourceGames.add(`${sourceGame.awayTeam} @ ${sourceGame.homeTeam}`)
    }
  }

  // Find unmatched source games
  for (const sourceGame of sourceGames) {
    const key = `${sourceGame.awayTeam} @ ${sourceGame.homeTeam}`
    if (!matchedSourceGames.has(key)) {
      unmatchedGames.push(key)
    }
  }

  if (unmatchedGames.length > 0) {
    console.warn(`⚠️  Unmatched games (${unmatchedGames.length}):`)
    console.warn(unmatchedGames.slice(0, 10).join(', '))
    if (unmatchedGames.length > 10) {
      console.warn(`   ... and ${unmatchedGames.length - 10} more`)
    }
  }

  console.log(`📝 Prepared ${picksData.length} picks for insertion`)

  if (dryRun) {
    console.log('🔍 DRY RUN - Sample data (first 3 records):')
    console.log(JSON.stringify(picksData.slice(0, 3), null, 2))
    return
  }

  // Insert picks
  if (picksData.length > 0) {
    const { error } = await supabase
      .from('pool_picks')
      .insert(picksData)

    if (error) {
      console.error(`❌ Error inserting picks:`, error)
      throw error
    }

    console.log(`✅ Successfully loaded ${picksData.length} picks from ${fileName}`)
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Picksheet Loader (2025 Season)\n')

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No data will be inserted\n')
  }

  try {
    // Load 2025 schedule
    loadSchedule()

    // Get all picksheet files
    const picksheetsDir = path.join(__dirname, '..', 'picksheets', '2025')
    const files = fs.readdirSync(picksheetsDir)
      .filter(f => f.match(/^week-(\d+)\.txt$/))
      .sort()

    console.log(`📁 Found ${files.length} picksheet files`)

    // Process each file
    for (const file of files) {
      const weekMatch = file.match(/week-(\d+)\.txt/)
      if (!weekMatch) continue

      const week = parseInt(weekMatch[1])

      // Skip if week filter is specified and doesn't match
      if (weekFilter && week !== parseInt(weekFilter)) {
        continue
      }

      const filePath = path.join(picksheetsDir, file)
      await loadPicksheet(filePath, week)
    }

    console.log('\n✅ Picksheet loading complete!')

  } catch (error) {
    console.error('\n❌ Error during picksheet loading:', error)
    process.exit(1)
  }
}

main()
