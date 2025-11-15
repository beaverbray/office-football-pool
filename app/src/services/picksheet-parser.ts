import { Database } from '@/types/database'

type League = 'NFL' | 'NCAAF'
type ParsedRow = Database['public']['Tables']['picks_rows']['Insert']

export interface PicksheetRow {
  league?: League
  eventDate?: Date
  eventTime?: string
  homeTeamRaw: string
  awayTeamRaw: string
  homeSpread?: number
  awaySpread?: number
  total?: number
  rawText: string
}

export class PicksheetParser {
  // Common team name variations and abbreviations
  private static readonly ABBREVIATIONS: Record<string, string> = {
    'St.': 'State',
    'St': 'State',
    'U.': 'University',
    'U': 'University',
    'So.': 'Southern',
    'So': 'Southern',
    'No.': 'Northern',
    'No': 'Northern',
    'E.': 'Eastern',
    'E': 'Eastern',
    'W.': 'Western',
    'W': 'Western',
    'C.': 'Central',
    'C': 'Central',
    'Miss.': 'Mississippi',
    'Miss': 'Mississippi',
    'Mich.': 'Michigan',
    'Mich': 'Michigan',
    'Okla.': 'Oklahoma',
    'Okla': 'Oklahoma',
    'Tenn.': 'Tennessee',
    'Tenn': 'Tennessee',
    'Ala.': 'Alabama',
    'Ala': 'Alabama',
    'Ark.': 'Arkansas',
    'Ark': 'Arkansas',
    'La.': 'Louisiana',
    'La': 'Louisiana',
    'Va.': 'Virginia',
    'Va': 'Virginia',
    'Ga.': 'Georgia',
    'Ga': 'Georgia',
    'Fla.': 'Florida',
    'Fla': 'Florida',
    'N.C.': 'North Carolina',
    'NC': 'North Carolina',
    'S.C.': 'South Carolina',
    'SC': 'South Carolina',
  }

  // Common NCAAF team name patterns
  private static readonly NCAAF_PATTERNS = [
    /^#?\d+\s+/,  // Rankings like "#11 " or "11 "
    /\s+\(\d+-\d+\)$/,  // Records like " (10-2)"
    /\s+\[\d+-\d+\]$/,  // Records like " [10-2]"
  ]

  // Date patterns
  private static readonly DATE_PATTERNS = [
    /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/,  // MM/DD/YYYY or M/D/YY
    /(\d{1,2})-(\d{1,2})-(\d{2,4})/,    // MM-DD-YYYY or M-D-YY
    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(\d{1,2})\/(\d{1,2})/i,
    /(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+(\d{1,2})\/(\d{1,2})/i,
  ]

  // Time patterns
  private static readonly TIME_PATTERNS = [
    /(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)/,  // 12:30 PM
    /(\d{1,2}):(\d{2})/,  // 24-hour format
    /(\d{1,2})\s*(AM|PM|am|pm)/,  // 1 PM
  ]

  // Spread/line patterns
  private static readonly SPREAD_PATTERNS = [
    /([+-]?\d+\.?\d*)/,  // +3.5, -7, 14.5
    /(pk|PK|pick|PICK|even|EVEN)/i,  // Pick'em
  ]

  /**
   * Parse raw picksheet text into structured rows
   */
  static parseText(text: string): PicksheetRow[] {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0)
    const parsedRows: PicksheetRow[] = []
    
    let currentDate: Date | undefined
    let currentLeague: League | undefined

    for (const line of lines) {
      // Check for league indicators
      const leagueMatch = this.detectLeague(line)
      if (leagueMatch) {
        currentLeague = leagueMatch
        continue
      }

      // Check for date
      const dateMatch = this.extractDate(line)
      if (dateMatch) {
        currentDate = dateMatch
        continue
      }

      // Try to parse as game line
      const gameData = this.parseGameLine(line, currentDate, currentLeague)
      if (gameData) {
        parsedRows.push(gameData)
      }
    }

    return parsedRows
  }

  /**
   * Detect league from text
   */
  private static detectLeague(text: string): League | undefined {
    const upperText = text.toUpperCase()
    
    if (upperText.includes('NFL') || upperText.includes('NATIONAL FOOTBALL')) {
      return 'NFL'
    }
    
    if (upperText.includes('NCAAF') || upperText.includes('NCAA') || 
        upperText.includes('COLLEGE') || upperText.includes('CFB')) {
      return 'NCAAF'
    }
    
    return undefined
  }

