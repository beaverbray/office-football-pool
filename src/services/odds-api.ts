import { z } from 'zod'

// API Configuration
const API_KEY = process.env.THE_ODDS_API_KEY
const BASE_URL = 'https://api.the-odds-api.com/v4'

// Sports keys for NFL and NCAAF
export const SPORTS = {
  NFL: 'americanfootball_nfl',
  NCAAF: 'americanfootball_ncaaf'
} as const

// Market types
export const MARKETS = {
  SPREADS: 'spreads',
  TOTALS: 'totals',
  H2H: 'h2h' // head to head (moneyline)
} as const

// Regions for odds
export const REGIONS = {
  US: 'us',
  UK: 'uk',
  EU: 'eu',
  AU: 'au'
} as const

// Zod schemas for type safety
const BookmakerSchema = z.object({
  key: z.string(),
  title: z.string(),
  last_update: z.string()
})

const OutcomeSchema = z.object({
  name: z.string(),
  price: z.number(),
  point: z.number().optional() // For spreads and totals
})

const MarketSchema = z.object({
  key: z.string(),
  last_update: z.string(),
  outcomes: z.array(OutcomeSchema)
})

const OddsResponseSchema = z.object({
  id: z.string(),
  sport_key: z.string(),
  sport_title: z.string(),
  commence_time: z.string(),
  home_team: z.string(),
  away_team: z.string(),
  bookmakers: z.array(z.object({
    key: z.string(),
    title: z.string(),
    last_update: z.string(),
    markets: z.array(MarketSchema)
  }))
})

const SportsResponseSchema = z.object({
  key: z.string(),
  group: z.string(),
  title: z.string(),
  description: z.string(),
  active: z.boolean(),
  has_outrights: z.boolean()
})

// Types
export type OddsResponse = z.infer<typeof OddsResponseSchema>
export type SportsResponse = z.infer<typeof SportsResponseSchema>
export type Market = z.infer<typeof MarketSchema>
export type Outcome = z.infer<typeof OutcomeSchema>

// Cache configuration
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
const cache = new Map<string, { data: any; timestamp: number }>()

// Rate limiting
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 1000 // 1 second between requests

