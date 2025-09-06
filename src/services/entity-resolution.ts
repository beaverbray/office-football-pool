import Fuse from 'fuse.js'
import OpenAI from 'openai'

// Team name mappings and aliases
const NFL_TEAM_MAPPINGS: Record<string, string[]> = {
  // AFC East
  'Buffalo Bills': ['Bills', 'Buffalo', 'BUF'],
  'Miami Dolphins': ['Dolphins', 'Miami', 'MIA'],
  'New England Patriots': ['Patriots', 'New England', 'Pats', 'NE'],
  'New York Jets': ['Jets', 'NY Jets', 'NYJ'],
  
  // AFC North
  'Baltimore Ravens': ['Ravens', 'Baltimore', 'BAL'],
  'Cincinnati Bengals': ['Bengals', 'Cincinnati', 'Cincy', 'CIN'],
  'Cleveland Browns': ['Browns', 'Cleveland', 'CLE'],
  'Pittsburgh Steelers': ['Steelers', 'Pittsburgh', 'Pitt', 'PIT'],
  
  // AFC South
  'Houston Texans': ['Texans', 'Houston', 'HOU'],
  'Indianapolis Colts': ['Colts', 'Indianapolis', 'Indy', 'IND'],
  'Jacksonville Jaguars': ['Jaguars', 'Jacksonville', 'Jags', 'JAX', 'JAC'],
  'Tennessee Titans': ['Titans', 'Tennessee', 'TEN'],
  
  // AFC West
  'Denver Broncos': ['Broncos', 'Denver', 'DEN'],
  'Kansas City Chiefs': ['Chiefs', 'Kansas City', 'KC', 'KC Chiefs'],
  'Las Vegas Raiders': ['Raiders', 'Las Vegas', 'LV', 'LVR', 'Oakland Raiders'],
  'Los Angeles Chargers': ['Chargers', 'LA Chargers', 'L.A. Chargers', 'LAC', 'San Diego Chargers'],
  
  // NFC East
  'Dallas Cowboys': ['Cowboys', 'Dallas', 'DAL'],
  'New York Giants': ['Giants', 'NY Giants', 'NYG'],
  'Philadelphia Eagles': ['Eagles', 'Philadelphia', 'Philly', 'PHI'],
  'Washington Commanders': ['Commanders', 'Washington', 'WAS', 'Washington Football Team', 'Redskins'],
  
  // NFC North
  'Chicago Bears': ['Bears', 'Chicago', 'CHI'],
  'Detroit Lions': ['Lions', 'Detroit', 'DET'],
  'Green Bay Packers': ['Packers', 'Green Bay', 'GB', 'GBP'],
  'Minnesota Vikings': ['Vikings', 'Minnesota', 'MIN'],
  
  // NFC South
  'Atlanta Falcons': ['Falcons', 'Atlanta', 'ATL'],
  'Carolina Panthers': ['Panthers', 'Carolina', 'CAR'],
  'New Orleans Saints': ['Saints', 'New Orleans', 'NO', 'NOS'],
  'Tampa Bay Buccaneers': ['Buccaneers', 'Tampa Bay', 'Tampa', 'Bucs', 'TB', 'TBB'],
  
  // NFC West
  'Arizona Cardinals': ['Cardinals', 'Arizona', 'ARI', 'AZ'],
  'Los Angeles Rams': ['Rams', 'LA Rams', 'L.A. Rams', 'LAR', 'St. Louis Rams'],
  'San Francisco 49ers': ['49ers', 'San Francisco', 'SF', 'SFO', 'Niners'],
  'Seattle Seahawks': ['Seahawks', 'Seattle', 'SEA']
}

