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
        eq(column: 'market', value: string): {
          order(column: 'fetched_at', opts: { ascending: boolean }): Promise<{
            data: Array<Pick<SnapshotRow, 'event_provider_key' | 'home_spread' | 'fetched_at'>> | null
            error: { message: string } | null
          }>
        }
      }
    }
  }
}

/**
 * Record one snapshot per game from a completed odds retrieval.
 *
 * Best-effort: a failure here must not fail the refresh, because the pipeline's
 * own output does not depend on it. Returns the number of rows written.
 */
export async function recordOddsSnapshots(
  games: MarketGameForSnapshot[],
  fetchedAt: string = new Date().toISOString()
): Promise<{ recorded: number; error?: string }> {
  if (!supabaseAdmin) return { recorded: 0, error: 'Service role key not configured' }

  const rows = games
    .filter(g => g.gameId && g.homeSpread != null)
    .map(g => ({
      event_provider_key: g.gameId,
      // The stored market game does not always carry which book supplied the
      // line; the pipeline consumes a single chosen spread per game.
      book: g.bookmaker || 'consensus',
      market: 'spread',
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
 * First observed home spread for each of the given provider keys.
 *
 * Ordered ascending by `fetched_at` and taking the first hit per key, rather
 * than grouping in SQL, so this works over PostgREST without an RPC — the
 * project has no working `exec_sql` (see issue #15).
 */
export async function getOpeningSpreads(
  eventProviderKeys: string[]
): Promise<Map<string, { spread: number; observedAt: string }>> {
  const opening = new Map<string, { spread: number; observedAt: string }>()
  if (!supabaseAdmin || eventProviderKeys.length === 0) return opening

  const db = supabaseAdmin as unknown as SnapshotTable
  const { data, error } = await db
    .from('odds_snapshots')
    .select('event_provider_key, home_spread, fetched_at')
    .in('event_provider_key', eventProviderKeys)
    .eq('market', 'spread')
    .order('fetched_at', { ascending: true })

  if (error || !data) return opening

  for (const row of data) {
    if (row.home_spread == null) continue
    // Ascending order means the first row seen for a key is its earliest.
    if (!opening.has(row.event_provider_key)) {
      opening.set(row.event_provider_key, { spread: row.home_spread, observedAt: row.fetched_at })
    }
  }
  return opening
}
