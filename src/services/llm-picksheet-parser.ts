import OpenAI from 'openai'
import { z } from 'zod'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

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
   */
  static async parseWithLLM(text: string): Promise<ParsedPicksheet> {
    try {
      // Check API key
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured')
      }

      console.log('Starting LLM parse with text length:', text.length)
      
      const systemPrompt = `You are an expert sports betting picksheet parser. Your job is to extract structured data from picksheet text and return it as valid JSON.

IMPORTANT: You must return ONLY valid JSON, no other text or explanation.

You must return a JSON object with this exact structure:
{
  "title": "optional title string",
  "week": "optional week string",
  "games": [
    {
      "league": "NFL" or "NCAAF",
      "awayTeam": "team name",
      "awayRecord": "optional record",
      "awaySpread": number,
      "homeTeam": "team name",
      "homeRecord": "optional record", 
      "homeSpread": number,
      "gameDay": "optional day",
      "gameDate": "optional date",
      "gameTime": "optional time",
      "overUnder": optional number,
      "points": optional number
    }
  ],
  "totalGames": number,
  "nflGames": number,
  "ncaafGames": number
}

CRITICAL PARSING RULES:

1. HOME vs AWAY team identification (VERY IMPORTANT):
   - @ symbol: Team BEFORE @ is AWAY, team AFTER @ is HOME (e.g., "Buffalo @ New England" = Buffalo away, New England home)
   - vs keyword: Team BEFORE vs is HOME, team AFTER vs is AWAY (e.g., "Dallas vs Washington" = Dallas home, Washington away)
   - Capital letters: Team in ALL CAPS is usually HOME (when no @ or vs present)
   - Default: First team is AWAY, second team is HOME (if no other indicators)

2. Spread parsing:
   - Each team has opposite spreads (if one is +3.5, the other is -3.5)
   - The spread belongs to the team it's next to
   - PK or PICK means 0 spread for both teams
   - Parse decimal spreads accurately (e.g., -3.5, +7.5)

3. Over/Under (O/U) parsing:
   - Look for "O/U", "o/u", "Over/Under" followed by a number
   - This is the total points, store in overUnder field
   - Common format: "O/U 42.5" or "O/U: 48"

4. League identification:
   - NFL teams: Professional teams (Cowboys, Chiefs, Packers, Bills, etc.)
   - NFL cities: Dallas, Kansas City, Green Bay, Buffalo, etc.
   - NCAAF indicators: State, University, Tech, A&M, rankings (#1, #11), school names

5. Date and time extraction:
   - Extract full dates like "January 5, 2025" or "Monday, January 6, 2025"
   - Extract days of week (Monday, Tuesday, Sun, Mon, etc.)
   - Extract times (1:00 PM, 5:20 PM, etc.)

6. Records: Extract if shown in parentheses (e.g., "(7-10)", "(10-2)")

7. Point values: Extract if shown (e.g., "1 pt", "2 points")

Remember: Return ONLY valid JSON, no explanations or additional text.`

      const userPrompt = `Parse this picksheet and extract all games with their details:\n\n${text}`

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini', // Using GPT-4o-mini for better accuracy and structured output support
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0, // Zero temperature for most deterministic parsing
        max_tokens: 16000, // Much higher limit to avoid truncation
      })

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