// Common NCAAF team mappings - expanded for better matching
const NCAAF_TEAM_MAPPINGS: Record<string, string[]> = {
  // Major Conference Teams - SEC
  'Alabama Crimson Tide': ['Alabama', 'Bama', 'Crimson Tide', 'ALA'],
  'Georgia Bulldogs': ['Georgia', 'UGA', 'Bulldogs', 'GA'],
  'Florida Gators': ['Florida', 'UF', 'Gators', 'FLA'],
  'Tennessee Volunteers': ['Tennessee', 'Vols', 'UT', 'TENN'],
  'LSU Tigers': ['LSU', 'Louisiana State', 'Louisiana St.', 'Louisiana State University'],
  'Auburn Tigers': ['Auburn', 'AU', 'War Eagle', 'AUB'],
  'Texas A&M Aggies': ['Texas A&M', 'A&M', 'TAMU', 'Aggies'],
  'Ole Miss Rebels': ['Ole Miss', 'Mississippi', 'Miss', 'MISS'],
  'Mississippi State Bulldogs': ['Mississippi State', 'Mississippi St.', 'Miss State', 'MSU', 'MSST'],
  'Arkansas Razorbacks': ['Arkansas', 'Hogs', 'ARK'],
  'Kentucky Wildcats': ['Kentucky', 'UK', 'Wildcats', 'KY'],
  'Missouri Tigers': ['Missouri', 'Mizzou', 'MO', 'MIZ'],
  'South Carolina Gamecocks': ['South Carolina', 'USC', 'Gamecocks', 'SCAR'],
  'Vanderbilt Commodores': ['Vanderbilt', 'Vandy', 'Commodores', 'VAN'],
  
  // Big Ten
  'Ohio State Buckeyes': ['Ohio State', 'Ohio St.', 'OSU', 'Buckeyes', 'OHST'],
  'Michigan Wolverines': ['Michigan', 'U of M', 'UM', 'Wolverines', 'MICH'],
  'Michigan State Spartans': ['Michigan State', 'Michigan St.', 'MSU', 'Spartans', 'MIST'],
  'Penn State Nittany Lions': ['Penn State', 'Penn St.', 'PSU', 'Nittany Lions', 'PENN'],
  'Wisconsin Badgers': ['Wisconsin', 'Badgers', 'WIS', 'WISC'],
  'Iowa Hawkeyes': ['Iowa', 'Hawkeyes', 'IOWA'],
  'Iowa State Cyclones': ['Iowa State', 'Iowa St.', 'ISU', 'Cyclones', 'IAST'],
  'Nebraska Cornhuskers': ['Nebraska', 'Huskers', 'NEB', 'NEBR'],
  'Minnesota Golden Gophers': ['Minnesota', 'Gophers', 'MINN', 'MIN'],
  'Indiana Hoosiers': ['Indiana', 'IU', 'Hoosiers', 'IND'],
  'Illinois Fighting Illini': ['Illinois', 'Illini', 'ILL', 'ILLI'],
  'Northwestern Wildcats': ['Northwestern', 'NU', 'Wildcats', 'NW'],
  'Purdue Boilermakers': ['Purdue', 'Boilermakers', 'PUR', 'PURD'],
  'Maryland Terrapins': ['Maryland', 'Terps', 'Terrapins', 'MD'],
  'Rutgers Scarlet Knights': ['Rutgers', 'RU', 'Scarlet Knights', 'RUTG'],
  
  // Big 12
  'Texas Longhorns': ['Texas', 'UT', 'Longhorns', 'TEX'],
  'Oklahoma Sooners': ['Oklahoma', 'OU', 'Sooners', 'OKLA'],
  'Oklahoma State Cowboys': ['Oklahoma State', 'Oklahoma St.', 'OSU', 'OK State', 'OKST'],
  'Texas Tech Red Raiders': ['Texas Tech', 'Tech', 'TTU', 'Red Raiders', 'TXTC'],
  'Baylor Bears': ['Baylor', 'BU', 'Bears', 'BAY'],
  'TCU Horned Frogs': ['TCU', 'Texas Christian', 'Horned Frogs'],
  'Kansas Jayhawks': ['Kansas', 'KU', 'Jayhawks', 'KAN'],
  'Kansas State Wildcats': ['Kansas State', 'Kansas St.', 'K-State', 'KSU', 'KAST'],
  'West Virginia Mountaineers': ['West Virginia', 'WVU', 'Mountaineers', 'WV'],
  'Cincinnati Bearcats': ['Cincinnati', 'Cincy', 'UC', 'Bearcats', 'CIN'],
  'Houston Cougars': ['Houston', 'UH', 'Cougars', 'HOU'],
  'UCF Knights': ['UCF', 'Central Florida', 'Knights'],
  'BYU Cougars': ['BYU', 'Brigham Young', 'Cougars'],
  
  // ACC
  'Clemson Tigers': ['Clemson', 'Tigers', 'CLEM'],
  'Florida State Seminoles': ['Florida State', 'Florida St.', 'FSU', 'Seminoles', 'FLST'],
  'Miami Hurricanes': ['Miami', 'The U', 'Canes', 'Hurricanes', 'MIA'],
  'North Carolina Tar Heels': ['North Carolina', 'UNC', 'Tar Heels', 'NC', 'NCAR'],
  'North Carolina State Wolfpack': ['North Carolina State', 'NC State', 'NCSU', 'Wolfpack', 'NCST'],
  'Duke Blue Devils': ['Duke', 'Blue Devils', 'DUKE'],
  'Virginia Cavaliers': ['Virginia', 'UVA', 'Cavaliers', 'VA'],
  'Virginia Tech Hokies': ['Virginia Tech', 'VT', 'Hokies', 'VTECH'],
  'Louisville Cardinals': ['Louisville', 'UL', 'Cardinals', 'LOU'],
  'Syracuse Orange': ['Syracuse', 'Cuse', 'Orange', 'SYR'],
  'Pittsburgh Panthers': ['Pittsburgh', 'Pitt', 'Panthers', 'PIT'],
  'Boston College Eagles': ['Boston College', 'BC', 'Eagles', 'BOST'],
  'Wake Forest Demon Deacons': ['Wake Forest', 'Wake', 'Demon Deacons', 'WAKE'],
  'Georgia Tech Yellow Jackets': ['Georgia Tech', 'GT', 'Yellow Jackets', 'GATECH'],
  
  // Pac-12
  'Oregon Ducks': ['Oregon', 'Ducks', 'ORE', 'OREG'],
  'Oregon State Beavers': ['Oregon State', 'Oregon St.', 'OSU', 'Beavers', 'ORST'],
  'Washington Huskies': ['Washington', 'UW', 'Huskies', 'WASH'],
  'Washington State Cougars': ['Washington State', 'Washington St.', 'WSU', 'Wazzu', 'Cougars', 'WAST'],
  'USC Trojans': ['USC', 'Southern Cal', 'Trojans'],
  'UCLA Bruins': ['UCLA', 'Bruins'],
  'Stanford Cardinal': ['Stanford', 'Cardinal', 'STAN'],
  'California Golden Bears': ['California', 'Cal', 'Golden Bears', 'CAL'],
  'Arizona Wildcats': ['Arizona', 'UA', 'Wildcats', 'ARIZ'],
  'Arizona State Sun Devils': ['Arizona State', 'Arizona St.', 'ASU', 'Sun Devils', 'AZST'],
  'Colorado Buffaloes': ['Colorado', 'CU', 'Buffs', 'Buffaloes', 'COLO'],
  'Utah Utes': ['Utah', 'Utes', 'UTAH'],
  
  // Other Notable Teams
  'Notre Dame Fighting Irish': ['Notre Dame', 'ND', 'Fighting Irish', 'Irish'],
  'Army Black Knights': ['Army', 'Black Knights', 'ARMY'],
  'Navy Midshipmen': ['Navy', 'Midshipmen', 'NAVY'],
  'Air Force Falcons': ['Air Force', 'Falcons', 'AFA'],
  
  // Group of Five - AAC, Mountain West, etc.
  'SMU Mustangs': ['SMU', 'Southern Methodist', 'Mustangs'],
  'Memphis Tigers': ['Memphis', 'Tigers', 'MEM'],
  'Tulane Green Wave': ['Tulane', 'Green Wave', 'TULN'],
  'Tulsa Golden Hurricane': ['Tulsa', 'Golden Hurricane', 'TULS'],
  'South Florida Bulls': ['South Florida', 'S. Florida', 'USF', 'Bulls'],
  'Temple Owls': ['Temple', 'Owls', 'TEM'],
  'East Carolina Pirates': ['East Carolina', 'ECU', 'Pirates'],
  'Boise State Broncos': ['Boise State', 'Boise St.', 'BSU', 'Broncos', 'BOIS'],
  'Fresno State Bulldogs': ['Fresno State', 'Fresno St.', 'Bulldogs', 'FRES'],
  'San Diego State Aztecs': ['San Diego State', 'San Diego St.', 'SDSU', 'Aztecs'],
  'UNLV Rebels': ['UNLV', 'Nevada Las Vegas', 'Rebels'],
  'Nevada Wolf Pack': ['Nevada', 'Wolf Pack', 'NEV'],
  'Hawaii Rainbow Warriors': ['Hawaii', 'Rainbow Warriors', 'HAW'],
  'San Jose State Spartans': ['San Jose State', 'San Jose St.', 'SJSU', 'Spartans'],
  
  // Additional Teams
  'UAB Blazers': ['UAB', 'Alabama Birmingham', 'Blazers'],
  'UTSA Roadrunners': ['UTSA', 'UT San Antonio', 'Roadrunners'],
  'UTEP Miners': ['UTEP', 'UT El Paso', 'Miners'],
  'Rice Owls': ['Rice', 'Owls', 'RICE'],
  'North Texas Mean Green': ['North Texas', 'UNT', 'Mean Green', 'NTEX'],
  'Charlotte 49ers': ['Charlotte', 'Charlotte 49ers', 'CHAR', '49ers'],
  'Marshall Thundering Herd': ['Marshall', 'Thundering Herd', 'MRSH'],
  'Western Michigan Broncos': ['Western Michigan', 'Western Mich', 'WMU', 'Broncos', 'WMICH'],
  'Central Michigan Chippewas': ['Central Michigan', 'Central Mich', 'CMU', 'Chippewas', 'CMICH'],
  'Eastern Michigan Eagles': ['Eastern Michigan', 'Eastern Mich', 'EMU', 'Eagles', 'EMICH'],
  'Northern Illinois Huskies': ['Northern Illinois', 'Northern Ill', 'NIU', 'Huskies', 'NILL'],
  'Toledo Rockets': ['Toledo', 'Rockets', 'TOL'],
  'Bowling Green Falcons': ['Bowling Green', 'BGSU', 'Falcons', 'BGWL'],
  'Kent State Golden Flashes': ['Kent State', 'Kent St.', 'Golden Flashes', 'KENT'],
  'Akron Zips': ['Akron', 'Zips', 'AKR'],
  'Ohio Bobcats': ['Ohio', 'Bobcats', 'OHIO'],
  'Miami (OH) RedHawks': ['Miami (OH)', 'Miami Ohio', 'Miami-Ohio', 'RedHawks', 'MIOH'],
  'Ball State Cardinals': ['Ball State', 'Ball St.', 'Cardinals', 'BALL'],
  'Buffalo Bulls': ['Buffalo', 'Bulls', 'BUFF'],
  
  // FCS Teams that sometimes play FBS
  'James Madison Dukes': ['James Madison', 'JMU', 'Dukes', 'JMAD'],
  'Liberty Flames': ['Liberty', 'Flames', 'LIB'],
  'Jacksonville State Gamecocks': ['Jacksonville State', 'Jacksonville St.', 'JSU', 'Gamecocks', 'JKST'],
  'Sam Houston State Bearkats': ['Sam Houston State', 'Sam Houston St.', 'SHSU', 'Bearkats', 'SHST'],
  'Missouri State Bears': ['Missouri State', 'Missouri St.', 'Bears', 'MOST'],
  'Arkansas State Red Wolves': ['Arkansas State', 'Arkansas St.', 'Red Wolves', 'ARST'],
  'Georgia State Panthers': ['Georgia State', 'Georgia St.', 'Panthers', 'GAST'],
  'Georgia Southern Eagles': ['Georgia Southern', 'Eagles', 'GASOU'],
  'Louisiana Tech Bulldogs': ['Louisiana Tech', 'La Tech', 'Bulldogs', 'LTECH'],
  'UL Monroe Warhawks': ['UL Monroe', 'Louisiana Monroe', 'ULM', 'Warhawks', 'ULMON'],
  'South Alabama Jaguars': ['South Alabama', 'USA', 'Jaguars', 'SALA'],
  'Troy Trojans': ['Troy', 'Trojans', 'TROY'],
  'Middle Tennessee Blue Raiders': ['Middle Tennessee', 'Middle Tenn', 'MTSU', 'Blue Raiders', 'MTENN'],
  'Western Kentucky Hilltoppers': ['Western Kentucky', 'WKU', 'Hilltoppers', 'WKEN'],
  'FIU Panthers': ['FIU', 'Florida International', 'Panthers'],
  'FAU Owls': ['FAU', 'Florida Atlantic', 'Owls'],
  'Louisiana Ragin\' Cajuns': ['Louisiana', 'Louisiana Lafayette', 'ULL', 'Ragin\' Cajuns', 'LALA'],
  'New Mexico State Aggies': ['New Mexico State', 'New Mexico St.', 'NMSU', 'Aggies', 'NMST'],
  'New Mexico Lobos': ['New Mexico', 'Lobos', 'NMEX'],
  'Utah State Aggies': ['Utah State', 'Utah St.', 'USU', 'Aggies', 'UTST'],
  'Wyoming Cowboys': ['Wyoming', 'Cowboys', 'WYO'],
  'Colorado State Rams': ['Colorado State', 'Colorado St.', 'CSU', 'Rams', 'COST'],
  
  // Additional small schools
  'Connecticut Huskies': ['Connecticut', 'UConn', 'Huskies', 'CONN'],
  'UMass Minutemen': ['UMass', 'Massachusetts', 'Minutemen', 'UMAS'],
  'Old Dominion Monarchs': ['Old Dominion', 'ODU', 'Monarchs', 'ODOM'],
  'Coastal Carolina Chanticleers': ['Coastal Carolina', 'CCU', 'Chanticleers', 'CCAR'],
  'Appalachian State Mountaineers': ['Appalachian State', 'App State', 'Mountaineers', 'APPS'],
  'Texas State Bobcats': ['Texas State', 'Texas St.', 'Bobcats', 'TXST'],
  'Southern Miss Golden Eagles': ['Southern Miss', 'Southern Mississippi', 'USM', 'Golden Eagles', 'SMIS'],
  'Delaware Blue Hens': ['Delaware', 'Blue Hens', 'DEL'],
  'Kennesaw State Owls': ['Kennesaw State', 'Kennesaw St.', 'KSU', 'Owls', 'KENN']
}