  /**
   * Extract date from text
   */
  private static extractDate(text: string): Date | undefined {
    for (const pattern of this.DATE_PATTERNS) {
      const match = text.match(pattern)
      if (match) {
        let month: number, day: number, year: number
        
        if (match[1] && match[1].match(/[A-Za-z]/)) {
          // Day name format
          month = parseInt(match[2])
          day = parseInt(match[3])
          year = new Date().getFullYear()
        } else {
          // Numeric format
          month = parseInt(match[1])
          day = parseInt(match[2])
          year = match[3] ? parseInt(match[3]) : new Date().getFullYear()
          
          // Handle 2-digit years
          if (year < 100) {
            year += 2000
          }
        }
        
        return new Date(year, month - 1, day)
      }
    }
    
    return undefined
  }

  /**
   * Extract time from text
   */
  private static extractTime(text: string): string | undefined {
    for (const pattern of this.TIME_PATTERNS) {
      const match = text.match(pattern)
      if (match) {
        const hour = parseInt(match[1])
        const minute = match[2] ? parseInt(match[2]) : 0
        const meridiem = match[3]
        
        if (meridiem) {
          // 12-hour format
          let hour24 = hour
          if (meridiem.toUpperCase() === 'PM' && hour !== 12) {
            hour24 += 12
          } else if (meridiem.toUpperCase() === 'AM' && hour === 12) {
            hour24 = 0
          }
          return `${hour24.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
        } else {
          // 24-hour format
          return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
        }
      }
    }
    
    return undefined
  }

  /**
   * Parse a single game line
   */
  private static parseGameLine(
    line: string, 
    currentDate?: Date, 
    currentLeague?: League
  ): PicksheetRow | undefined {
    // New format pattern:
    // "1 pt     Dallas (7-10) +7.5    Thu 5:20 PM    PHILADELPHIA (18-3) -7.5"
    // Pattern: [points] [away team (record)] [away spread] [day time] [HOME TEAM (record)] [home spread]
    
    // First check if this looks like a game line with "pt" in it
    if (line.includes(' pt ')) {
      // Enhanced pattern for the specific format - more flexible with spacing
      // Looking for: points "pt" [away team] [spread] [day] [time] [home team] [spread]
      const gamePattern = /^\s*\d+\s+pt\s+(.+?)\s+([+-]?\d+\.?\d*|PK|pick)\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\s+(.+?)\s+([+-]?\d+\.?\d*|PK|pick)\s*$/i
      
      // Try to match with flexible spacing
      let cleanLine = line.replace(/\s+/g, ' ').trim()
      const match = cleanLine.match(gamePattern)
      
      if (match) {
        let [, awayTeamFull, awaySpreadStr, dayName, timeStr, homeTeamFull, homeSpreadStr] = match
        
        // Extract team names (remove records in parentheses)
        const awayTeam = this.extractTeamName(awayTeamFull)
        const homeTeam = this.extractTeamName(homeTeamFull)
        
        // Parse spreads
        const awaySpread = this.parseSpread(awaySpreadStr)
        const homeSpread = this.parseSpread(homeSpreadStr)
        
        // Normalize team names
        const awayTeamNorm = this.normalizeTeamName(awayTeam, currentLeague)
        const homeTeamNorm = this.normalizeTeamName(homeTeam, currentLeague)
        
        // Extract time
        const time = this.extractTime(timeStr)
        
        return {
          league: currentLeague || this.inferLeague(awayTeam, homeTeam),
          eventDate: currentDate,
          eventTime: time,
          awayTeamRaw: awayTeamNorm,
          homeTeamRaw: homeTeamNorm,
          awaySpread: awaySpread,
          homeSpread: homeSpread,
          total: undefined, // This format doesn't include totals
          rawText: line
        }
      }
    }
    
    // Fallback to old parsing logic for other formats
    // Common patterns for game lines:
    // "Team1 vs Team2 -3.5 O/U 45.5"
    // "#11 Team1 @ Team2 +7"
    // "Team1 - Team2 PK"
    
    // Split on common separators
    const separators = /(vs\.?|@|-)(?=\s)/i
    const parts = line.split(separators).map(p => p.trim())
    
    if (parts.length < 3) {
      return undefined
    }
    
    let awayTeam = parts[0]
    let homeTeam = parts[2]
    
    // Extract spread from the remaining text
    const spreadText = parts.slice(3).join(' ')
    const spreads = this.extractSpreads(spreadText)
    
    // Normalize team names
    awayTeam = this.normalizeTeamName(awayTeam, currentLeague)
    homeTeam = this.normalizeTeamName(homeTeam, currentLeague)
    
    if (!awayTeam || !homeTeam) {
      return undefined
    }
    
    // Extract time if present
    const time = this.extractTime(line)
    
    return {
      league: currentLeague,
      eventDate: currentDate,
      eventTime: time,
      awayTeamRaw: awayTeam,
      homeTeamRaw: homeTeam,
      awaySpread: spreads.awaySpread,
      homeSpread: spreads.homeSpread,
      total: spreads.total,
      rawText: line
    }
  }

  /**
   * Extract team name from text with record (e.g., "Dallas (7-10)")
   */
  private static extractTeamName(text: string): string {
    // Remove record in parentheses
    const cleaned = text.replace(/\s*\(\d+-\d+\)\s*/g, '').trim()
    // Remove rankings
    return cleaned.replace(/^#\d+\s+/, '').trim()
  }

  /**
   * Parse spread value
   */
  private static parseSpread(spreadStr: string): number | undefined {
    if (!spreadStr) return undefined
    
    const upperStr = spreadStr.toUpperCase()
    if (upperStr === 'PK' || upperStr === 'PICK' || upperStr === 'EVEN') {
      return 0
    }
    
    const num = parseFloat(spreadStr)
    return isNaN(num) ? undefined : num
  }

  /**
   * Infer league from team names
   */
  private static inferLeague(awayTeam: string, homeTeam: string): League | undefined {
    // More comprehensive NFL team list with city/region names
    const nflTeams = [
      // AFC East
      'BUFFALO', 'MIAMI', 'NEW ENGLAND', 'NY JETS',
      // AFC North  
      'BALTIMORE', 'CINCINNATI', 'CLEVELAND', 'PITTSBURGH',
      // AFC South
      'HOUSTON', 'INDIANAPOLIS', 'JACKSONVILLE', 'TENNESSEE',
      // AFC West
      'DENVER', 'KANSAS CITY', 'LAS VEGAS', 'LA CHARGERS', 'LOS ANGELES CHARGERS',
      // NFC East
      'DALLAS', 'NY GIANTS', 'PHILADELPHIA', 'WASHINGTON',
      // NFC North
      'CHICAGO', 'DETROIT', 'GREEN BAY', 'MINNESOTA',
      // NFC South
      'ATLANTA', 'CAROLINA', 'NEW ORLEANS', 'TAMPA BAY', 'TAMPA',
      // NFC West
      'ARIZONA', 'LA RAMS', 'LOS ANGELES RAMS', 'SAN FRANCISCO', 'SEATTLE'
    ]
    
    // College indicators - these strongly suggest NCAAF
    const collegeIndicators = [
      'STATE', 'UNIVERSITY', 'TECH', 'A&M', 'COLLEGE',
      'NORTHWESTERN', 'NORTHERN', 'SOUTHERN', 'EASTERN', 'WESTERN', 'CENTRAL',
      'BOWLING GREEN', 'BALL STATE', 'KENT STATE', 'FRESNO STATE', 'SAN JOSE STATE',
      'IOWA STATE', 'OKLAHOMA STATE', 'MICHIGAN STATE', 'MISSISSIPPI STATE',
      'PENN STATE', 'ARIZONA STATE', 'WASHINGTON STATE', 'OREGON STATE',
      'OHIO STATE', 'BOISE STATE', 'UTAH STATE', 'COLORADO STATE',
      'JAMES MADISON', 'LIBERTY', 'ARMY', 'NAVY', 'AIR FORCE',
      'VANDERBILT', 'DUKE', 'STANFORD', 'NORTHWESTERN', 'RICE',
      'SMU', 'TCU', 'BYU', 'UNLV', 'UCLA', 'USC',
      'TULANE', 'TULSA', 'TEMPLE', 'MEMPHIS',
      'VIRGINIA TECH', 'GEORGIA TECH', 'LOUISIANA TECH',
      'ALABAMA', 'AUBURN', 'GEORGIA', 'FLORIDA', 'LSU',
      'TEXAS', 'OKLAHOMA', 'NEBRASKA', 'IOWA', 'WISCONSIN',
      'MICHIGAN', 'OHIO', 'ILLINOIS', 'INDIANA', 'PURDUE',
      'OREGON', 'CALIFORNIA', 'COLORADO', 'UTAH',
      'CLEMSON', 'VIRGINIA', 'MARYLAND', 'RUTGERS', 'SYRACUSE',
      'BAYLOR', 'ARKANSAS', 'MISSOURI', 'KENTUCKY', 'MISSISSIPPI',
      'MARSHALL', 'TOLEDO', 'AKRON', 'HAWAII', 'WYOMING',
      'UAB', 'UTSA', 'FIU', 'UL MONROE', 'CHARLOTTE',
      'CONNECTICUT', 'TROY', 'DELAWARE', 'SAM HOUSTON'
    ]
    
    const upperAway = awayTeam.toUpperCase()
    const upperHome = homeTeam.toUpperCase()
    
    // Check for college indicators first (they're more specific)
    for (const indicator of collegeIndicators) {
      if (upperAway.includes(indicator) || upperHome.includes(indicator)) {
        return 'NCAAF'
      }
    }
    
    // Then check for NFL teams
    let nflMatches = 0
    for (const nflTeam of nflTeams) {
      if (upperAway === nflTeam || upperHome === nflTeam ||
          upperAway.endsWith(' ' + nflTeam) || upperHome.endsWith(' ' + nflTeam)) {
        nflMatches++
      }
    }
    
    // If both teams match NFL teams, it's NFL
    if (nflMatches >= 2) {
      return 'NFL'
    }
    
    // If one team matches NFL but not the other, check if the other might be a nickname
    if (nflMatches === 1) {
      // Check if the non-matching team might be an NFL team with a different name
      const nflCityNames = ['TAMPA', 'NEW YORK', 'LA', 'LOS ANGELES', 'SAN FRANCISCO', 'KANSAS CITY']
      for (const city of nflCityNames) {
        if (upperAway.includes(city) || upperHome.includes(city)) {
          return 'NFL'
        }
      }
    }
    
    // Default to NCAAF if we're not sure (college games are more numerous in this format)
    return 'NCAAF'
  }

  /**
   * Extract spreads and totals from text
   */
  private static extractSpreads(text: string): {
    homeSpread?: number
    awaySpread?: number
    total?: number
  } {
    const result: any = {}
    
    // Look for total (O/U)
    const totalMatch = text.match(/(?:O\/U|o\/u|OVER\/UNDER|over\/under|total|TOTAL)\s*([+-]?\d+\.?\d*)/i)
    if (totalMatch) {
      result.total = parseFloat(totalMatch[1])
    }
    
    // Look for spread
    const spreadMatch = text.match(/([+-]?\d+\.?\d*)/)
    if (spreadMatch) {
      const spread = parseFloat(spreadMatch[1])
      // Home team gets the spread, away team gets opposite
      result.homeSpread = spread
      result.awaySpread = -spread
    }
    
    // Check for pick'em
    if (text.match(/(pk|pick|even)/i)) {
      result.homeSpread = 0
      result.awaySpread = 0
    }
    
    return result
  }

  /**
   * Normalize team name by removing rankings, records, and standardizing abbreviations
   */
  static normalizeTeamName(name: string, league?: League): string {
    let normalized = name.trim()
    
    // Remove NCAAF-specific patterns (rankings, records) - but do this for all leagues in this format
    for (const pattern of this.NCAAF_PATTERNS) {
      normalized = normalized.replace(pattern, '')
    }
    
    // Special handling for "LA" which should stay as "LA" for NFL teams
    const hasLA = normalized.includes('LA ') || normalized === 'LA'
    
    // Expand abbreviations (but be careful with LA)
    for (const [abbr, full] of Object.entries(this.ABBREVIATIONS)) {
      // Skip 'La.' expansion if this looks like an LA NFL team
      if (abbr === 'La.' && hasLA) continue
      
      // Use word boundaries to avoid partial replacements
      const regex = new RegExp(`\\b${abbr.replace('.', '\\.')}\\b`, 'gi')
      normalized = normalized.replace(regex, full)
    }
    
    // Fix common issues
    normalized = normalized.replace(/\s+/g, ' ').trim()
    
    // Fix specific team name issues
    if (normalized === 'Louisiana CHARGERS') {
      normalized = 'LA CHARGERS'
    }
    if (normalized === 'Louisiana RAMS') {
      normalized = 'LA RAMS'
    }
    if (normalized === 'Northern CAROLINA State') {
      normalized = 'North Carolina State'
    }
    
    return normalized
  }

  /**
   * Convert parsed rows to database format
   */
  static toDatabase(
    rows: PicksheetRow[], 
    sourceRunId?: string
  ): ParsedRow[] {
    return rows.map(row => ({
      source_run_id: sourceRunId || null,
      league: row.league || null,
      event_date_local: row.eventDate ? row.eventDate.toISOString().split('T')[0] : null,
      event_time_local: row.eventTime || null,
      home_name_raw: row.homeTeamRaw,
      away_name_raw: row.awayTeamRaw,
      home_spread_raw: row.homeSpread || null,
      away_spread_raw: row.awaySpread || null,
      total_raw: row.total || null,
      market: 'spread',
      raw_text: row.rawText,
      metadata: {}
    }))
  }
}