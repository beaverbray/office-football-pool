import OpenAI from 'openai'
import { z } from 'zod'

// Define the schema for a single game
const GameSchema = z.object({
  league: z.enum(['NFL', 'NCAAF']).describe('League: NFL or NCAAF (college football)'),
  awayTeam: z.string().describe('Away team name (visiting team)'),
  awayRecord: z.string().optional().describe('Away team record if provided (e.g., "7-10")'),
  awaySpread: z.number().describe('Away team spread (positive or negative number)'),
  homeTeam: z.string().describe('Home team name (usually in CAPS in the picksheet)'),
  homeRecord: z.string().optional().describe('Home team record if provided'),
  homeSpread: z.number().describe('Home team spread (positive or negative number)'),
  gameDay: z.string().optional().describe('Day of week (e.g., "Thu", "Fri", "Sat", "Sun", "Mon")'),
  gameDate: z.string().optional().describe('Game date if provided (e.g., "January 5, 2025")'),
  gameTime: z.string().optional().describe('Game time (e.g., "5:20 PM", "1:00 PM")'),
  overUnder: z.number().optional().describe('Over/under total if provided (e.g., 42.5)'),
  points: z.number().optional().describe('Point value for this pick if provided'),
})

// Define the schema for the entire picksheet
const PicksheetSchema = z.object({
  title: z.string().optional().describe('Title of the picksheet if provided'),
  week: z.string().optional().describe('Week number or description'),
  games: z.array(GameSchema).describe('List of all games in the picksheet'),
  totalGames: z.number().describe('Total number of games parsed'),
  nflGames: z.number().describe('Number of NFL games'),
  ncaafGames: z.number().describe('Number of NCAAF/college games'),
})

export type ParsedGame = z.infer<typeof GameSchema>
export type ParsedPicksheet = z.infer<typeof PicksheetSchema>

