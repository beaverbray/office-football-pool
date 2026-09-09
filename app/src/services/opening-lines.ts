import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Opening lines, defined as the first spread this system ever observed for a
 * given game.
 *
 * There is no true opening line available here: The Odds API serves only
 * current odds on this plan (its historical endpoint returns 401
 * HISTORICAL_UNAVAILABLE_ON_FREE_USAGE_PLAN), Splash reports only the pool's
 * current number, and no other source is wired. So "opening" means first
 * observed, bounded by when this recording started — which is why the UI must
 * not present it as the book's open.
 *
 * `afbp.odds_snapshots` and the row shape in odds-fetcher.ts were built for
 * exactly this and had never received a row: the only writer was reachable from
 * a manual endpoint nothing called, and the live pipeline read odds through
 * odds-api.ts, bypassing persistence entirely. Every refresh discarded the
 * observation it had just paid for.
 *
 * No date window is needed to keep this in-week. `event_provider_key` is unique
 * per game, so the earliest snapshot for a key is necessarily the first sighting
 * of that specific game's line.
 */

export interface MarketGameForSnapshot {
  gameId: string
  homeSpread?: number | null
  awaySpread?: number | null
  bookmaker?: string | null
}

/**
 * `afbp.odds_snapshots` is absent from the generated Database type (issue #16),
 * so the client is narrowed to exactly the two calls made here rather than cast
 * to `any`. A wrong column name still fails to compile.
 */
interface SnapshotRow {
  event_provider_key: string
  book: string
  market: string
  home_spread: number | null
  away_spread: number | null
  fetched_at: string
}

type SnapshotTable = {
  from(table: 'odds_snapshots'): {
    insert(rows: SnapshotRow[]): Promise<{ error: { message: string } | null }>
    select(columns: string): {
      in(column: 'event_provider_key', values: string[]): {
        order(column: 'fetched_at', opts: { ascending: boolean }): Promise<{
          data: Array<Pick<SnapshotRow, 'event_provider_key' | 'home_spread' | 'fetched_at' | 'market'>> | null
          error: { message: string } | null
        }>
      }
    }
  }
}

/** Market value marking a scheduled weekly-open capture, vs an incidental one. */
export const OPEN_MARKET = 'spread_open'
export const OBSERVED_MARKET = 'spread'

/**
 * Record one snapshot per game from a completed odds retrieval.
 *
 * `capture: 'weekly-open'` marks the Tuesday job's rows. That distinction is
 * load-bearing rather than cosmetic: The Odds API's NFL feed returns the whole
 * season at once (270 games, September through January), so a single run writes
 * a row for every remaining week. Taking the earliest row per game would pin
 * Week 18's opening line to a snapshot captured in September, months before
 * that week's results and injuries existed.
 *
 * Best-effort: a failure here must not fail the refresh, because the pipeline's
 * own output does not depend on it. Returns the number of rows written.
 */
export async function recordOddsSnapshots(
  games: MarketGameForSnapshot[],
  options: { fetchedAt?: string; capture?: 'weekly-open' | 'incidental' } = {}
): Promise<{ recorded: number; error?: string }> {
  if (!supabaseAdmin) return { recorded: 0, error: 'Service role key not configured' }
  const fetchedAt = options.fetchedAt ?? new Date().toISOString()

  const rows = games
    .filter(g => g.gameId && g.homeSpread != null)
    .map(g => ({
      event_provider_key: g.gameId,
      // The stored market game does not always carry which book supplied the
      // line; the pipeline consumes a single chosen spread per game.
      book: g.bookmaker || 'consensus',
      market: options.capture === 'weekly-open' ? OPEN_MARKET : OBSERVED_MARKET,
      home_spread: g.homeSpread ?? null,
      away_spread: g.awaySpread ?? (g.homeSpread == null ? null : -g.homeSpread),
      fetched_at: fetchedAt
    }))

  if (rows.length === 0) return { recorded: 0 }

  const db = supabaseAdmin as unknown as SnapshotTable
  const { error } = await db.from('odds_snapshots').insert(rows)
  if (error) return { recorded: 0, error: error.message }
  return { recorded: rows.length }
}

/**
 * The opening spread for each game: the line as of the Tuesday of that game's
 * own week.
 *
 * Selection, in order:
 *   1. The LATEST `weekly-open` capture taken before kickoff. Latest, not
 *      earliest, because the NFL feed returns the whole season, so a Week 18
 *      game accumulates a tagged row every Tuesday from September onward. The
 *      one that means "after last week's results and injuries" is the final one
 *      before that game is played.
 *   2. Failing that, the earliest observation of any kind — a game first seen
 *      after its own Tuesday, or rows predating the tagged captures.
 *
 * Selection happens here rather than in SQL because the project has no working
 * `exec_sql` RPC (issue #15), so there is no way to express a per-key argmax
 * over PostgREST.
 *
 * @param kickoffByKey game start times; without one for a key, every tagged
 *   capture is eligible and the latest wins.
 */
export async function getOpeningSpreads(
  eventProviderKeys: string[],
  kickoffByKey: Map<string, string> = new Map()
): Promise<Map<string, { spread: number; observedAt: string }>> {
  const opening = new Map<string, { spread: number; observedAt: string }>()
  if (!supabaseAdmin || eventProviderKeys.length === 0) return opening

  const db = supabaseAdmin as unknown as SnapshotTable
  const { data, error } = await db
    .from('odds_snapshots')
    .select('event_provider_key, home_spread, fetched_at, market')
    .in('event_provider_key', eventProviderKeys)
    .order('fetched_at', { ascending: true })

  if (error || !data) return opening

  const fallback = new Map<string, { spread: number; observedAt: string }>()

  for (const row of data) {
    if (row.home_spread == null) continue
    const key = row.event_provider_key
    const hit = { spread: row.home_spread, observedAt: row.fetched_at }

    // Ascending order means the first row seen for a key is its earliest.
    if (!fallback.has(key)) fallback.set(key, hit)

    if (row.market !== OPEN_MARKET) continue
    const kickoff = kickoffByKey.get(key)
    if (kickoff && Date.parse(row.fetched_at) >= Date.parse(kickoff)) continue
    // Ascending order again: each later eligible capture overwrites the last,
    // leaving the newest one before kickoff.
    opening.set(key, hit)
  }

  for (const [key, hit] of fallback) {
    if (!opening.has(key)) opening.set(key, hit)
  }
  return opening
}
