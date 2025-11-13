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
   * Parse picksheet text using parallel OpenAI requests for faster processing
   * @param text - The picksheet text to parse
   * @param scheduleGames - Optional schedule games for the week to use as matching context
   * @param batchSize - Number of games per batch (default: 20)
   */
  static async parseWithLLMParallel(text: string, scheduleGames?: any[], batchSize: number = 20): Promise<ParsedPicksheet> {
    try {
      const parseStartTime = Date.now()
      console.log('\n⚡ [LLM-PARSER] Starting PARALLEL LLM parse')
      console.log(`   • Text length: ${text.length} chars`)
      console.log(`   • Batch size: ${batchSize} games per batch`)

      // Split picksheet into game lines (skip empty lines)
      const lines = text.trim().split('\n').filter(line => line.trim())
      console.log(`   • Total lines: ${lines.length}`)

      // Calculate number of batches
      const numBatches = Math.ceil(lines.length / batchSize)
      console.log(`   • Creating ${numBatches} parallel batches`)

      // Create batches
      const batches: string[] = []
      for (let i = 0; i < numBatches; i++) {
        const start = i * batchSize
        const end = Math.min(start + batchSize, lines.length)
        const batchLines = lines.slice(start, end)
        batches.push(batchLines.join('\n'))
      }

      // Send all batches in parallel
      console.log(`   • Sending ${numBatches} concurrent requests to OpenAI...`)
      const batchStartTime = Date.now()

      const batchPromises = batches.map((batchText, index) =>
        this.parseWithLLM(batchText, scheduleGames)
          .then(result => {
            console.log(`   ✅ Batch ${index + 1}/${numBatches} completed: ${result.totalGames} games`)
            return result
          })
          .catch(error => {
            console.error(`   ❌ Batch ${index + 1}/${numBatches} failed:`, error.message)
            throw error
          })
      )

      const batchResults = await Promise.all(batchPromises)
      const batchDuration = Date.now() - batchStartTime

      console.log(`✅ [LLM-PARSER] All ${numBatches} batches completed in ${batchDuration}ms`)

      // Merge all results
      const allGames: ParsedGame[] = []
      for (const result of batchResults) {
        allGames.push(...result.games)
      }

      // Calculate totals
      const nflGames = allGames.filter(g => g.league === 'NFL').length
      const ncaafGames = allGames.filter(g => g.league === 'NCAAF').length

      const mergedResult: ParsedPicksheet = {
        title: batchResults[0]?.title,
        week: batchResults[0]?.week,
        games: allGames,
        totalGames: allGames.length,
        nflGames,
        ncaafGames
      }

      const totalDuration = Date.now() - parseStartTime
      console.log(`✅ [LLM-PARSER] PARALLEL parsing completed in ${totalDuration}ms`)
      console.log(`   • Total games parsed: ${mergedResult.totalGames} (NFL: ${nflGames}, NCAAF: ${ncaafGames})`)
      console.log(`   • Batches: ${numBatches} x ~${batchSize} games`)
      console.log(`   • Parallel execution: ${batchDuration}ms`)
      console.log(`   • Speedup: ${numBatches > 1 ? `~${numBatches}x faster` : 'N/A'}`)

      return mergedResult
    } catch (error) {
      console.error('❌ [LLM-PARSER] Parallel parsing failed:', error)
      throw error
    }
  }

  /**
   * Parse picksheet text using OpenAI with structured output
   * @param text - The picksheet text to parse
   * @param scheduleGames - Optional schedule games for the week to use as matching context
   */
  static async parseWithLLM(text: string, scheduleGames?: any[]): Promise<ParsedPicksheet> {
    const parseStartTime = Date.now()

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

      console.log('\n⏱️  [LLM-PARSER] Starting LLM parse')
      console.log(`   • Text length: ${text.length} chars`)
      console.log(`   • Schedule games: ${scheduleGames?.length || 0}`)
      if (scheduleGames && scheduleGames.length > 0) {
        console.log(`   • Using schedule context for enhanced matching`)
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

      const systemPrompt = `You are an expert sports betting picksheet parser. Extract structured data and return ONLY valid JSON.

${scheduleContext}

SCHEDULE MATCHING (PRIMARY RULE):
- Use the SCHEDULE REFERENCE as your canonical source for team names
- Match using BOTH team names (order-insensitive) to find the unique game
- Use EXACT team names from schedule (away_team/home_team fields)
- League is determined from the matched schedule game
- For duplicate names (e.g., "Minnesota" in NFL + NCAAF), the opponent identifies which game

COMMON ALIASES (expand abbreviations):
NFL: LA→Los Angeles, NY→New York, Tampa→Buccaneers, Washington→Commanders, New England→Patriots, Green Bay→Packers, Kansas City→Chiefs, San Francisco→49ers
NCAAF: St.→State, TCU→Texas Christian, SMU→Southern Methodist, UCF→Central Florida, UTSA→Texas-San Antonio, UAB→Alabama-Birmingham, UMass→Massachusetts, UNLV→Nevada-Las Vegas, FIU→Florida International, Miami FL→Miami (FL), Miami OH→Miami (OH)

PARSING RULES:
1. Points: Leading number before "pt" → points field
2. Records: (W-L) or (W-L-T) after team name → awayRecord/homeRecord
3. Spreads: MUST be exact opposites (e.g., +3.5/-3.5). PK=0 for both. Spread sign STAYS with the team it follows in picksheet.
4. Day/Time: Thu/Fri/Sat/Sun/Mon → gameDay, time → gameTime
5. Date: Full date if present → gameDate (omit if not present)
6. Over/Under: Number after "O/U" → overUnder (omit if not present)
7. Ignore rankings (#1, #24, etc.) in team names

WORKFLOW:
1. Extract team names + spreads from picksheet line (bind spread to team)
2. Normalize using aliases
3. Match BOTH teams to schedule game
4. Map to schedule's away_team/home_team with original spread signs
5. Validate: awaySpread = -(homeSpread)

OUTPUT SCHEMA:
{"title": str?, "week": str?, "games": [{"league": "NFL"|"NCAAF", "awayTeam": str, "awayRecord": str?, "awaySpread": num, "homeTeam": str, "homeRecord": str?, "homeSpread": num, "gameDay": str?, "gameDate": str?, "gameTime": str?, "overUnder": num?, "points": num?}], "totalGames": num, "nflGames": num, "ncaafGames": num}

VALIDATION:
- awaySpread + homeSpread = 0
- All team names match schedule exactly
- totalGames = games.length, nflGames/ncaafGames computed from games array
- League is "NFL" or "NCAAF"

Return ONLY valid JSON.`

      const userPrompt = `Parse this picksheet and extract all games with their details:\n\n${text}`

      // Calculate prompt token estimate
      const systemPromptTokens = Math.ceil(systemPrompt.length / 4)
      const userPromptTokens = Math.ceil(userPrompt.length / 4)
      const estimatedInputTokens = systemPromptTokens + userPromptTokens

      console.log(`   • Estimated input tokens: ~${estimatedInputTokens} (system: ~${systemPromptTokens}, user: ~${userPromptTokens})`)
      console.log('   • Sending request to OpenAI...')

      const apiStartTime = Date.now()
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini', // Using GPT-4o-mini - reliable for structured data extraction
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3, // Lower temperature for more consistent parsing
        seed: 1, // Seed for deterministic outputs across retries
        max_completion_tokens: 16000 // Higher limit to avoid truncation
      })
      const apiDuration = Date.now() - apiStartTime

      console.log(`✅ [LLM-PARSER] OpenAI API call completed in ${apiDuration}ms`)
      console.log(`   • Prompt tokens: ${completion.usage?.prompt_tokens}`)
      console.log(`   • Completion tokens: ${completion.usage?.completion_tokens}`)
      console.log(`   • Total tokens: ${completion.usage?.total_tokens}`)

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

      const totalDuration = Date.now() - parseStartTime
      console.log(`✅ [LLM-PARSER] Parsing completed successfully in ${totalDuration}ms`)
      console.log(`   • Games parsed: ${result.totalGames} (NFL: ${result.nflGames}, NCAAF: ${result.ncaafGames})`)
      console.log(`   • API call: ${apiDuration}ms (${((apiDuration/totalDuration)*100).toFixed(1)}% of total)`)
      console.log(`   • Processing: ${totalDuration - apiDuration}ms`)

      return result
    } catch (error) {
      const totalDuration = Date.now() - parseStartTime
      console.error(`❌ [LLM-PARSER] Parsing failed after ${totalDuration}ms:`, error)
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