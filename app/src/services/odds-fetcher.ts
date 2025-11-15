/**
 * Odds Fetcher Service
 *
 * This service fetches live odds from The Odds API and stores them in the database.
 * It handles:
 * - Fetching odds for NFL and NCAAF
 * - Storing odds snapshots in the database
 * - Linking odds to events by provider_event_id
 * - Error handling and logging
 */

import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'
import { OddsAPIService, OddsResponse, MARKETS } from './odds-api'

// Lazy-load Supabase client to avoid build-time errors
let supabase: ReturnType<typeof createClient<Database>> | null = null

function getSupabaseClient() {
  if (supabase) return supabase

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE environment variables for odds fetcher')
  }

  supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
    db: { schema: 'afbp' as any }
  })

  return supabase
}

export interface OddsSnapshot {
  event_id?: string
  event_provider_key: string
  book: string
  market: string
  home_spread?: number
  away_spread?: number
  home_ml?: number
  away_ml?: number
  total?: number
  over_price?: number
  under_price?: number
  prices?: Record<string, any>
  fetched_at: string
}

export class OddsFetcherService {
  private oddsAPI: OddsAPIService

  constructor() {
    this.oddsAPI = new OddsAPIService()
  }

  /**
   * Find or create event by provider_event_id
   */
  private async findOrCreateEvent(
    providerEventId: string,
    league: 'NFL' | 'NCAAF',
    homeTeam: string,
    awayTeam: string,
    commenceTime: string
  ): Promise<string | null> {
    try {
      // First try to find existing event
      const { data: existingEvent, error: findError } = await getSupabaseClient()
        .from('events')
        .select('id')
        .eq('provider_event_id', providerEventId)
        .maybeSingle<{ id: string }>()

      if (existingEvent && !findError) {
        return existingEvent.id
      }

      // Event doesn't exist yet - we'll just use the provider_event_id for now
      // In a full implementation, this would create the event with proper team lookups
      console.log(`Event ${providerEventId} not found in database, storing with provider_key only`)
      return null

    } catch (error) {
      console.error(`Error finding event ${providerEventId}:`, error)
      return null
    }
  }

  /**
   * Convert OddsResponse to OddsSnapshot records
   */
  private convertToSnapshots(oddsData: OddsResponse[]): OddsSnapshot[] {
    const snapshots: OddsSnapshot[] = []
    const fetchedAt = new Date().toISOString()

    for (const game of oddsData) {
      for (const bookmaker of game.bookmakers) {
        // Process spreads
        const spreadMarket = bookmaker.markets.find(m => m.key === MARKETS.SPREADS)
        if (spreadMarket) {
          const homeOutcome = spreadMarket.outcomes.find(o => o.name === game.home_team)
          const awayOutcome = spreadMarket.outcomes.find(o => o.name === game.away_team)

          snapshots.push({
            event_provider_key: game.id,
            book: bookmaker.key,
            market: 'spread',
            home_spread: homeOutcome?.point ?? undefined,
            away_spread: awayOutcome?.point ?? undefined,
            home_ml: homeOutcome?.price ?? undefined,
            away_ml: awayOutcome?.price ?? undefined,
            prices: {
              home_price: homeOutcome?.price,
              away_price: awayOutcome?.price
            },
            fetched_at: fetchedAt
          })
        }

        // Process totals
        const totalsMarket = bookmaker.markets.find(m => m.key === MARKETS.TOTALS)
        if (totalsMarket) {
          const overOutcome = totalsMarket.outcomes.find(o => o.name === 'Over')
          const underOutcome = totalsMarket.outcomes.find(o => o.name === 'Under')

          snapshots.push({
            event_provider_key: game.id,
            book: bookmaker.key,
            market: 'totals',
            total: overOutcome?.point ?? underOutcome?.point ?? undefined,
            over_price: overOutcome?.price ?? undefined,
            under_price: underOutcome?.price ?? undefined,
            prices: {
              over_point: overOutcome?.point,
              under_point: underOutcome?.point
            },
            fetched_at: fetchedAt
          })
        }

        // Process moneylines (h2h)
        const h2hMarket = bookmaker.markets.find(m => m.key === MARKETS.H2H)
        if (h2hMarket) {
          const homeOutcome = h2hMarket.outcomes.find(o => o.name === game.home_team)
          const awayOutcome = h2hMarket.outcomes.find(o => o.name === game.away_team)

          snapshots.push({
            event_provider_key: game.id,
            book: bookmaker.key,
            market: 'h2h',
            home_ml: homeOutcome?.price ?? undefined,
            away_ml: awayOutcome?.price ?? undefined,
            prices: {
              home_price: homeOutcome?.price,
              away_price: awayOutcome?.price
            },
            fetched_at: fetchedAt
          })
        }
      }
    }

    return snapshots
  }