export class LLMPicksheetParser {
  /**
   * Parse picksheet text using OpenAI with structured output
   * @param text - The picksheet text to parse
   * @param scheduleGames - Optional schedule games for the week to use as matching context
   */
  static async parseWithLLM(text: string, scheduleGames?: any[]): Promise<ParsedPicksheet> {
    try {
      // Check API key
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('OpenAI API key not configured')
      }

      console.log('API Key check:', {
        exists: !!apiKey,
        length: apiKey.length,
        first10: apiKey.substring(0, 10),
        last5: apiKey.substring(apiKey.length - 5)
      })

      // Initialize OpenAI client only when needed
      const openai = new OpenAI({
        apiKey: apiKey,
      })

      console.log('Starting LLM parse with text length:', text.length)
      if (scheduleGames && scheduleGames.length > 0) {
        console.log(`Using schedule context with ${scheduleGames.length} games for enhanced matching`)
      }

      // Build schedule context if provided
      let scheduleContext = ''
      if (scheduleGames && scheduleGames.length > 0) {
        scheduleContext = `

SCHEDULE REFERENCE FOR THIS WEEK:
You have access to the official schedule for this week. Use this to match team names EXACTLY as they appear in the schedule.
This eliminates ambiguity in team naming (e.g., "Florida Atlantic" vs "FAU", "Miami (FL)" vs "Miami").

${scheduleGames.map((game, idx) =>
  `${idx + 1}. ${game.away_team} @ ${game.home_team} (${game.league}, Week ${game.week})`
).join('\n')}

IMPORTANT: When parsing team names from the picksheet:
1. Match each game to the schedule above using fuzzy matching if needed
2. Use the EXACT team names from the schedule (away_team and home_team)
3. This ensures consistency across all data sources
4. If a picksheet team doesn't match any schedule game, use your best judgment for the name
`
      }

      const systemPrompt = `You are an expert sports betting picksheet parser. Extract structured data from picksheet text and return ONLY valid JSON that conforms to the schema below.

${scheduleContext}

SOURCE OF TRUTH - SCHEDULE MATCHING:
- The SCHEDULE REFERENCE above is your canonical source for team names and matchups
- The PAIR of team names (home + away) uniquely identifies ONE game in the schedule
- Match by finding BOTH teams in a single schedule line (order-insensitive)
- Once matched, use the EXACT team names from the schedule (away_team and home_team fields)
- The league is automatically determined from whichever schedule game matched both teams
- Do NOT use abbreviations or alternate spellings in your output - always use the exact schedule name

⚠️ CRITICAL: DISAMBIGUATING DUPLICATE TEAM NAMES
- Some team names appear in MULTIPLE games (e.g., "Minnesota" in both NFL and NCAAF)
- Use BOTH team names to identify which game: "Minnesota + Cleveland" → NFL, "Minnesota + Ohio State" → NCAA
- The opposing team name tells you which Minnesota game it is
- Each picksheet line is INDEPENDENT - parse the record and spread FROM THAT SPECIFIC LINE ONLY
- Example workflow:
  1. Picksheet: "Minnesota (2-2) -3.5 ... CLEVELAND (1-3) +3.5"
     → Find schedule game with BOTH "Minnesota" AND "Cleveland"
     → Match found: "Minnesota Vikings @ Cleveland Browns (NFL)"
     → Use record (2-2) and spread -3.5 for Minnesota, record (1-3) and spread +3.5 for Cleveland
  2. Picksheet: "Minnesota (3-1) +23.5 ... OHIO ST. (4-0) -23.5"
     → Find schedule game with BOTH "Minnesota" AND "Ohio"
     → Match found: "Minnesota @ Ohio State (NCAA)"
     → Use record (3-1) and spread +23.5 for Minnesota, record (4-0) and spread -23.5 for Ohio State
- NEVER copy data from one Minnesota game to another Minnesota game!

TEAM NAME ALIASES (normalize before matching to schedule):

NFL Aliases:
- "LA RAMS" / "L.A. Rams" → "Los Angeles Rams"
- "LA CHARGERS" / "L.A. Chargers" → "Los Angeles Chargers"
- "NY JETS" / "N.Y. Jets" → "New York Jets"
- "NY Giants" / "N.Y. Giants" → "New York Giants"
- "Tampa Bay" → "Tampa Bay Buccaneers"
- "Washington" → "Washington Commanders"
- "New England" → "New England Patriots"
- "Green Bay" → "Green Bay Packers"
- "Kansas City" → "Kansas City Chiefs"
- "San Francisco" → "San Francisco 49ers"

NCAAF Aliases:
- "Sam Houston State" / "Sam Houston St." → "Sam Houston"
- "NEW MEXICO ST." / "New Mexico St." → "New Mexico State"
- "San Jose St." / "SAN JOSE ST." → "San Jose State"
- "Colorado St." / "COLORADO ST." → "Colorado State"
- "Oklahoma St." / "OKLAHOMA ST." → "Oklahoma State"
- "Ball St." / "BALL ST." → "Ball State"
- "UAB" → "Alabama-Birmingham"
- "Kansas St." / "KANSAS ST." → "Kansas State"
- "Iowa St." / "IOWA ST." → "Iowa State"
- "Georgia St." / "GEORGIA ST." → "Georgia State"
- "Northern Ill" / "NORTHERN ILL" → "Northern Illinois"
- "Miami Ohio" / "MIAMI OHIO" → "Miami (OH)"
- "Miami Fla" / "MIAMI FLA" / "Miami FL" → "Miami (FL)"
- "Florida St." / "FLORIDA ST." → "Florida State"
- "UL Monroe" / "ULM" → "Louisiana-Monroe"
- "Western Mich" / "WESTERN MICH" → "Western Michigan"
- "Eastern Mich" / "EASTERN MICH" → "Eastern Michigan"
- "Arkansas St." / "ARKANSAS ST." → "Arkansas State"
- "Penn St." / "PENN ST." → "Penn State"
- "TCU" → "Texas Christian"
- "SMU" → "Southern Methodist"
- "UCF" → "Central Florida"
- "UTSA" → "Texas-San Antonio"
- "Massachusetts" / "UMass" → "Massachusetts"
- "Appalachian St." / "APP STATE" → "Appalachian State"
- "Boise St." / "BOISE ST." → "Boise State"
- "Fresno St." / "FRESNO ST." → "Fresno State"
- "Arizona St." / "ARIZONA ST." → "Arizona State"
- "Oregon St." / "OREGON ST." → "Oregon State"
- "Washington St." / "WASH ST." → "Washington State"
- "Michigan St." / "MICHIGAN ST." → "Michigan State"
- "Ohio St." / "OHIO ST." → "Ohio State"
- "UNLV" → "Nevada-Las Vegas"
- "S. FLORIDA" / "S. Florida" / "South Fla" → "South Florida"
- "FIU" → "Florida International"

PICKSHEET LINE FORMAT:
[points] [AWAY team] [AWAY record] [AWAY spread] [day/time] [HOME team] [HOME record] [HOME spread] [O/U]

PARSING RULES:
1. Points: Parse the leading number before "pt" or "points" → \`points\` (number field)
2. Records: Parse (W-L) or (W-L-T) immediately after team name → \`awayRecord\` / \`homeRecord\` (string)
3. Spreads: Signed number after each team belongs to that team; awaySpread and homeSpread MUST be exact opposites
   - If one is +3.5, the other MUST be -3.5
   - PK or PICK means 0 for both teams
4. Day/Time: Copy day token (Thu, Fri, Sat, Sun, Mon) → \`gameDay\`, time token (5:15 PM) → \`gameTime\`
5. Date: If a full date is present (e.g., "January 5, 2025"), store in \`gameDate\`. If NOT present, OMIT this field (do not invent)
6. Over/Under: If "O/U" or "o/u" followed by number (e.g., "O/U 42.5") → \`overUnder\` (number). Otherwise OMIT
7. Rankings: Ignore "#1", "#24", etc. - do NOT include in team names

CRITICAL SPREAD BINDING RULE (OVERRIDES EVERYTHING):
- The signed number immediately following a team token in the picksheet line belongs to THAT team
- When you canonicalize team names using the SCHEDULE, PRESERVE the spread sign captured with each team
- After mapping to schedule names, verify awaySpread === -(homeSpread); if not, you made an error
- NEVER flip a team's spread sign because of schedule matching - the sign stays with the token it followed

Example: "Minnesota (2-2) -3.5 ... CLEVELAND (1-3) +3.5"
→ Minnesota has -3.5 (stays -3.5 even after canonicalization)
→ Cleveland has +3.5 (stays +3.5 even after canonicalization)
→ Result: awaySpread: -3.5, homeSpread: +3.5 ✓

MATCHING ALGORITHM:
1. Extract both team names AND their spreads from the picksheet line (bind spread to token)
2. Apply ALIASES to normalize each team name (keep spreads bound)
3. Fuzzy match BOTH teams (order-insensitive) to find the unique schedule game
4. Determine which normalized team maps to away_team vs home_team in schedule
5. Assign the spread that was bound to each team in step 1 to the correct away/home field
6. Use EXACT \`away_team\` and \`home_team\` from schedule as final team names
7. Set \`league\` based on schedule: NFL → "NFL", NCAA → "NCAAF"
8. Verify awaySpread === -(homeSpread) as final check

FEW-SHOT EXAMPLES:

Example 1 (NFL):
Picksheet line: "1 pt San Francisco (4-1) +5.5 Thu 5:15 PM LA RAMS (3-2) -5.5"
Schedule match: "San Francisco 49ers @ Los Angeles Rams" (NFL)
Output:
{
  "league": "NFL",
  "awayTeam": "San Francisco 49ers",
  "awayRecord": "(4-1)",
  "awaySpread": 5.5,
  "homeTeam": "Los Angeles Rams",
  "homeRecord": "(3-2)",
  "homeSpread": -5.5,
  "gameDay": "Thu",
  "gameTime": "5:15 PM",
  "points": 1
}

Example 2 (NCAAF):
Picksheet line: "1 pt #7 Penn St. (3-1) -25.5 Sat 12:30 PM UCLA (0-4) +25.5"
Schedule match: "Penn State @ UCLA" (NCAA)
Output:
{
  "league": "NCAAF",
  "awayTeam": "Penn State",
  "awayRecord": "(3-1)",
  "awaySpread": -25.5,
  "homeTeam": "UCLA",
  "homeRecord": "(0-4)",
  "homeSpread": 25.5,
  "gameDay": "Sat",
  "gameTime": "12:30 PM",
  "points": 1
}

Example 3 (NFL - spread binding verification):
Picksheet line: "1 pt Minnesota (2-2) -3.5 Sun 6:30 AM CLEVELAND (1-3) +3.5"
Schedule match: "Minnesota Vikings @ Cleveland Browns" (NFL)
Output:
{
  "league": "NFL",
  "awayTeam": "Minnesota Vikings",
  "awayRecord": "(2-2)",
  "awaySpread": -3.5,
  "homeTeam": "Cleveland Browns",
  "homeRecord": "(1-3)",
  "homeSpread": 3.5,
  "gameDay": "Sun",
  "gameTime": "6:30 AM",
  "points": 1
}

Example 4 (NCAAF - alias canonicalization):
Picksheet line: "1 pt UNLV (5-0) -3.5 Sat 4:00 PM WYOMING (2-2) +3.5"
Schedule match: "Nevada-Las Vegas @ Wyoming" (NCAA)
Output:
{
  "league": "NCAAF",
  "awayTeam": "Nevada-Las Vegas",
  "awayRecord": "(5-0)",
  "awaySpread": -3.5,
  "homeTeam": "Wyoming",
  "homeRecord": "(2-2)",
  "homeSpread": 3.5,
  "gameDay": "Sat",
  "gameTime": "4:00 PM",
  "points": 1
}

OUTPUT SCHEMA (must match exactly):
{
  "title": "optional string",
  "week": "optional string",
  "games": [
    {
      "league": "NFL" or "NCAAF",
      "awayTeam": "exact schedule name",
      "awayRecord": "optional string",
      "awaySpread": number,
      "homeTeam": "exact schedule name",
      "homeRecord": "optional string",
      "homeSpread": number,
      "gameDay": "optional string",
      "gameDate": "optional string",
      "gameTime": "optional string",
      "overUnder": optional number,
      "points": optional number
    }
  ],
  "totalGames": number,
  "nflGames": number,
  "ncaafGames": number
}

POST-PARSE VALIDATION CHECKLIST (verify before returning):
✓ All team names EXACTLY match schedule strings (no abbreviations)
✓ For every game: awaySpread === -(homeSpread) - the spread sign must match the picksheet line
✓ DERIVE counts from the games array (DO NOT GUESS):
  - Set totalGames = games.length
  - Set nflGames = count of games where league === "NFL"
  - Set ncaafGames = count of games where league === "NCAAF"
  - Recompute these counts immediately before returning
✓ Optional fields are OMITTED if not present (do not guess/invent)
✓ League is "NFL" or "NCAAF" (not "NCAA")
✓ JSON is valid and complete
✓ Both awayTeam and homeTeam exist in the SCHEDULE for every game

Return ONLY valid JSON with no extra text or explanations.`

      const userPrompt = `Parse this picksheet and extract all games with their details:\n\n${text}`

      // Log the full request being sent to OpenAI
      console.log('\n' + '='.repeat(80))
      console.log('📤 OPENAI API REQUEST')
      console.log('='.repeat(80))
      console.log('Model:', 'gpt-4o-mini')
      console.log('Temperature:', 0)
      console.log('Max Tokens:', 16000)
      console.log('\n--- SYSTEM MESSAGE ---')
      console.log(systemPrompt)
      console.log('\n--- USER MESSAGE ---')
      console.log(userPrompt)
      console.log('='.repeat(80) + '\n')

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o', // Using GPT-4o for maximum reliability with complex parsing (handles duplicate team names better)
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0, // Zero temperature for most deterministic parsing
        seed: 1, // Seed for deterministic outputs across retries
        max_tokens: 16000, // Much higher limit to avoid truncation
      })

      // Log the full response received from OpenAI
      console.log('\n' + '='.repeat(80))
      console.log('📥 OPENAI API RESPONSE')
      console.log('='.repeat(80))
      console.log('Full Response Object:')
      console.log(JSON.stringify(completion, null, 2))
      console.log('\n--- RESPONSE CONTENT ---')
      console.log(completion.choices[0].message.content)
      console.log('\n--- USAGE STATS ---')
      console.log('Prompt Tokens:', completion.usage?.prompt_tokens)
      console.log('Completion Tokens:', completion.usage?.completion_tokens)
      console.log('Total Tokens:', completion.usage?.total_tokens)
      console.log('='.repeat(80) + '\n')

      const responseContent = completion.choices[0].message.content
      
      if (!responseContent) {
        throw new Error('No response from OpenAI')
      }

      console.log('Raw LLM response length:', responseContent.length)
      
      // Try to parse the JSON response with better error handling
      let parsed: any
      try {
        parsed = JSON.parse(responseContent)
      } catch (jsonError) {
        console.error('JSON parse error:', jsonError)
        console.error('Raw response (first 500 chars):', responseContent.substring(0, 500))
        console.error('Raw response (last 500 chars):', responseContent.substring(responseContent.length - 500))
        
        // Try to fix truncated JSON
        let fixedContent = responseContent
        
        // Check if response seems truncated (doesn't end with })
        if (!fixedContent.trim().endsWith('}')) {
          console.log('Response appears truncated, attempting to fix...')
          
          // Find the last complete game object
          const lastCompleteGameIndex = fixedContent.lastIndexOf('},')
          if (lastCompleteGameIndex > 0) {
            // Truncate to last complete game and close the JSON properly
            fixedContent = fixedContent.substring(0, lastCompleteGameIndex + 1)
            
            // Close the games array and main object
            fixedContent += '],'
            
            // Count how many games we managed to parse
            const gameCount = (fixedContent.match(/"league":/g) || []).length
            const nflCount = (fixedContent.match(/"league"\s*:\s*"NFL"/g) || []).length
            const ncaafCount = (fixedContent.match(/"league"\s*:\s*"NCAAF"/g) || []).length
            
            // Add the summary fields
            fixedContent += `"totalGames":${gameCount},"nflGames":${nflCount},"ncaafGames":${ncaafCount}}`
          }
        }
        
        // Remove any trailing commas before closing brackets/braces
        fixedContent = fixedContent.replace(/,(\s*[}\]])/g, '$1')
        
        // Fix common issues with unterminated strings
        // Count quotes and add a closing quote if odd number
        const quoteCount = (fixedContent.match(/"/g) || []).length
        if (quoteCount % 2 !== 0) {
          // Find the last quote and check if it's likely unterminated
          const lastQuoteIndex = fixedContent.lastIndexOf('"')
          const afterLastQuote = fixedContent.substring(lastQuoteIndex + 1)
          
          // If there's no closing quote before the next JSON structure character
          if (!afterLastQuote.includes('"') && (afterLastQuote.includes(',') || afterLastQuote.includes('}') || afterLastQuote.includes(']'))) {
            // Insert a closing quote before the next structure character
            const structureMatch = afterLastQuote.match(/[,}\]]/);
            if (structureMatch) {
              const insertIndex = lastQuoteIndex + 1 + afterLastQuote.indexOf(structureMatch[0])
              fixedContent = fixedContent.substring(0, insertIndex) + '"' + fixedContent.substring(insertIndex)
            }
          }
        }
        
        // Try parsing the fixed content
        try {
          parsed = JSON.parse(fixedContent)
          console.log('Successfully repaired JSON')
        } catch (secondError) {
          // If still failing, provide more context in the error
          console.error('Failed to repair JSON:', secondError)
          throw new Error(`Failed to parse LLM response as JSON. Response length: ${responseContent.length}. Error: ${jsonError}`)
        }
      }
      
      // Validation: Check for duplicate team names with mismatched data
      const picksheetLines = text.trim().split('\n')
      const teamOccurrences = new Map<string, Array<{line: string, record: string, spread: number}>>()

      // Build a map of team occurrences in the picksheet
      for (const line of picksheetLines) {
        const recordPattern = /\([\d-]+\)/g
        const spreadPattern = /[+-]?\d+\.?\d*/g

        const records: string[] = line.match(recordPattern) || []
        const spreads: string[] = line.match(/[+-]\d+\.?\d*/g) || []

        // Extract team names (simplified - look for capitalized words between record and spread)
        const words = line.split(/\s+/)
        for (let i = 0; i < words.length; i++) {
          const word = words[i]
          // Check if this looks like a team name (starts with capital letter, not a number/record/spread)
          if (/^[A-Z]/.test(word) && !/^\(/.test(word) && !/^[+-]?\d/.test(word)) {
            const teamName = word.replace(/[,.]$/, '') // Remove trailing punctuation

            // Find the associated record and spread
            let recordIdx = 0
            let spreadIdx = 0
            for (let j = 0; j < i; j++) {
              if (records.includes(words[j])) recordIdx++
              if (/^[+-]\d/.test(words[j])) spreadIdx++
            }

            if (records[recordIdx] && spreads[spreadIdx]) {
              if (!teamOccurrences.has(teamName)) {
                teamOccurrences.set(teamName, [])
              }
              teamOccurrences.get(teamName)!.push({
                line: line,
                record: records[recordIdx],
                spread: parseFloat(spreads[spreadIdx])
              })
            }
          }
        }
      }

      // Validate parsed games against picksheet
      const validationErrors: string[] = []
      for (const game of (parsed.games || [])) {
        // Check awaySpread + homeSpread = 0 (must be exact opposites)
        if (game.awaySpread != null && game.homeSpread != null) {
          const sum = Math.abs(game.awaySpread + game.homeSpread)
          if (sum > 0.01) { // Allow tiny floating point errors
            validationErrors.push(
              `SPREAD_MISMATCH: ${game.awayTeam} vs ${game.homeTeam} - ` +
              `awaySpread (${game.awaySpread}) + homeSpread (${game.homeSpread}) != 0`
            )
          }
        }
      }

      if (validationErrors.length > 0) {
        console.warn('\n⚠️  VALIDATION WARNINGS:')
        validationErrors.forEach(err => console.warn(`  - ${err}`))
        console.warn('')
      }

      // Clean up games by replacing null with undefined for optional fields
      const cleanedGames = (parsed.games || []).map((game: any) => ({
        ...game,
        awayRecord: game.awayRecord || undefined,
        homeRecord: game.homeRecord || undefined,
        gameDay: game.gameDay || undefined,
        gameDate: game.gameDate || undefined,
        gameTime: game.gameTime || undefined,
        overUnder: game.overUnder ?? undefined,
        points: game.points ?? undefined,
      }))
      
      // Validate with Zod and provide defaults for missing fields
      const result = PicksheetSchema.parse({
        title: parsed.title || undefined,
        week: parsed.week || undefined,
        games: cleanedGames,
        totalGames: parsed.totalGames || cleanedGames.length || 0,
        nflGames: parsed.nflGames || cleanedGames.filter((g: any) => g.league === 'NFL').length || 0,
        ncaafGames: parsed.ncaafGames || cleanedGames.filter((g: any) => g.league === 'NCAAF').length || 0,
      })

      return result
    } catch (error) {
      console.error('Error parsing with LLM:', error)
      throw error
    }
  }

  /**
   * Convert LLM parsed data to database format
   */
  static toDatabase(parsed: ParsedPicksheet, sourceRunId?: string) {
    return parsed.games.map((game, index) => ({
      id: `llm-${index + 1}`,
      source_run_id: sourceRunId || null,
      league: game.league,
      event_date_local: game.gameDate || null,
      event_time_local: game.gameTime || null,
      home_name_raw: game.homeTeam,
      away_name_raw: game.awayTeam,
      home_spread_raw: game.homeSpread,
      away_spread_raw: game.awaySpread,
      total_raw: game.overUnder || null,
      market: 'spread',
      raw_text: `${game.awayTeam} ${game.awaySpread} @ ${game.homeTeam} ${game.homeSpread}${game.overUnder ? ` O/U ${game.overUnder}` : ''}`,
      metadata: {
        awayRecord: game.awayRecord,
        homeRecord: game.homeRecord,
        gameDay: game.gameDay,
        gameDate: game.gameDate,
        points: game.points,
        overUnder: game.overUnder,
        parsedWithLLM: true
      }
    }))
  }

  /**
   * Simple format for display
   */
  static formatForDisplay(parsed: ParsedPicksheet) {
    return parsed.games.map(game => ({
      league: game.league,
      awayTeam: game.awayTeam,
      awaySpread: game.awaySpread,
      homeTeam: game.homeTeam,
      homeSpread: game.homeSpread,
      overUnder: game.overUnder || null,
      gameTime: `${game.gameDay || ''} ${game.gameDate || ''} ${game.gameTime || ''}`.trim() || null
    }))
  }
}