export class OddsAPIService {
  private apiKey: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey || API_KEY || ''
    if (!this.apiKey) {
      throw new Error('THE_ODDS_API_KEY is not configured')
    }
  }

  /**
   * Rate limit protection
   */
  private async enforceRateLimit() {
    const now = Date.now()
    const timeSinceLastRequest = now - lastRequestTime
    
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => 
        setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
      )
    }
    
    lastRequestTime = Date.now()
  }

  /**
   * Check cache for data
   */
  private getCached(key: string) {
    const cached = cache.get(key)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`Cache hit for ${key}`)
      return cached.data
    }
    return null
  }

  /**
   * Store data in cache
   */
  private setCache(key: string, data: any) {
    cache.set(key, { data, timestamp: Date.now() })
  }

  /**
   * Fetch available sports
   */
  async getSports(): Promise<SportsResponse[]> {
    const cacheKey = 'sports'
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    await this.enforceRateLimit()

    const url = `${BASE_URL}/sports?apiKey=${this.apiKey}`
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch sports: ${response.statusText}`)
    }

    const data = await response.json()
    const validated = z.array(SportsResponseSchema).parse(data)
    
    this.setCache(cacheKey, validated)
    return validated
  }

  /**
   * Fetch odds for a specific sport
   */
  async getOdds(
    sport: typeof SPORTS[keyof typeof SPORTS],
    markets: string[] = [MARKETS.SPREADS],
    regions: string = REGIONS.US,
    oddsFormat: 'american' | 'decimal' = 'american'
  ): Promise<OddsResponse[]> {
    const cacheKey = `odds-${sport}-${markets.join(',')}-${regions}`
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    await this.enforceRateLimit()

    const params = new URLSearchParams({
      apiKey: this.apiKey,
      regions,
      markets: markets.join(','),
      oddsFormat
    })

    const url = `${BASE_URL}/sports/${sport}/odds?${params}`
    console.log(`Fetching odds from: ${url.replace(this.apiKey, 'REDACTED')}`)
    
    const response = await fetch(url)
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key')
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded')
      }
      throw new Error(`Failed to fetch odds: ${response.statusText}`)
    }

    // Check remaining requests header
    const remainingRequests = response.headers.get('x-requests-remaining')
    const usedRequests = response.headers.get('x-requests-used')
    
    console.log(`API Usage - Used: ${usedRequests}, Remaining: ${remainingRequests}`)
    
    if (remainingRequests && parseInt(remainingRequests) < 100) {
      console.warn(`⚠️ Low API requests remaining: ${remainingRequests}`)
    }

    const data = await response.json()
    const validated = z.array(OddsResponseSchema).parse(data)
    
    this.setCache(cacheKey, validated)
    return validated
  }

  /**
   * Get NFL spreads
   */
  async getNFLSpreads(): Promise<OddsResponse[]> {
    return this.getOdds(SPORTS.NFL, [MARKETS.SPREADS])
  }

  /**
   * Get NCAAF spreads
   */
  async getNCAASpreads(): Promise<OddsResponse[]> {
    return this.getOdds(SPORTS.NCAAF, [MARKETS.SPREADS])
  }

  /**
   * Get both NFL and NCAAF spreads
   */
  async getAllSpreads(): Promise<{
    nfl: OddsResponse[]
    ncaaf: OddsResponse[]
  }> {
    const [nfl, ncaaf] = await Promise.all([
      this.getNFLSpreads(),
      this.getNCAASpreads()
    ])

    return { nfl, ncaaf }
  }

  /**
   * Extract best spread for a game from multiple bookmakers
   */
  static getBestSpread(game: OddsResponse): {
    homeTeam: string
    awayTeam: string
    homeSpread: number | null
    awaySpread: number | null
    bookmaker: string | null
    lastUpdate: string | null
  } {
    let bestHomeSpread: number | null = null
    let bestAwaySpread: number | null = null
    let bestBookmaker: string | null = null
    let lastUpdate: string | null = null

    // Find the spread market from the first available bookmaker
    for (const bookmaker of game.bookmakers) {
      const spreadMarket = bookmaker.markets.find(m => m.key === MARKETS.SPREADS)
      
      if (spreadMarket) {
        const homeOutcome = spreadMarket.outcomes.find(o => o.name === game.home_team)
        const awayOutcome = spreadMarket.outcomes.find(o => o.name === game.away_team)
        
        if (homeOutcome?.point !== undefined && awayOutcome?.point !== undefined) {
          // For simplicity, take the first bookmaker's spread
          // In production, you might want to average or find consensus
          bestHomeSpread = homeOutcome.point
          bestAwaySpread = awayOutcome.point
          bestBookmaker = bookmaker.title
          lastUpdate = bookmaker.last_update
          break
        }
      }
    }

    return {
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      homeSpread: bestHomeSpread,
      awaySpread: bestAwaySpread,
      bookmaker: bestBookmaker,
      lastUpdate
    }
  }

  /**
   * Format odds data for display
   */
  static formatOddsForDisplay(odds: OddsResponse[]): Array<{
    gameId: string
    homeTeam: string
    awayTeam: string
    homeSpread: number | null
    awaySpread: number | null
    gameTime: string
    bookmaker: string | null
  }> {
    return odds.map(game => {
      const spread = this.getBestSpread(game)
      return {
        gameId: game.id,
        homeTeam: spread.homeTeam,
        awayTeam: spread.awayTeam,
        homeSpread: spread.homeSpread,
        awaySpread: spread.awaySpread,
        gameTime: game.commence_time,
        bookmaker: spread.bookmaker
      }
    })
  }

  /**
   * Clear cache
   */
  static clearCache() {
    cache.clear()
    console.log('Odds API cache cleared')
  }
}

// Export a function to get the singleton instance
// This prevents initialization errors when the module is imported
export const getOddsAPI = () => {
  if (!process.env.THE_ODDS_API_KEY) {
    throw new Error('THE_ODDS_API_KEY is not configured. Please add it to your .env file.')
  }
  return new OddsAPIService()
}