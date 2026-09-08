import { describe, it, expect } from 'vitest'
import { normalizeGames, type SplashPicksheet } from './splash-api'

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
})