// Common NCAAF team patterns
const NCAAF_PATTERNS = {
  stateSchools: ['State', 'University', 'College', 'Tech', 'A&M'],
  commonAbbreviations: Object.keys(NCAAF_TEAM_MAPPINGS).reduce((acc, team) => {
    const abbreviations = NCAAF_TEAM_MAPPINGS[team].filter(alias => alias.length <= 4 && alias === alias.toUpperCase())
    abbreviations.forEach(abbr => {
      acc[abbr] = team
    })
    return acc
  }, {} as Record<string, string>)
}

// Types
export interface TeamMatch {
  originalName: string
  matchedName: string
  confidence: number
  league: 'NFL' | 'NCAAF'
  method: 'exact' | 'alias' | 'fuzzy' | 'llm'
  candidates?: Array<{ name: string; score: number }>
}

export interface GameMatch {
  homeTeam: TeamMatch
  awayTeam: TeamMatch
  overallConfidence: number
  needsVerification: boolean
}

export class EntityResolver {
  private nflFuse: Fuse<{ name: string; aliases: string[] }>
  private ncaafFuse: Fuse<{ name: string; aliases: string[] }>
  private openai?: OpenAI

  constructor(openaiApiKey?: string) {
    // Initialize Fuse.js for NFL teams
    const nflTeams = Object.entries(NFL_TEAM_MAPPINGS).map(([name, aliases]) => ({
      name,
      aliases
    }))

    this.nflFuse = new Fuse(nflTeams, {
      keys: ['name', 'aliases'],
      threshold: 0.4, // Allow for some fuzzy matching
      includeScore: true,
      minMatchCharLength: 3
    })

    // Initialize Fuse.js for NCAAF teams
    const ncaafTeams = Object.entries(NCAAF_TEAM_MAPPINGS).map(([name, aliases]) => ({
      name,
      aliases
    }))

    this.ncaafFuse = new Fuse(ncaafTeams, {
      keys: ['name', 'aliases'],
      threshold: 0.4,
      includeScore: true,
      minMatchCharLength: 3
    })

    // Initialize OpenAI if API key is provided
    if (openaiApiKey || process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: openaiApiKey || process.env.OPENAI_API_KEY
      })
    }
  }

  /**
   * Normalize team name for matching
   */
  normalizeTeamName(name: string): string {
    return name
      .trim()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .toLowerCase()
  }

  /**
   * Check for exact match or alias match for NFL teams
   */
  findNFLTeamExact(teamName: string): TeamMatch | null {
    const normalized = this.normalizeTeamName(teamName)
    
    // Check each team and its aliases
    for (const [officialName, aliases] of Object.entries(NFL_TEAM_MAPPINGS)) {
      const normalizedOfficial = this.normalizeTeamName(officialName)
      
      if (normalizedOfficial === normalized) {
        return {
          originalName: teamName,
          matchedName: officialName,
          confidence: 1.0,
          league: 'NFL',
          method: 'exact'
        }
      }
      
      // Check aliases
      for (const alias of aliases) {
        if (this.normalizeTeamName(alias) === normalized) {
          return {
            originalName: teamName,
            matchedName: officialName,
            confidence: 0.95,
            league: 'NFL',
            method: 'alias'
          }
        }
      }
    }
    
    return null
  }

  /**
   * Use fuzzy matching for NFL teams
   */
  findNFLTeamFuzzy(teamName: string): TeamMatch | null {
    const results = this.nflFuse.search(teamName)
    
    if (results.length > 0) {
      const topMatch = results[0]
      const confidence = 1 - (topMatch.score || 0) // Convert Fuse score to confidence
      
      if (confidence > 0.6) {
        return {
          originalName: teamName,
          matchedName: topMatch.item.name,
          confidence: confidence * 0.9, // Slightly reduce confidence for fuzzy matches
          league: 'NFL',
          method: 'fuzzy',
          candidates: results.slice(0, 3).map(r => ({
            name: r.item.name,
            score: 1 - (r.score || 0)
          }))
        }
      }
    }
    
    return null
  }

  /**
   * Check for exact match or alias match for NCAAF teams
   */
  findNCAAFTeamExact(teamName: string): TeamMatch | null {
    const normalized = this.normalizeTeamName(teamName)
    
    // Remove ranking if present
    const cleanName = teamName.replace(/^#\d+\s*/, '')
    const normalizedClean = this.normalizeTeamName(cleanName)
    
    // Check each team and its aliases
    for (const [officialName, aliases] of Object.entries(NCAAF_TEAM_MAPPINGS)) {
      const normalizedOfficial = this.normalizeTeamName(officialName)
      
      if (normalizedOfficial === normalized || normalizedOfficial === normalizedClean) {
        return {
          originalName: teamName,
          matchedName: officialName,
          confidence: 1.0,
          league: 'NCAAF',
          method: 'exact'
        }
      }
      
      // Check aliases
      for (const alias of aliases) {
        if (this.normalizeTeamName(alias) === normalized || this.normalizeTeamName(alias) === normalizedClean) {
          return {
            originalName: teamName,
            matchedName: officialName,
            confidence: 0.95,
            league: 'NCAAF',
            method: 'alias'
          }
        }
      }
    }
    
    return null
  }

  /**
   * Use fuzzy matching for NCAAF teams
   */
  findNCAAFTeamFuzzy(teamName: string): TeamMatch | null {
    // Remove ranking if present
    const cleanName = teamName.replace(/^#\d+\s*/, '')
    
    const results = this.ncaafFuse.search(cleanName)
    
    if (results.length > 0) {
      const topMatch = results[0]
      const confidence = 1 - (topMatch.score || 0)
      
      if (confidence > 0.6) {
        return {
          originalName: teamName,
          matchedName: topMatch.item.name,
          confidence: confidence * 0.9,
          league: 'NCAAF',
          method: 'fuzzy',
          candidates: results.slice(0, 3).map(r => ({
            name: r.item.name,
            score: 1 - (r.score || 0)
          }))
        }
      }
    }
    
    return null
  }

  /**
   * Detect if a team is likely NCAAF based on patterns
   */
  isLikelyNCAA(teamName: string): boolean {
    const name = teamName.toLowerCase()
    
    // Check for state school patterns
    if (NCAAF_PATTERNS.stateSchools.some(pattern => 
      name.includes(pattern.toLowerCase())
    )) {
      return true
    }
    
    // Check for known abbreviations
    if (Object.keys(NCAAF_PATTERNS.commonAbbreviations).some(abbr => 
      name.includes(abbr.toLowerCase())
    )) {
      return true
    }
    
    // Check for rankings (e.g., "#1", "#11")
    if (/^#\d+/.test(teamName.trim())) {
      return true
    }
    
    return false
  }

  /**
   * Match a single team name
   */
  async matchTeam(teamName: string, league?: 'NFL' | 'NCAAF'): Promise<TeamMatch> {
    // Try NFL exact match first (unless explicitly NCAAF)
    if (league !== 'NCAAF') {
      const nflExact = this.findNFLTeamExact(teamName)
      if (nflExact) {
        return nflExact
      }
    }
    
    // If league is specified as NCAAF or team is likely NCAA
    if (league === 'NCAAF' || this.isLikelyNCAA(teamName)) {
      // Try exact NCAAF match first
      const ncaafExact = this.findNCAAFTeamExact(teamName)
      if (ncaafExact) {
        return ncaafExact
      }
      
      // Try fuzzy NCAAF match
      const ncaafFuzzy = this.findNCAAFTeamFuzzy(teamName)
      if (ncaafFuzzy) {
        return ncaafFuzzy
      }
    }
    
    // Try NFL fuzzy matching if not explicitly NCAAF
    if (league !== 'NCAAF') {
      const nflFuzzy = this.findNFLTeamFuzzy(teamName)
      if (nflFuzzy) {
        return nflFuzzy
      }
    }
    
    // If still no match and likely NCAA, return with medium confidence
    if (this.isLikelyNCAA(teamName)) {
      return {
        originalName: teamName,
        matchedName: teamName.replace(/^#\d+\s*/, ''), // Remove ranking
        confidence: 0.7,
        league: 'NCAAF',
        method: 'fuzzy'
      }
    }
    
    // Check if it might be NCAAF that we missed
    const ncaafExact = this.findNCAAFTeamExact(teamName)
    if (ncaafExact) {
      return ncaafExact
    }
    
    const ncaafFuzzy = this.findNCAAFTeamFuzzy(teamName)
    if (ncaafFuzzy) {
      return ncaafFuzzy
    }
    
    // If no match found and likely NCAA, return as NCAA
    if (this.isLikelyNCAA(teamName)) {
      return {
        originalName: teamName,
        matchedName: teamName.replace(/^#\d+\s*/, ''),
        confidence: 0.6,
        league: 'NCAAF',
        method: 'fuzzy'
      }
    }
    
    // Default to low confidence match
    return {
      originalName: teamName,
      matchedName: teamName,
      confidence: 0.3,
      league: league || 'NFL',
      method: 'fuzzy'
    }
  }

  /**
   * Match a game with home and away teams
   */
  async matchGame(
    homeTeam: string,
    awayTeam: string,
    league?: 'NFL' | 'NCAAF'
  ): Promise<GameMatch> {
    const [homeMatch, awayMatch] = await Promise.all([
      this.matchTeam(homeTeam, league),
      this.matchTeam(awayTeam, league)
    ])
    
    const overallConfidence = (homeMatch.confidence + awayMatch.confidence) / 2
    const needsVerification = overallConfidence < 0.7 || 
                            homeMatch.confidence < 0.6 || 
                            awayMatch.confidence < 0.6
    
    return {
      homeTeam: homeMatch,
      awayTeam: awayMatch,
      overallConfidence,
      needsVerification
    }
  }

  /**
   * Use LLM to verify ambiguous matches
   */
  async verifyWithLLM(
    originalName: string,
    candidates: string[],
    context?: { league?: string; otherTeam?: string }
  ): Promise<{ matchedName: string; confidence: number } | null> {
    if (!this.openai) {
      console.warn('OpenAI not configured for LLM verification')
      return null
    }
    
    try {
      const prompt = `Match the team name "${originalName}" to the most likely official team name from these candidates: ${candidates.join(', ')}.
      ${context?.league ? `League: ${context.league}` : ''}
      ${context?.otherTeam ? `Playing against: ${context.otherTeam}` : ''}
      
      Respond with only the exact team name from the list, or "NONE" if no good match.`
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a sports team name matcher. Respond only with the team name or NONE.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        max_tokens: 50
      })
      
      const response = completion.choices[0].message.content?.trim()
      
      if (response && response !== 'NONE' && candidates.includes(response)) {
        return {
          matchedName: response,
          confidence: 0.85
        }
      }
    } catch (error) {
      console.error('LLM verification failed:', error)
    }
    
    return null
  }

  /**
   * Batch match multiple games
   */
  async matchGames(games: Array<{ homeTeam: string; awayTeam: string; league?: 'NFL' | 'NCAAF' }>): Promise<GameMatch[]> {
    return Promise.all(
      games.map(game => this.matchGame(game.homeTeam, game.awayTeam, game.league))
    )
  }

  /**
   * Get all NFL team names and aliases for reference
   */
  static getAllNFLTeams(): Array<{ official: string; aliases: string[] }> {
    return Object.entries(NFL_TEAM_MAPPINGS).map(([official, aliases]) => ({
      official,
      aliases
    }))
  }
}