  /**
   * Save odds snapshots to database
   */
  private async saveSnapshots(snapshots: OddsSnapshot[]): Promise<{
    success: number
    errors: number
  }> {
    let success = 0
    let errors = 0

    // Insert in batches of 100 to avoid timeout
    const batchSize = 100
    for (let i = 0; i < snapshots.length; i += batchSize) {
      const batch = snapshots.slice(i, i + batchSize)

      const { error } = await getSupabaseClient()
        .from('odds_snapshots')
        .insert(batch as any) // Cast needed due to schema type differences

      if (error) {
        console.error(`Error inserting batch ${i / batchSize + 1}:`, error)
        errors += batch.length
      } else {
        success += batch.length
      }
    }

    return { success, errors }
  }

  /**
   * Fetch and store odds for a specific sport
   */
  async fetchAndStoreOdds(
    sport: 'NFL' | 'NCAAF',
    markets: string[] = [MARKETS.SPREADS, MARKETS.TOTALS, MARKETS.H2H]
  ): Promise<{
    sport: string
    gamesFound: number
    snapshotsCreated: number
    snapshotsStored: number
    errors: number
  }> {
    try {
      console.log(`\n📊 [ODDS-FETCHER] Fetching ${sport} odds...`)

      // Fetch odds from API
      const sportKey = sport === 'NFL' ? 'americanfootball_nfl' : 'americanfootball_ncaaf'
      const oddsData = await this.oddsAPI.getOdds(sportKey, markets)

      console.log(`✅ [ODDS-FETCHER] Found ${oddsData.length} ${sport} games`)

      // Convert to snapshot format
      const snapshots = this.convertToSnapshots(oddsData)
      console.log(`📸 [ODDS-FETCHER] Created ${snapshots.length} snapshots`)

      // Save to database
      const { success, errors } = await this.saveSnapshots(snapshots)

      console.log(`💾 [ODDS-FETCHER] Stored ${success} snapshots, ${errors} errors`)

      return {
        sport,
        gamesFound: oddsData.length,
        snapshotsCreated: snapshots.length,
        snapshotsStored: success,
        errors
      }

    } catch (error) {
      console.error(`❌ [ODDS-FETCHER] Error fetching ${sport} odds:`, error)
      throw error
    }
  }

  /**
   * Fetch and store odds for all sports (NFL + NCAAF)
   */
  async fetchAndStoreAllOdds(): Promise<{
    nfl: any
    ncaaf: any
    totalGames: number
    totalSnapshots: number
    totalErrors: number
  }> {
    const startTime = Date.now()
    console.log('\n🚀 [ODDS-FETCHER] Starting odds fetch for all sports...')

    const [nfl, ncaaf] = await Promise.all([
      this.fetchAndStoreOdds('NFL'),
      this.fetchAndStoreOdds('NCAAF')
    ])

    const duration = Date.now() - startTime

    const result = {
      nfl,
      ncaaf,
      totalGames: nfl.gamesFound + ncaaf.gamesFound,
      totalSnapshots: nfl.snapshotsStored + ncaaf.snapshotsStored,
      totalErrors: nfl.errors + ncaaf.errors,
      duration: `${duration}ms`
    }

    console.log('\n✅ [ODDS-FETCHER] Completed odds fetch')
    console.log(`   • Total games: ${result.totalGames}`)
    console.log(`   • Total snapshots: ${result.totalSnapshots}`)
    console.log(`   • Total errors: ${result.totalErrors}`)
    console.log(`   • Duration: ${result.duration}`)

    return result
  }

  /**
   * Get latest odds for a specific event
   */
  async getLatestOddsForEvent(eventId: string): Promise<any[]> {
    const { data, error } = await getSupabaseClient()
      .from('odds_snapshots')
      .select('*')
      .eq('event_id', eventId)
      .order('fetched_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Error fetching odds for event:', error)
      return []
    }

    return data || []
  }

  /**
   * Get odds history for a specific event and book
   */
  async getOddsHistory(
    eventProviderKey: string,
    book: string,
    market: string = 'spread'
  ): Promise<any[]> {
    const { data, error } = await getSupabaseClient()
      .from('odds_snapshots')
      .select('*')
      .eq('event_provider_key', eventProviderKey)
      .eq('book', book)
      .eq('market', market)
      .order('fetched_at', { ascending: true })

    if (error) {
      console.error('Error fetching odds history:', error)
      return []
    }

    return data || []
  }
}

// Export singleton instance
export const oddsFetcher = new OddsFetcherService()
