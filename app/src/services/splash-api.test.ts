import { describe, it, expect } from 'vitest'
import { normalizeGames, toSourceGames, toEntryState, type SplashPicksheet } from './splash-api'

/** Shaped from a real /team-pickem/picksheets response. */
function picksheet(games: SplashPicksheet['games']): SplashPicksheet {
  return { contestId: 'contest_x', slateId: 'slate_x', entryId: 'entry_x', games }
}

const team = (alias: string, spread: number | null, prob: number | null) => ({
  id: `id-${alias}`, alias, name: `${alias} Name`, score: 0, spread,
  winProbability: prob, record: { wins: 0, losses: 0, ties: 0 }, top25Ranking: null
})

const game = (over: Partial<SplashPicksheet['games'][number]> = {}) => ({
  gameId: 'g1',
  startsAt: '2026-09-10T00:20:00.000Z',
  lockAt: '2026-09-10T00:20:00.000Z',
  status: 'scheduled',
  league: 'nfl',
  home: team('SEA', -3.5, 64.3),
  away: team('NE', 3.5, 35.7),
  totalsEnabled: false,
  total: null,
  isMustPickTeam: false,
  isTiebreakerGame: false,
  ...over
})

describe('normalizeGames', () => {
  it('converts winProbability from percent to a 0-1 fraction', () => {
    // The API publishes 64.3 meaning 64.3%; the pipeline works in 0-1.
    const [g] = normalizeGames(picksheet([game()]))
    expect(g.homeWinProbability).toBeCloseTo(0.643, 10)
  })

  it('keeps the home-perspective spread sign', () => {
    const [g] = normalizeGames(picksheet([game()]))
    expect(g.spread).toBe(-3.5)
  })

  it('maps league to the pipeline vocabulary', () => {
    const games = normalizeGames(picksheet([
      game({ gameId: 'a', league: 'nfl' }),
      game({ gameId: 'b', league: 'cfb' }),
      game({ gameId: 'c', league: 'NCAAF' })
    ]))
    expect(games.map(g => g.league)).toEqual(['NFL', 'NCAAF', 'NCAAF'])
  })

  it('keeps games whose line is not posted yet, rather than dropping them', () => {
    // "no line yet" must stay distinguishable from "game missing".
    const games = normalizeGames(picksheet([
      game({ gameId: 'a', home: team('SEA', null, null), away: team('NE', null, null) })
    ]))
    expect(games).toHaveLength(1)
    expect(games[0].spread).toBeNull()
    expect(games[0].homeWinProbability).toBeNull()
  })

  it('preserves canonical aliases so no fuzzy name matching is needed', () => {
    const [g] = normalizeGames(picksheet([game()]))
    expect(g.homeAlias).toBe('SEA')
    expect(g.awayAlias).toBe('NE')
    expect(g.gameId).toBe('g1')
  })

  it('defaults optional pool flags to false rather than undefined', () => {
    const [g] = normalizeGames(picksheet([
      game({ isMustPickTeam: undefined, isTiebreakerGame: undefined })
    ]))
    expect(g.isMustPick).toBe(false)
    expect(g.isTiebreaker).toBe(false)
  })

  it('surfaces must-pick and tiebreaker flags when set', () => {
    const [g] = normalizeGames(picksheet([
      game({ isMustPickTeam: true, isTiebreakerGame: true })
    ]))
    expect(g.isMustPick).toBe(true)
    expect(g.isTiebreaker).toBe(true)
  })

  it('handles a 0% probability without treating it as missing', () => {
    const [g] = normalizeGames(picksheet([
      game({ home: team('SEA', 22.5, 0), away: team('ORE', -22.5, 100) })
    ]))
    expect(g.homeWinProbability).toBe(0)
  })

  it('keeps a null-spread game, which toSourceGames then drops', () => {
    // The two functions intentionally disagree: normalizeGames preserves
    // "no line yet"; toSourceGames feeds PipelineInput.picksheetGames, whose
    // `spread` is a non-optional number the matcher does arithmetic on.
    const sheet = picksheet([
      game({ gameId: 'priced' }),
      game({ gameId: 'unpriced', home: team('KC', null, null), away: team('BUF', null, null) })
    ])

    expect(normalizeGames(sheet).map(g => g.gameId)).toEqual(['priced', 'unpriced'])
    expect(toSourceGames(sheet).map(g => g.gameId)).toEqual(['priced'])
  })

  it('never emits an undefined spread to the pipeline', () => {
    const sheet = picksheet([
      game({ gameId: 'a', home: team('KC', null, null), away: team('BUF', null, null) }),
      game({ gameId: 'b' })
    ])
    for (const g of toSourceGames(sheet)) {
      expect(typeof g.spread).toBe('number')
      expect(Number.isNaN(g.spread)).toBe(false)
    }
  })

  it('drops every game when no line is posted yet', () => {
    // A slate before spreads go up must yield an empty set, not NaN-bearing rows.
    const sheet = picksheet([
      game({ gameId: 'a', home: team('KC', null, null), away: team('BUF', null, null) })
    ])
    expect(toSourceGames(sheet)).toEqual([])
    expect(normalizeGames(sheet)).toHaveLength(1)
  })
})

describe('toEntryState quota', () => {
  it('takes the requirement from the sheet rather than assuming one', () => {
    const sheet = {
      ...picksheet([game()]),
      leagueMinimums: [{ league: 'nfl', minimum: 10 }, { league: 'ncaaf', minimum: 10 }]
    } as SplashPicksheet
    expect(toEntryState(sheet).quota).toEqual({ NFL: 10, NCAAF: 10 })
  })

  it('reflects a requirement that is not ten', () => {
    const sheet = {
      ...picksheet([game()]),
      leagueMinimums: [{ league: 'nfl', minimum: 12 }]
    } as SplashPicksheet
    expect(toEntryState(sheet).quota.NFL).toBe(12)
  })

  // leagueMinimums is optional in Splash's payload. A league it says nothing
  // about must stay absent: seeding the map with zeros made a missing quota
  // arrive as 0, which truncated every recommendation and rendered an empty
  // table under "BEST 0 OF 0".
  it('leaves a league Splash did not publish as unknown, not zero', () => {
    const sheet = {
      ...picksheet([game()]),
      leagueMinimums: [{ league: 'nfl', minimum: 10 }]
    } as SplashPicksheet
    const { quota } = toEntryState(sheet)
    expect(quota.NFL).toBe(10)
    expect(quota.NCAAF).toBeUndefined()
  })

  it('leaves both leagues unknown when the field is absent entirely', () => {
    const { quota } = toEntryState(picksheet([game()]))
    expect(quota.NFL).toBeUndefined()
    expect(quota.NCAAF).toBeUndefined()
  })
})
