import { LLMPicksheetParser } from './llm-picksheet-parser'
import { getOddsAPI, OddsAPIService } from './odds-api'
import { EntityResolver } from './entity-resolution'
import { comparisonEngine, type ComparisonKPIs, type GameComparison } from './comparison-engine'
import { WarrenNolanScraper } from './warren-nolan-scraper'
import { ScheduleService } from './schedule-service'
import { GameMatchingService } from './game-matching-service'

export interface PipelineConfig {
  useOddsAPI?: boolean
  useLLM?: boolean
  useWarrenNolan?: boolean
  warrenNolanDate?: string
  week?: number // Week number for schedule matching
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
  private entityCache: Map<string, any> = new Map() // Cache team resolutions

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
      // Stage 0.5: Load schedule first for use in parsing
      let scheduleGames: any[] = []
      const weekToLoad = config.week // Use provided week, or could auto-detect
      if (weekToLoad) {
        const scheduleResult = await this.loadSchedule(weekToLoad)
        if (scheduleResult.success && scheduleResult.games) {
          scheduleGames = scheduleResult.games
          this.log(`Pre-loaded ${scheduleGames.length} schedule games for week ${weekToLoad} (parsing context)`)
        } else {
          this.log('Warning: Failed to pre-load schedule for parsing context')
        }
      } else {
        this.log('No week specified, will try to load schedule after parsing')
      }

      // Stage 1: Parse picksheet (if text provided) or scrape Warren Nolan
      let picksheetGames = input.picksheetGames

