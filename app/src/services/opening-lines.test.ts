import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getOpeningSpreads, OPEN_MARKET, OBSERVED_MARKET } from './opening-lines'

/**
 * The selection rule these cover is not cosmetic. The Odds API's NFL feed
 * returns the whole season in one call — 270 games, September through January —
 * so a single run writes a row for every remaining week. Under a plain
 * earliest-wins rule, Week 18's "opening line" is a snapshot taken in
 * September, months before that week's results and injuries existed.
 */

const rows: Array<{ event_provider_key: string; home_spread: number | null; fetched_at: string; market: string }> = []

vi.mock('@/lib/supabase-admin', () => {
  // A small builder rather than a hardcoded select->in->order chain. The query
  // shape changed once already (adding .eq and .limit for the PostgREST 1000-row
  // cap) and a rigid mock would have thrown instead of exercising the new path.
  const build = (keys: string[]) => {
    let out = rows.filter(r => keys.includes(r.event_provider_key))
    const q: Record<string, unknown> = {
      eq: (_c: string, v: string) => { out = out.filter(r => r.market === v); return q },
      order: (_c: string, o: { ascending: boolean }) => {
        out = [...out].sort((a, b) =>
          o.ascending ? a.fetched_at.localeCompare(b.fetched_at) : b.fetched_at.localeCompare(a.fetched_at))
        return q
      },
      // PostgREST truncates to the requested limit, and caps unbounded selects
      // at 1000. Modelling that is the point of this fixture.
      limit: async (n: number) => ({ data: out.slice(0, Math.min(n, 1000)), error: null })
    }
    return q
  }
  return {
    supabaseAdmin: {
      from: () => ({
        insert: async () => ({ error: null }),
        select: () => ({ in: (_c: string, keys: string[]) => build(keys) })
      })
    }
  }
})


const KEY = 'game_week18'
const KICKOFF = '2027-01-03T18:00:00Z'

beforeEach(() => { rows.length = 0 })

describe('getOpeningSpreads', () => {
  it('takes the last weekly-open capture before kickoff, not the first', async () => {
    rows.push(
      // September: the season-long feed's first mention of a January game.
      { event_provider_key: KEY, home_spread: -7, fetched_at: '2026-09-08T09:00:00Z', market: OPEN_MARKET },
      { event_provider_key: KEY, home_spread: -4, fetched_at: '2026-12-01T09:00:00Z', market: OPEN_MARKET },
      // The Tuesday of the game's own week — the one that means "after last
      // week's results and injuries".
      { event_provider_key: KEY, home_spread: -2.5, fetched_at: '2026-12-29T09:00:00Z', market: OPEN_MARKET }
    )
    const out = await getOpeningSpreads([KEY], new Map([[KEY, KICKOFF]]))
    expect(out.get(KEY)).toEqual({ spread: -2.5, observedAt: '2026-12-29T09:00:00Z' })
  })

  it('ignores captures taken after kickoff', async () => {
    rows.push(
      { event_provider_key: KEY, home_spread: -3, fetched_at: '2026-12-29T09:00:00Z', market: OPEN_MARKET },
      { event_provider_key: KEY, home_spread: -9, fetched_at: '2027-01-05T09:00:00Z', market: OPEN_MARKET }
    )
    const out = await getOpeningSpreads([KEY], new Map([[KEY, KICKOFF]]))
    expect(out.get(KEY)?.spread).toBe(-3)
  })

  it('prefers a tagged capture over an earlier incidental observation', async () => {
    // Thursday's refresh also records rows. Those are observations, not the
    // week's opening line, and must not win merely by being earlier.
    rows.push(
      { event_provider_key: KEY, home_spread: -8, fetched_at: '2026-12-28T20:00:00Z', market: OBSERVED_MARKET },
      { event_provider_key: KEY, home_spread: -2.5, fetched_at: '2026-12-29T09:00:00Z', market: OPEN_MARKET }
    )
    const out = await getOpeningSpreads([KEY], new Map([[KEY, KICKOFF]]))
    expect(out.get(KEY)?.spread).toBe(-2.5)
  })

  it('falls back to the earliest observation when no tagged capture exists', async () => {
    // A game first seen after its own Tuesday, or rows predating the tagged
    // captures. Something real is better than an empty column.
    rows.push(
      { event_provider_key: KEY, home_spread: -6, fetched_at: '2026-12-30T20:00:00Z', market: OBSERVED_MARKET },
      { event_provider_key: KEY, home_spread: -5, fetched_at: '2026-12-31T20:00:00Z', market: OBSERVED_MARKET }
    )
    const out = await getOpeningSpreads([KEY], new Map([[KEY, KICKOFF]]))
    expect(out.get(KEY)?.spread).toBe(-6)
  })

  it('keeps games independent', async () => {
    rows.push(
      { event_provider_key: 'a', home_spread: -1, fetched_at: '2026-12-29T09:00:00Z', market: OPEN_MARKET },
      { event_provider_key: 'b', home_spread: -2, fetched_at: '2026-12-29T09:00:00Z', market: OPEN_MARKET }
    )
    const out = await getOpeningSpreads(['a', 'b'], new Map())
    expect(out.get('a')?.spread).toBe(-1)
    expect(out.get('b')?.spread).toBe(-2)
  })

  it('skips rows with no spread rather than recording a null opening', async () => {
    rows.push(
      { event_provider_key: KEY, home_spread: null, fetched_at: '2026-12-29T09:00:00Z', market: OPEN_MARKET },
      { event_provider_key: KEY, home_spread: -3.5, fetched_at: '2026-12-29T09:30:00Z', market: OPEN_MARKET }
    )
    const out = await getOpeningSpreads([KEY], new Map([[KEY, KICKOFF]]))
    expect(out.get(KEY)?.spread).toBe(-3.5)
  })
})

describe('PostgREST row cap', () => {
  it('still finds the newest tagged capture when results exceed 1000 rows', () => {
    // By mid-season a 47-game NFL board carries ~25 rows per game, well past
    // the 1000-row cap. Read ascending, truncation drops the NEWEST rows —
    // exactly the ones selected — and OPEN silently reverts to September lines
    // with nothing failing. Read descending, truncation only costs the oldest.
    const keys: string[] = []
    for (let g = 0; g < 60; g++) {
      const key = `game_${g}`
      keys.push(key)
      for (let week = 0; week < 26; week++) {
        rows.push({
          event_provider_key: key,
          // Later captures carry a distinct spread so the assertion can tell
          // which one was chosen.
          home_spread: -week,
          fetched_at: `2026-${String(6 + Math.floor(week / 4)).padStart(2, '0')}-${String(1 + (week % 4) * 7).padStart(2, '0')}T09:00:00Z`,
          market: OPEN_MARKET
        })
      }
    }
    expect(rows.length).toBeGreaterThan(1000)

    return getOpeningSpreads(keys, new Map(keys.map(k => [k, '2027-01-03T18:00:00Z']))).then(out => {
      expect(out.size).toBe(60)
      // Week 25 is the last capture written for every game.
      for (const k of keys) expect(out.get(k)?.spread).toBe(-25)
    })
  })
})
