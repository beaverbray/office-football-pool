import Papa from 'papaparse'

export interface NFELOPrediction {
  gameTime: string
  awayTeam: string
  homeTeam: string
  awayElo: number
  homeElo: number
  predictedWinner: 'home' | 'away'
  winProbability: number
  /** The model's own line. Absent when nfelo has not published one yet. */
  spread?: number
  overUnder?: number
}

export interface NFELOScraperResult {
  success: boolean
  predictions: NFELOPrediction[]
  scrapedAt: string
  week: number
  season: number
  error?: string
}

export class NFELOScraper {
  private static readonly CSV_URL = 'https://raw.githubusercontent.com/greerreNFL/nfelo/main/output_data/nfelo_games.csv'

  /**
   * Fetch predictions for a specific week and season from GitHub CSV
   * @param season - NFL season year (e.g., 2025)
   * @param week - Week number (1-18)
   * @returns Scraper result with predictions
   */
  static async scrapePredictions(season: number, week: number): Promise<NFELOScraperResult> {
    const scrapedAt = new Date().toISOString()

    try {
      console.log(`Fetching NFELO CSV data from: ${this.CSV_URL}`)

      // Fetch the CSV file
      const response = await fetch(this.CSV_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OfficeFootballPool/1.0)',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const csvText = await response.text()

      // Parse CSV
      const parseResult = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      })

      if (parseResult.errors.length > 0) {
        console.warn('CSV parsing warnings:', parseResult.errors)
      }

      const allGames = parseResult.data as any[]
      console.log(`Loaded ${allGames.length} total games from CSV`)

      // Filter for the requested season and week
      // game_id format is: SEASON_WEEK_AWAY_HOME (e.g., "2025_05_SF_LAR")
      const filteredGames = allGames.filter((game: any) => {
        if (!game.game_id) return false
        const parts = game.game_id.split('_')
        if (parts.length < 2) return false
        const gameSeason = parseInt(parts[0])
        const gameWeek = parseInt(parts[1])
        return gameSeason === season && gameWeek === week
      })

      console.log(`Found ${filteredGames.length} games for season ${season}, week ${week}`)

      const predictions: NFELOPrediction[] = []

      // nfelo states its ratings in Elo points; a spread needs points of
      // football. The conversion is a fixed multiplier, but rather than
      // hardcode a reverse-engineered constant, recover it from the file:
      // nfelo publishes both `nfelo_dif_close` and the line it rounds that to,
      // so their ratio IS the multiplier. Median over the sample, so one odd
      // row cannot move it, and it tracks nfelo if they ever retune.
      const ratios = allGames
        .map((g: any) => {
          const dif = parseFloat(g.nfelo_dif_close)
          const line = parseFloat(g.nfelo_home_line_close)
          return Number.isFinite(dif) && Number.isFinite(line) && line !== 0 ? Math.abs(dif / line) : null
        })
        .filter((r: number | null): r is number => r !== null && r > 1)
        .sort((a: number, b: number) => a - b)
      const eloPerPoint = ratios.length > 0 ? ratios[Math.floor(ratios.length / 2)] : 25

      filteredGames.forEach((game: any) => {
        try {
          // Parse game_id to get teams
          const parts = game.game_id.split('_')
          const awayTeam = parts[2] || ''
          const homeTeam = parts[3] || ''

          // Parse probabilities (already in decimal format, convert to percentage)
          const homeProb = parseFloat(game.nfelo_home_probability_close || 0) * 100
          const awayProb = (1 - parseFloat(game.nfelo_home_probability_close || 0)) * 100

          // Parse ELO ratings
          const homeElo = parseFloat(game.starting_nfelo_home || 0)
          const awayElo = parseFloat(game.starting_nfelo_away || 0)

          // MOD must be an opinion the market has not already expressed —
          // otherwise it duplicates the MKT column beside it.
          //
          // Three candidates, all real columns:
          //   home_line_close       the sportsbook's line. Not a model at all;
          //                         reading it made MOD equal MKT in 13 of 14
          //                         games and the "model confirms" bonus free.
          //   nfelo_dif_close       the model regressed TOWARD the market. It
          //                         rounds to the book's number 13 times in 16,
          //                         so it is only nominally independent.
          //   nfelo_dif_base        the pre-market rating differential, before
          //                         any market adjustment. Differs from close
          //                         by 0.93 pts on average, 1.85 at most.
          //
          // Using the base differential. A market-blended MOD cannot disagree
          // with the market often enough to be worth a column.
          //
          // Positive differential favours the home team, and a home favourite
          // carries a negative line, hence the sign flip. No fallback to any
          // market column: a missing model number reads as missing.
          const difBase = parseFloat(game.nfelo_dif_base)
          const homeModelLine = Number.isFinite(difBase)
            ? Math.round((-difBase / eloPerPoint) * 2) / 2
            : null

          predictions.push({
            gameTime: '',
            awayTeam,
            homeTeam,
            awayElo,
            homeElo,
            // Winner follows the same pre-market differential the line does, so
            // the two cannot contradict each other. winProbability stays
            // nfelo's own close probability, which is a different, market-aware
            // quantity — it is reported, not used to pick the side.
            predictedWinner: homeModelLine !== null
              ? (homeModelLine <= 0 ? 'home' : 'away')
              : (homeProb > awayProb ? 'home' : 'away'),
            winProbability: Math.max(homeProb, awayProb),
            spread: homeModelLine !== null ? Math.abs(homeModelLine) : undefined,
            overUnder: parseFloat(game.total_line_close || 0) || undefined,
          })
        } catch (err) {
          console.warn('Error parsing game from CSV:', err, game)
        }
      })

      if (predictions.length === 0) {
        throw new Error(`No games found for season ${season}, week ${week}. CSV may not have data for this period yet.`)
      }

      console.log(`Successfully parsed ${predictions.length} NFELO predictions`)

      return {
        success: true,
        predictions,
        scrapedAt,
        week,
        season,
      }
    } catch (error) {
      console.error('NFELO CSV fetch error:', error)
      return {
        success: false,
        predictions: [],
        scrapedAt,
        week,
        season,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Scrape predictions for current NFL week
   */
  static async scrapeCurrentWeek(): Promise<NFELOScraperResult> {
    const now = new Date()
    const currentSeason = now.getFullYear()

    // Rough estimate of current week based on date
    // NFL season typically starts first week of September
    const seasonStart = new Date(currentSeason, 8, 1) // September 1st
    const weeksPassed = Math.floor((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const currentWeek = Math.max(1, Math.min(18, weeksPassed + 1))

    return this.scrapePredictions(currentSeason, currentWeek)
  }

  /**
   * Convert predictions to pipeline format
   */
  static convertToPipelineFormat(predictions: NFELOPrediction[]): Array<{
    homeTeam: string
    awayTeam: string
    spread: number
    gameDate?: string
    metadata?: any
  }> {
    // A prediction with no model line carries no spread to publish. Drop it
    // rather than coercing the absence into 0, which would read downstream as
    // a pick'em the model never made.
    return predictions
      .filter((pred): pred is NFELOPrediction & { spread: number } => pred.spread != null)
      .map(pred => ({
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        spread: pred.predictedWinner === 'home' ? -pred.spread : pred.spread,
        metadata: {
          source: 'nfelo',
          winProbability: pred.winProbability,
          awayElo: pred.awayElo,
          homeElo: pred.homeElo,
          gameTime: pred.gameTime,
        }
      }))
  }
}