      if (config.useWarrenNolan && !picksheetGames) {
        result.parsing = await this.scrapeWarrenNolan(config.warrenNolanDate)
        if (!result.parsing?.success) {
          result.status = 'failed'
          result.stage = 'parsing'
          throw new Error(result.parsing?.error || 'Warren Nolan scraping failed')
        }
        picksheetGames = result.parsing?.games
      } else if (input.picksheetText && !picksheetGames) {
        result.parsing = await this.parsePicksheet(input.picksheetText, config.useLLM, scheduleGames)
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

      // Stage 2 & 2.5: Retrieve market odds and load schedule in parallel
      let marketGames = input.marketGames
      const needsOdds = config.useOddsAPI && !marketGames
      const needsSchedule = scheduleGames.length === 0 && config.week

      if (needsOdds || needsSchedule) {
        const parallelStart = Date.now()
        this.log('Running odds retrieval and schedule loading in parallel...')
        const [oddsResult, scheduleResult] = await Promise.all([
          needsOdds ? this.retrieveOdds() : Promise.resolve(null),
          needsSchedule ? this.loadSchedule(config.week) : Promise.resolve(null)
        ])
        const parallelTime = Date.now() - parallelStart
        this.log(`Parallel stage execution completed in ${parallelTime}ms`)

        // Process odds result
        if (oddsResult) {
          result.oddsRetrieval = oddsResult
          if (!oddsResult.success) {
            result.status = 'partial'
            result.stage = 'odds_retrieval'
            this.log(`Warning: Odds retrieval failed: ${oddsResult.error || 'Unknown error'}`)
          } else {
            marketGames = oddsResult.games
          }
        }

        // Process schedule result
        if (scheduleResult) {
          if (scheduleResult.success && scheduleResult.games) {
            scheduleGames = scheduleResult.games
            this.log(`Loaded ${scheduleGames.length} schedule games for matching`)
          } else {
            this.log('Warning: Failed to load schedule, falling back to direct matching')
          }
        }
      }

      if (!marketGames || marketGames.length === 0) {
        throw new Error('No market games available for comparison')
      }

      // Stage 3: Match games
      result.matching = await this.matchGames(
        picksheetGames,
        marketGames,
        scheduleGames,
        config.matchingThreshold
      )

      if (!result.matching) {
        result.status = 'failed'
        result.stage = 'matching'
        throw new Error('Matching failed')
      }

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
      this.clearEntityCache() // Clear cache to free memory
      ;(this as any)._lastMatches = null // Clear stored matches (legacy)
      ;(this as any)._scheduleMatches = null // Clear schedule matches
    }
  }

  /**
   * Get cached entity resolution or resolve and cache
   */
  private async getCachedEntity(
    resolver: EntityResolver,
    teamName: string,
    league?: 'NFL' | 'NCAAF'
  ): Promise<any> {
    const cacheKey = `${teamName}|${league || 'any'}`

    if (this.entityCache.has(cacheKey)) {
      return this.entityCache.get(cacheKey)
    }

    const result = await resolver.matchTeam(teamName, league)
    this.entityCache.set(cacheKey, result)
    return result
  }

  /**
   * Stage 1a: Scrape Warren Nolan predictions
   */
  private async scrapeWarrenNolan(
    date?: string
  ): Promise<PipelineResult['parsing']> {
    const startTime = Date.now()
    this.currentStage = 'scraping'
    this.log('Starting Warren Nolan scraping')

    try {
      const result = date
        ? await WarrenNolanScraper.scrapePredictions(date)
        : await WarrenNolanScraper.scrapeTodaysPredictions()

      if (!result.success || !result.predictions) {
        return {
          success: false,
          gamesFound: 0,
          error: result.error || 'Failed to scrape Warren Nolan',
          duration: Date.now() - startTime
        }
      }

      this.log(`Scraped ${result.predictions.length} predictions from Warren Nolan`)

      // Convert to pipeline format
      const games = WarrenNolanScraper.convertToPipelineFormat(result.predictions)

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
        error: error instanceof Error ? error.message : 'Unknown scraping error',
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * Stage 1b: Parse picksheet text
   */
  private async parsePicksheet(
    text: string,
    useLLM: boolean = true,
    scheduleGames?: any[]
  ): Promise<PipelineResult['parsing']> {
    const startTime = Date.now()
    this.currentStage = 'parsing'
    this.log('Starting picksheet parsing')

    try {
      const parsed = await LLMPicksheetParser.parseWithLLM(text, scheduleGames)

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
        spread: game.homeSpread, // Use home spread - consistent with market data
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
   * Load schedule games for the current week
   */
  private async loadSchedule(week?: number): Promise<any> {
    const startTime = Date.now()
    this.currentStage = 'schedule_loading'
    this.log('Loading schedule games...')

    try {
      const scheduleGames = week
        ? await ScheduleService.getGamesByWeek(week)
        : await ScheduleService.getCurrentWeekGames()

      this.log(`Loaded ${scheduleGames.length} games from schedule`)

      return {
        success: true,
        gamesFound: scheduleGames.length,
        games: scheduleGames,
        duration: Date.now() - startTime
      }
    } catch (error) {
      return {
        success: false,
        gamesFound: 0,
        error: error instanceof Error ? error.message : 'Unknown schedule loading error',
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * Stage 3: Match games using schedule as source of truth
   */
  private async matchGames(
    picksheetGames: any[],
    marketGames: any[],
    scheduleGames: any[],
    threshold: number = 0.4
  ): Promise<PipelineResult['matching']> {
    const startTime = Date.now()
    this.currentStage = 'matching'
    this.log('Matching games against schedule...')

    try {
      if (!scheduleGames || scheduleGames.length === 0) {
        this.log('No schedule games, falling back to legacy entity resolution matching')
        return await this.matchGamesLegacy(picksheetGames, marketGames, threshold)
      }

      this.log(`Schedule has ${scheduleGames.length} games`)
      this.log(`Picksheet has ${picksheetGames.length} games`)
      this.log(`Market has ${marketGames.length} games`)

      // Debug: Log first few schedule games
      if (scheduleGames.length > 0) {
        this.log('Sample schedule games:')
        scheduleGames.slice(0, 3).forEach((g: any) => {
          this.log(`  ${g.away_team} @ ${g.home_team} (Week ${g.week}, League: ${g.league})`)
        })
      }

      // Debug: Log first few picksheet games
      if (picksheetGames.length > 0) {
        this.log('Sample picksheet games:')
        picksheetGames.slice(0, 3).forEach((g: any) => {
          this.log(`  ${g.awayTeam} @ ${g.homeTeam}`)
        })
      }

      // Match picksheet games to schedule
      const picksheetMatches = GameMatchingService.matchPicksheetToSchedule(
        picksheetGames,
        scheduleGames
      )

      this.log(`Picksheet matches: ${picksheetMatches.size} games matched to schedule`)

      // Match market games to schedule
      const marketMatches = GameMatchingService.matchMarketToSchedule(
        marketGames,
        scheduleGames
      )

      this.log(`Market matches: ${marketMatches.size} games matched to schedule`)

      // Build matched games array
      const matches: any[] = []
      let matchedCount = 0

      scheduleGames.forEach((scheduleGame: any) => {
        const picksheetMatch = picksheetMatches.get(scheduleGame.match_number)
        const marketMatch = marketMatches.get(scheduleGame.match_number)

        if (picksheetMatch && marketMatch) {
          matches.push({
            scheduleGame,
            picksheetGame: picksheetMatch.game,
            marketGame: marketMatch.game,
            confidence: Math.min(picksheetMatch.confidence, marketMatch.confidence)
          })
          matchedCount++
        }
      })

      // Store matches for comparison stage
      ;(this as any)._scheduleMatches = matches

      const matchRate = matchedCount / picksheetGames.length
      this.log(`Matched ${matchedCount} of ${picksheetGames.length} games (${(matchRate * 100).toFixed(1)}%)`)

      return {
        success: true,
        matchRate,
        matches: matchedCount as any,
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
   * Legacy matching: Direct entity resolution between picksheet and market
   * Fallback when schedule is not available
   */
  private async matchGamesLegacy(
    picksheetGames: any[],
    marketGames: any[],
    threshold: number = 0.4
  ): Promise<PipelineResult['matching']> {
    const startTime = Date.now()
    this.log('Using legacy entity resolution matching')

    try {
      const resolver = new EntityResolver()

      // Collect all unique teams to resolve in one batch
      const teamsToResolve = new Set<string>()
      picksheetGames.forEach(game => {
        teamsToResolve.add(`${game.homeTeam}|any`)
        teamsToResolve.add(`${game.awayTeam}|any`)
      })
      marketGames.forEach(game => {
        teamsToResolve.add(`${game.homeTeam}|${game.league || 'any'}`)
        teamsToResolve.add(`${game.awayTeam}|${game.league || 'any'}`)
      })

      // Resolve all teams in parallel batch
      const resolutionStart = Date.now()
      this.log(`Pre-resolving ${teamsToResolve.size} unique teams in parallel...`)
      await Promise.all(
        Array.from(teamsToResolve).map(async (key) => {
          const [teamName, league] = key.split('|')
          const leagueParam = league === 'any' ? undefined : (league as 'NFL' | 'NCAAF')
          await this.getCachedEntity(resolver, teamName, leagueParam)
        })
      )
      const resolutionTime = Date.now() - resolutionStart
      this.log(`Team resolution completed in ${resolutionTime}ms (avg ${(resolutionTime / teamsToResolve.size).toFixed(1)}ms per team)`)

      // Now resolve games using cache (instant lookups)
      this.log('Resolving picksheet games from cache...')
      const picksheetResolved = await Promise.all(
        picksheetGames.map(async (game, idx) => {
          const homeMatch = await this.getCachedEntity(resolver, game.homeTeam)
          const awayMatch = await this.getCachedEntity(resolver, game.awayTeam)

          // Handle league mismatches
          if (homeMatch.league !== awayMatch.league) {
            const inferredLeague = (homeMatch.league === 'NFL' || awayMatch.league === 'NFL') ? 'NFL' : 'NCAAF'
            const homeMatchFixed = await this.getCachedEntity(resolver, game.homeTeam, inferredLeague)
            const awayMatchFixed = await this.getCachedEntity(resolver, game.awayTeam, inferredLeague)

            return {
              index: idx,
              homeMatch: homeMatchFixed,
              awayMatch: awayMatchFixed,
              original: game
            }
          }

          return {
            index: idx,
            homeMatch,
            awayMatch,
            original: game
          }
        })
      )

      this.log('Resolving market games from cache...')
      const marketResolved = await Promise.all(
        marketGames.map(async (game, idx) => ({
          index: idx,
          homeMatch: await this.getCachedEntity(resolver, game.homeTeam, game.league),
          awayMatch: await this.getCachedEntity(resolver, game.awayTeam, game.league),
          original: game,
          league: game.league
        }))
      )

      const matches: Array<{
        picksheetIndex: number
        marketIndex: number
        confidence: number
        isSwapped?: boolean
      }> = []

      const usedMarketIndices = new Set<number>()

      for (const pGame of picksheetResolved) {
        let bestMatch = {
          marketIndex: -1,
          confidence: 0,
          isSwapped: false
        }

        for (const mGame of marketResolved) {
          if (usedMarketIndices.has(mGame.index)) {
            continue
          }

          const normalMatch =
            pGame.homeMatch.matchedName === mGame.homeMatch.matchedName &&
            pGame.awayMatch.matchedName === mGame.awayMatch.matchedName

          const swappedMatch =
            pGame.homeMatch.matchedName === mGame.awayMatch.matchedName &&
            pGame.awayMatch.matchedName === mGame.homeMatch.matchedName

          if (normalMatch || swappedMatch) {
            const confidence = Math.min(
              pGame.homeMatch.confidence,
              pGame.awayMatch.confidence,
              mGame.homeMatch.confidence,
              mGame.awayMatch.confidence
            )

            if (confidence >= threshold && confidence > bestMatch.confidence) {
              bestMatch = {
                marketIndex: mGame.index,
                confidence,
                isSwapped: swappedMatch
              }
            }
          }
        }

        if (bestMatch.marketIndex !== -1) {
          matches.push({
            picksheetIndex: pGame.index,
            marketIndex: bestMatch.marketIndex,
            confidence: bestMatch.confidence,
            isSwapped: bestMatch.isSwapped
          })
          usedMarketIndices.add(bestMatch.marketIndex)
        }
      }

      const matchRate = matches.length / picksheetGames.length
      this.log(`Legacy matching: ${matches.length} of ${picksheetGames.length} games (${(matchRate * 100).toFixed(1)}%)`)

      // Store matches for comparison stage
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
    _matchingResult: any
  ): Promise<PipelineResult['comparison']> {
    const startTime = Date.now()
    this.currentStage = 'comparison'
    this.log('Comparing games and calculating KPIs')

    try {
      // Use the schedule-based matches
      const scheduleMatches = (this as any)._scheduleMatches || []

      if (scheduleMatches.length === 0) {
        // Fallback to old logic if no schedule matches
        const matches = (this as any)._lastMatches || []

        if (matches.length === 0) {
          return {
            success: false,
            error: 'No matches available for comparison',
            duration: Date.now() - startTime
          }
        }

        // Use legacy comparison logic
        const adjustedMarketGames = marketGames.map((game, idx) => {
          const match = matches.find((m: any) => m.marketIndex === idx)
          if (match?.isSwapped) {
            return {
              ...game,
              homeSpread: -game.homeSpread,
              homeTeam: game.awayTeam,
              awayTeam: game.homeTeam
            }
          }
          return game
        })

        const result = comparisonEngine.compareGames(
          picksheetGames,
          adjustedMarketGames,
          matches
        )

        this.log(`Calculated KPIs: Avg delta ${result.kpis.avgSpreadDelta}, Key crossings ${result.kpis.keyNumberCrossings}`)

        return {
          success: true,
          kpis: result.kpis,
          comparisons: result.comparisons,
          unmatched: result.unmatched,
          duration: Date.now() - startTime
        }
      }

      // Build comparison using schedule as reference
      const comparisons: any[] = scheduleMatches.map((match: any) => {
        const picksheetSpread = match.picksheetGame.spread
        const marketSpread = match.marketGame.homeSpread
        const spreadDelta = picksheetSpread - marketSpread

        // Calculate key number crossings
        const keyNumbers = [3, 7, 10, 14]
        const keyNumbersCrossed: number[] = []
        for (const keyNum of keyNumbers) {
          if ((picksheetSpread > keyNum && marketSpread < keyNum) ||
              (picksheetSpread < keyNum && marketSpread > keyNum)) {
            keyNumbersCrossed.push(keyNum)
          }
          if ((picksheetSpread > -keyNum && marketSpread < -keyNum) ||
              (picksheetSpread < -keyNum && marketSpread > -keyNum)) {
            keyNumbersCrossed.push(-keyNum)
          }
        }

        // Check if favorite flipped
        const favoriteFlipped = (picksheetSpread > 0 && marketSpread < 0) ||
                               (picksheetSpread < 0 && marketSpread > 0)

        return {
          gameId: `${match.scheduleGame.away_team}-${match.scheduleGame.home_team}-${match.scheduleGame.week}`,
          homeTeam: match.scheduleGame.home_team,
          awayTeam: match.scheduleGame.away_team,
          gameTime: match.marketGame.gameTime || match.scheduleGame.date, // Use accurate time from market data (Odds API)
          league: match.scheduleGame.league,
          picksheetSpread,
          marketSpread,
          spreadDelta,
          crossesKeyNumber: keyNumbersCrossed.length > 0,
          keyNumbersCrossed,
          favoriteFlipped,
          confidence: match.confidence || 1.0
        }
      })

      // Calculate KPIs
      const deltas = comparisons.map(c => Math.abs(c.spreadDelta))
      const sortedDeltas = [...deltas].sort((a, b) => a - b)
      const medianDelta = sortedDeltas[Math.floor(sortedDeltas.length / 2)] || 0
      const p95Delta = sortedDeltas[Math.floor(sortedDeltas.length * 0.95)] || 0
      const avgDelta = deltas.reduce((sum, d) => sum + d, 0) / deltas.length
      const variance = deltas.reduce((sum, d) => sum + Math.pow(d - avgDelta, 2), 0) / deltas.length
      const stdDev = Math.sqrt(variance)

      const keyNumberCrossings = comparisons.filter(c => c.crossesKeyNumber).length

      // Calculate favorite flips (when the spread changes the favorite)
      const favoriteFlips = comparisons.filter(c => c.favoriteFlipped).length

      // Find largest delta
      const largestComp = comparisons.reduce((max, c) =>
        Math.abs(c.spreadDelta) > Math.abs(max.spreadDelta) ? c : max,
        comparisons[0] || { spreadDelta: 0, homeTeam: '', awayTeam: '' }
      )

      const kpis: ComparisonKPIs = {
        totalGames: picksheetGames.length,
        matchedGames: comparisons.length,
        unmatchedGames: picksheetGames.length - comparisons.length,
        matchRate: comparisons.length / picksheetGames.length,
        avgSpreadDelta: avgDelta,
        medianSpreadDelta: medianDelta,
        p95SpreadDelta: p95Delta,
        stdDevSpreadDelta: stdDev,
        keyNumberCrossings: keyNumberCrossings,
        keyNumberCrossingRate: keyNumberCrossings / comparisons.length,
        favoriteFlips: favoriteFlips,
        favoriteFlipRate: favoriteFlips / comparisons.length,
        largestDelta: comparisons.length > 0 ? {
          gameId: `${largestComp.homeTeam}-${largestComp.awayTeam}`,
          teams: `${largestComp.awayTeam} @ ${largestComp.homeTeam}`,
          delta: Math.abs(largestComp.spreadDelta)
        } : null,
        timestamp: new Date().toISOString()
      }

      this.log(`Calculated KPIs: Avg delta ${kpis.avgSpreadDelta}, Key crossings ${kpis.keyNumberCrossings}`)

      return {
        success: true,
        kpis,
        comparisons,
        unmatched: [],
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
   * Clear entity resolution cache
   */
  private clearEntityCache(): void {
    const cacheSize = this.entityCache.size
    this.entityCache.clear()
    if (cacheSize > 0) {
      this.log(`Cleared entity cache (${cacheSize} entries)`)
    }
  }

  /**
   * Generate unique pipeline ID
   */
  private generatePipelineId(): string {
    return `pipeline_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }
}

// Export singleton instance
export const pipelineOrchestrator = new PipelineOrchestrator()