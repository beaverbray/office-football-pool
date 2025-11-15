#!/usr/bin/env tsx
/**
 * Load Historical Data Script
 *
 * This script loads historical NFL and NCAAF game data from CSV files
 * into the afbp.historical_games table.
 *
 * Usage: npx tsx scripts/load-historical-data.ts [--league nfl|ncaaf] [--dry-run]
 */

import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'

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
const leagueFilter = args.find(arg => arg.startsWith('--league='))?.split('=')[1] as 'nfl' | 'ncaaf' | undefined

interface TeamMapping {
  id: string
  league: string
  name_canonical: string
  name_short: string
  abbreviation: string
  aliases: string[]
}

let teamMappings: TeamMapping[] = []

/**
 * Load team mappings from the core_teams table
 */
async function loadTeamMappings(): Promise<void> {
  console.log('📋 Loading team mappings from core_teams...')

  const { data, error } = await supabase
    .from('core_teams')
    .select('id, league, name_canonical, name_short, abbreviation, aliases')

  if (error) {
    console.error('❌ Failed to load team mappings:', error)
    throw error
  }

  teamMappings = data as TeamMapping[]
  console.log(`✅ Loaded ${teamMappings.length} team mappings (${teamMappings.filter(t => t.league === 'NFL').length} NFL, ${teamMappings.filter(t => t.league === 'NCAAF').length} NCAAF)`)
}

/**
 * Normalize team name using fuzzy matching against core_teams
 */
function normalizeTeamName(teamName: string, league: string): string | null {
  const leagueMappings = teamMappings.filter(t => t.league === league.toUpperCase())

  // Try exact matches first
  for (const mapping of leagueMappings) {
    if (mapping.name_canonical === teamName ||
        mapping.name_short === teamName ||
        mapping.abbreviation === teamName) {
      return mapping.id
    }

    // Check aliases
    if (mapping.aliases && Array.isArray(mapping.aliases)) {
      if (mapping.aliases.includes(teamName)) {
        return mapping.id
      }
    }
  }

  // Try case-insensitive fuzzy matching
  const normalizedSearch = teamName.toLowerCase().trim()
  for (const mapping of leagueMappings) {
    if (mapping.name_canonical.toLowerCase() === normalizedSearch ||
        mapping.name_short?.toLowerCase() === normalizedSearch ||
        mapping.abbreviation?.toLowerCase() === normalizedSearch) {
      return mapping.id
    }

    // Check aliases case-insensitively
    if (mapping.aliases && Array.isArray(mapping.aliases)) {
      if (mapping.aliases.some(alias => alias.toLowerCase() === normalizedSearch)) {
        return mapping.id
      }
    }
  }

  return null
}

/**
 * Load NFL games from CSV
 */
