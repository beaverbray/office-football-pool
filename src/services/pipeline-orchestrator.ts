import { LLMPicksheetParser } from './llm-picksheet-parser'
import { getOddsAPI, OddsAPIService } from './odds-api'
import { EntityResolver } from './entity-resolution'
import { comparisonEngine, type ComparisonKPIs, type GameComparison } from './comparison-engine'

export interface PipelineConfig {
  useOddsAPI?: boolean
  useLLM?: boolean
  includeLogs?: boolean
  matchingThreshold?: number
}

export interface PipelineInput {
  picksheetText?: string
  picksheetGames?: Array<{
    homeTeam: string
    awayTeam: string
    spread: number
    gameDate?: string
  }>
  marketGames?: Array<{
    gameId: string
    homeTeam: string
    awayTeam: string
    homeSpread: number
    gameTime: string
    league?: 'NFL' | 'NCAAF'
  }>
}

export interface PipelineResult {
  id: string
  timestamp: string
  status: 'success' | 'partial' | 'failed'
  stage: string
  config: PipelineConfig
  
  // Stage outputs
  parsing?: {
    success: boolean
    gamesFound: number
    games?: any[]
    error?: string
    duration?: number
  }
  
  oddsRetrieval?: {
    success: boolean
    nflGames: number
    ncaafGames: number
    games?: any[]
    error?: string
    duration?: number
  }
  
  matching?: {
    success: boolean
    matchRate: number
    matches: number
    totalGames: number
    error?: string
    duration?: number
  }
  
  comparison?: {
    success: boolean
    kpis?: ComparisonKPIs
    comparisons?: GameComparison[]
    unmatched?: any[]
    error?: string
    duration?: number
  }
  
  logs?: string[]
  totalDuration?: number
}

export class PipelineOrchestrator {
  private logs: string[] = []
  private currentStage: string = 'idle'
  private results: Map<string, PipelineResult> = new Map()