async function loadNFLGames(): Promise<void> {
  const csvPath = path.join(__dirname, '..', 'gap_analysis', 'nfl_games_historical.csv')
  console.log(`\n📊 Loading NFL games from ${csvPath}...`)

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ File not found: ${csvPath}`)
    return
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8')
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  })

  console.log(`📈 Found ${records.length} NFL games to process`)

  const gamesData = []
  const unmatchedTeams = new Set<string>()

  for (const record of records) {
    const homeTeamId = normalizeTeamName(record.home_team, 'NFL')
    const awayTeamId = normalizeTeamName(record.away_team, 'NFL')

    if (!homeTeamId) {
      unmatchedTeams.add(record.home_team)
    }
    if (!awayTeamId) {
      unmatchedTeams.add(record.away_team)
    }

    // Continue even if teams don't match - team_id fields are nullable

    // Build weather conditions string from available data
    const weatherParts = []
    if (record.temp) weatherParts.push(`${record.temp}°F`)
    if (record.wind) weatherParts.push(`Wind: ${record.wind}mph`)
    if (record.roof) weatherParts.push(record.roof)
    const weatherConditions = weatherParts.length > 0 ? weatherParts.join(', ') : null

    gamesData.push({
      game_id: record.game_id,
      league: 'NFL',
      season: parseInt(record.season),
      week: parseInt(record.week),
      game_date: record.gameday,
      home_team: record.home_team,
      away_team: record.away_team,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      home_score: record.home_score ? parseInt(record.home_score) : null,
      away_score: record.away_score ? parseInt(record.away_score) : null,
      spread: record.spread ? parseFloat(record.spread) : null,
      actual_margin: record.actual_margin ? parseFloat(record.actual_margin) : null,
      favorite_covered: record.home_covered === 'True' ? true : record.home_covered === 'False' ? false : null,
      total: record.total_line ? parseFloat(record.total_line) : null,
      weather_conditions: weatherConditions,
      source: 'nfl_data_py',
      source_confidence: 1.0
    })
  }

  if (unmatchedTeams.size > 0) {
    console.warn(`⚠️  Unmatched NFL teams (${unmatchedTeams.size}):`, Array.from(unmatchedTeams).join(', '))
  }

  console.log(`✅ Prepared ${gamesData.length} NFL games for insertion`)
  console.log(`   ${unmatchedTeams.size} unique teams without core_teams mapping (team_id will be NULL)`)

  if (dryRun) {
    console.log('🔍 DRY RUN - Sample data (first 3 records):')
    console.log(JSON.stringify(gamesData.slice(0, 3), null, 2))
    return
  }

  // Insert in batches of 500
  const batchSize = 500
  for (let i = 0; i < gamesData.length; i += batchSize) {
    const batch = gamesData.slice(i, i + batchSize)
    console.log(`📤 Inserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(gamesData.length / batchSize)} (${batch.length} games)...`)

    const { error } = await supabase
      .from('historical_games')
      .upsert(batch, {
        onConflict: 'league,game_id',
        ignoreDuplicates: true
      })

    if (error) {
      console.error(`❌ Error inserting NFL batch ${Math.floor(i / batchSize) + 1}:`, error)
      throw error
    }
  }

  console.log(`✅ Successfully loaded ${gamesData.length} NFL games`)
}

/**
 * Load NCAAF games from CSV
 */
async function loadNCAAFGames(): Promise<void> {
  const csvPath = path.join(__dirname, '..', 'gap_analysis', 'ncaaf_games_historical.csv')
  console.log(`\n📊 Loading NCAAF games from ${csvPath}...`)

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ File not found: ${csvPath}`)
    return
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8')
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  })

  console.log(`📈 Found ${records.length} NCAAF games to process`)

  const gamesData = []
  const unmatchedTeams = new Set<string>()

  for (const record of records) {
    const homeTeamId = normalizeTeamName(record.homeTeam, 'NCAAF')
    const awayTeamId = normalizeTeamName(record.awayTeam, 'NCAAF')

    if (!homeTeamId) {
      unmatchedTeams.add(record.homeTeam)
    }
    if (!awayTeamId) {
      unmatchedTeams.add(record.awayTeam)
    }

    // Continue even if teams don't match - team_id fields are nullable

    gamesData.push({
      game_id: record.id,
      league: 'NCAAF',
      season: parseInt(record.season),
      week: parseInt(record.week),
      game_date: record.start_date,
      home_team: record.homeTeam,
      away_team: record.awayTeam,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      home_score: record.home_score ? parseInt(record.home_score) : null,
      away_score: record.away_score ? parseInt(record.away_score) : null,
      spread: record.spread ? parseFloat(record.spread) : null,
      actual_margin: record.actual_margin ? parseFloat(record.actual_margin) : null,
      favorite_covered: record.favorite_covered === 'True' ? true : record.favorite_covered === 'False' ? false : null,
      conference_game: record.conferenceGame === 'True' ? true : record.conferenceGame === 'False' ? false : null,
      neutral_site: record.neutralSite === 'True' ? true : record.neutralSite === 'False' ? false : null,
      attendance: record.attendance ? parseInt(record.attendance) : null,
      source: 'cfbd_api',
      source_confidence: 1.0
    })
  }

  if (unmatchedTeams.size > 0) {
    console.warn(`⚠️  Unmatched NCAAF teams (${unmatchedTeams.size}):`, Array.from(unmatchedTeams).join(', '))
    console.warn('    You may need to add aliases to core_teams for these teams.')
  }

  console.log(`✅ Prepared ${gamesData.length} NCAAF games for insertion`)
  console.log(`   ${unmatchedTeams.size} unique teams without core_teams mapping (team_id will be NULL)`)

  if (dryRun) {
    console.log('🔍 DRY RUN - Sample data (first 3 records):')
    console.log(JSON.stringify(gamesData.slice(0, 3), null, 2))
    return
  }

  // Insert in batches of 500
  const batchSize = 500
  for (let i = 0; i < gamesData.length; i += batchSize) {
    const batch = gamesData.slice(i, i + batchSize)
    console.log(`📤 Inserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(gamesData.length / batchSize)} (${batch.length} games)...`)

    const { error } = await supabase
      .from('historical_games')
      .upsert(batch, {
        onConflict: 'league,game_id',
        ignoreDuplicates: true
      })

    if (error) {
      console.error(`❌ Error inserting NCAAF batch ${Math.floor(i / batchSize) + 1}:`, error)
      throw error
    }
  }

  console.log(`✅ Successfully loaded ${gamesData.length} NCAAF games`)
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Historical Data Loader\n')

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No data will be inserted\n')
  }

  try {
    // Load team mappings
    await loadTeamMappings()

    // Load games based on filter
    if (!leagueFilter || leagueFilter === 'nfl') {
      await loadNFLGames()
    }

    if (!leagueFilter || leagueFilter === 'ncaaf') {
      await loadNCAAFGames()
    }

    console.log('\n✅ Data loading complete!')

  } catch (error) {
    console.error('\n❌ Error during data loading:', error)
    process.exit(1)
  }
}

main()