  /**
   * Main pipeline execution method
   */
  async runPipeline(
    input: PipelineInput,
    config: PipelineConfig = {}
  ): Promise<PipelineResult> {
    const pipelineId = this.generatePipelineId()
    const startTime = Date.now()
    
    const result: PipelineResult = {
      id: pipelineId,
      timestamp: new Date().toISOString(),
      status: 'success',
      stage: 'initializing',
      config
    }

    this.log(`Starting pipeline ${pipelineId}`)
    
    try {
      // Stage 1: Parse picksheet (if text provided)
      let picksheetGames = input.picksheetGames
      if (input.picksheetText && !picksheetGames) {
        result.parsing = await this.parsePicksheet(input.picksheetText, config.useLLM)
        if (!result.parsing?.success) {
          result.status = 'failed'
          result.stage = 'parsing'
          throw new Error(result.parsing?.error || 'Parsing failed')
        }
        picksheetGames = result.parsing?.games
      }

      if (!picksheetGames || picksheetGames.length === 0) {
        throw new Error('No picksheet games to process')
      }

      // Stage 2: Retrieve market odds
      let marketGames = input.marketGames
      if (config.useOddsAPI && !marketGames) {
        result.oddsRetrieval = await this.retrieveOdds()
        if (!result.oddsRetrieval?.success) {
          result.status = 'partial'
          result.stage = 'odds_retrieval'
          this.log(`Warning: Odds retrieval failed: ${result.oddsRetrieval?.error || 'Unknown error'}`)
        } else {
          marketGames = result.oddsRetrieval?.games
        }
      }

      if (!marketGames || marketGames.length === 0) {
        throw new Error('No market games available for comparison')
      }

      // Stage 3: Match games
      result.matching = await this.matchGames(
        picksheetGames,
        marketGames,
        config.matchingThreshold
      )
      
      if (result.matching.matchRate === 0) {
        result.status = 'failed'
        result.stage = 'matching'
        throw new Error('No games could be matched')
      } else if (result.matching.matchRate < 0.5) {
        result.status = 'partial'
        this.log(`Warning: Low match rate: ${(result.matching.matchRate * 100).toFixed(1)}%`)
      }

      // Stage 4: Compare spreads and calculate KPIs
      result.comparison = await this.compareGames(
        picksheetGames,
        marketGames,
        result.matching
      )
      
      if (!result.comparison?.success) {
        result.status = 'partial'
        result.stage = 'comparison'
      }

      result.stage = 'completed'
      result.totalDuration = Date.now() - startTime
      
      if (config.includeLogs) {
        result.logs = [...this.logs]
      }

      // Store result for retrieval
      this.results.set(pipelineId, result)
      this.log(`Pipeline ${pipelineId} completed in ${result.totalDuration}ms`)

      return result

    } catch (error) {
      result.status = 'failed'
      result.totalDuration = Date.now() - startTime
      
      if (config.includeLogs) {
        result.logs = [...this.logs]
      }
      
      this.log(`Pipeline ${pipelineId} failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      this.results.set(pipelineId, result)
      
      throw error
    } finally {
      this.clearLogs()
      ;(this as any)._lastMatches = null // Clear stored matches
    }
  }

  /**
   * Stage 1: Parse picksheet text
   */
  private async parsePicksheet(
    text: string,
    useLLM: boolean = true
  ): Promise<PipelineResult['parsing']> {
    const startTime = Date.now()
    this.currentStage = 'parsing'
    this.log('Starting picksheet parsing')

    try {
      const parsed = await LLMPicksheetParser.parseWithLLM(text)

      if (!parsed || !parsed.games) {
        return {
          success: false,
          gamesFound: 0,
          error: 'Failed to parse picksheet',
          duration: Date.now() - startTime
        }
      }

      this.log(`Parsed ${parsed.games.length} games from picksheet`)

      // Convert to our format
      const games = parsed.games.map(game => ({
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        spread: game.homeSpread, // Use home spread
        gameDate: game.gameDate || undefined
      }))

      return {
        success: true,
        gamesFound: games.length,
        games,
        duration: Date.now() - startTime
      }
    } catch (error) {
      return {
        success: false,
        gamesFound: 0,
        error: error instanceof Error ? error.message : 'Unknown parsing error',
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * Stage 2: Retrieve odds from API
   */
  private async retrieveOdds(): Promise<PipelineResult['oddsRetrieval']> {
    const startTime = Date.now()
    this.currentStage = 'odds_retrieval'
    this.log('Retrieving odds from API')

    try {
      const oddsAPI = getOddsAPI()
      const { nfl, ncaaf } = await oddsAPI.getAllSpreads()

      // Convert to our format, preserving league information
      const nflGames = nfl.map(game => {
        const spread = OddsAPIService.getBestSpread(game)
        return {
          gameId: game.id,
          homeTeam: spread.homeTeam,
          awayTeam: spread.awayTeam,
          homeSpread: spread.homeSpread || 0,
          gameTime: game.commence_time,
          league: 'NFL' as const
        }
      })
      
      const ncaafGames = ncaaf.map(game => {
        const spread = OddsAPIService.getBestSpread(game)
        return {
          gameId: game.id,
          homeTeam: spread.homeTeam,
          awayTeam: spread.awayTeam,
          homeSpread: spread.homeSpread || 0,
          gameTime: game.commence_time,
          league: 'NCAAF' as const
        }
      })
      
      const games = [...nflGames, ...ncaafGames]

      this.log(`Retrieved ${nfl.length} NFL and ${ncaaf.length} NCAAF games`)

      return {
        success: true,
        nflGames: nfl.length,
        ncaafGames: ncaaf.length,
        games,
        duration: Date.now() - startTime
      }
    } catch (error) {
      return {
        success: false,
        nflGames: 0,
        ncaafGames: 0,
        error: error instanceof Error ? error.message : 'Unknown API error',
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * Stage 3: Match games between sources
   */
  private async matchGames(
    picksheetGames: any[],
    marketGames: any[],
    threshold: number = 0.6
  ): Promise<PipelineResult['matching'] & { matches?: any[] }> {
    const startTime = Date.now()
    this.currentStage = 'matching'
    this.log('Matching games between picksheet and market')

    try {
      const resolver = new EntityResolver()
      const matches: Array<{
        picksheetIndex: number
        marketIndex: number
        confidence: number
      }> = []

      for (let pIdx = 0; pIdx < picksheetGames.length; pIdx++) {
        const picksheetGame = picksheetGames[pIdx]
        let bestMatch = {
          marketIndex: -1,
          confidence: 0
        }

        for (let mIdx = 0; mIdx < marketGames.length; mIdx++) {
          const marketGame = marketGames[mIdx]
          
          // Match teams
          const homeMatch = await resolver.matchTeam(picksheetGame.homeTeam)
          const marketHomeMatch = await resolver.matchTeam(marketGame.homeTeam)
          const awayMatch = await resolver.matchTeam(picksheetGame.awayTeam)
          const marketAwayMatch = await resolver.matchTeam(marketGame.awayTeam)
          
          // Check if teams match (normal or swapped)
          const normalMatch = 
            homeMatch.matchedName === marketHomeMatch.matchedName &&
            awayMatch.matchedName === marketAwayMatch.matchedName
          
          const swappedMatch = 
            homeMatch.matchedName === marketAwayMatch.matchedName &&
            awayMatch.matchedName === marketHomeMatch.matchedName
          
          if (normalMatch || swappedMatch) {
            const confidence = Math.min(
              homeMatch.confidence,
              awayMatch.confidence,
              marketHomeMatch.confidence,
              marketAwayMatch.confidence
            )
            
            if (confidence >= threshold && confidence > bestMatch.confidence) {
              bestMatch = {
                marketIndex: mIdx,
                confidence
              }
            }
          }
        }

        if (bestMatch.marketIndex !== -1) {
          matches.push({
            picksheetIndex: pIdx,
            marketIndex: bestMatch.marketIndex,
            confidence: bestMatch.confidence
          })
        }
      }

      const matchRate = matches.length / picksheetGames.length
      this.log(`Matched ${matches.length} of ${picksheetGames.length} games (${(matchRate * 100).toFixed(1)}%)`)

      // Store matches internally but don't include in result
      ;(this as any)._lastMatches = matches
      
      return {
        success: true,
        matchRate,
        matches: matches.length as any,
        totalGames: picksheetGames.length,
        duration: Date.now() - startTime
      }
    } catch (error) {
      return {
        success: false,
        matchRate: 0,
        matches: 0 as any,
        totalGames: picksheetGames.length,
        error: error instanceof Error ? error.message : 'Unknown matching error',
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * Stage 4: Compare games and calculate KPIs
   */
  private async compareGames(
    picksheetGames: any[],
    marketGames: any[],
    matchingResult: any
  ): Promise<PipelineResult['comparison']> {
    const startTime = Date.now()
    this.currentStage = 'comparison'
    this.log('Comparing games and calculating KPIs')

    try {
      const result = comparisonEngine.compareGames(
        picksheetGames,
        marketGames,
        (this as any)._lastMatches || []
      )

      this.log(`Calculated KPIs: Avg delta ${result.kpis.avgSpreadDelta}, Key crossings ${result.kpis.keyNumberCrossings}`)

      return {
        success: true,
        kpis: result.kpis,
        comparisons: result.comparisons,
        unmatched: result.unmatched,
        duration: Date.now() - startTime
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown comparison error',
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * Get pipeline result by ID
   */
  getPipelineResult(id: string): PipelineResult | undefined {
    return this.results.get(id)
  }

  /**
   * Get all pipeline results
   */
  getAllResults(): PipelineResult[] {
    return Array.from(this.results.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }

  /**
   * Clear stored results
   */
  clearResults(): void {
    this.results.clear()
    this.log('Cleared all pipeline results')
  }

  /**
   * Get current pipeline stage
   */
  getCurrentStage(): string {
    return this.currentStage
  }

  /**
   * Internal logging
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] [${this.currentStage}] ${message}`
    this.logs.push(logEntry)
    console.log(logEntry)
  }

  /**
   * Clear logs
   */
  private clearLogs(): void {
    this.logs = []
  }

  /**
   * Generate unique pipeline ID
   */
  private generatePipelineId(): string {
    return `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

// Export singleton instance
export const pipelineOrchestrator = new PipelineOrchestrator()