import { describe, it, expect } from 'vitest'
import { GameMatchingService, SourceGame } from './game-matching-service'
import { Database } from '@/types/database'

type ScheduleGame = Database['public']['Tables']['schedule']['Row']

function makeSchedule(overrides: Partial<ScheduleGame> = {}): ScheduleGame {
  return {
    league: 'NFL',
    match_number: 1,
    week: 1,
    date: '2024-09-08',
    location: 'Highmark Stadium',
    home_team: 'Buffalo Bills',
    away_team: 'Miami Dolphins',
    ...overrides,
  }
}

describe('GameMatchingService.matchPicksheetToSchedule', () => {
  it('exact-match: identical team names match with confidence 1.0', () => {
    const schedule = [makeSchedule()]
    const picksheetGames: SourceGame[] = [
      { homeTeam: 'Buffalo Bills', awayTeam: 'Miami Dolphins' },
    ]

    const result = GameMatchingService.matchPicksheetToSchedule(picksheetGames, schedule)

    expect(result.size).toBe(1)
    const match = result.get(1)
    expect(match).toBeDefined()
    expect(match!.confidence).toBe(1.0)
    expect(match!.game).toEqual(picksheetGames[0])
  })

  it('no-match: unrelated team names produce no entry in the result map', () => {
    const schedule = [makeSchedule()]
    const picksheetGames: SourceGame[] = [
      { homeTeam: 'Zzyzx Monsters', awayTeam: 'Qwerty Raptors' },
    ]

    const result = GameMatchingService.matchPicksheetToSchedule(picksheetGames, schedule)

    expect(result.size).toBe(0)
  })

  it('fuzzy/near-miss: abbreviated/alias team names resolve via entity resolution at 0.95 confidence', () => {
    const schedule = [makeSchedule()]
    // "Bills" and "Dolphins" are known aliases for "Buffalo Bills" / "Miami Dolphins"
    // in the NFL_TEAM_MAPPINGS table, so they resolve via alias match (not an exact
    // string match) and both sides resolve to the same canonical name.
    const picksheetGames: SourceGame[] = [
      { homeTeam: 'Bills', awayTeam: 'Dolphins' },
    ]

    const result = GameMatchingService.matchPicksheetToSchedule(picksheetGames, schedule)

    expect(result.size).toBe(1)
    const match = result.get(1)
    expect(match).toBeDefined()
    expect(match!.confidence).toBeCloseTo(0.95, 10)
  })

  it('partial/near-miss: substring team names below alias resolution match at the 0.75 threshold', () => {
    const schedule = [
      makeSchedule({
        match_number: 2,
        home_team: 'Zzyzx Monsters United',
        away_team: 'Qwerty Raptors United',
      }),
    ]
    // Neither team is a known NFL/NCAAF alias, so entity resolution returns no
    // match on both sides and the service falls back to substring containment,
    // which is the minimum accepted threshold (0.75).
    const picksheetGames: SourceGame[] = [
      { homeTeam: 'Zzyzx Monsters', awayTeam: 'Qwerty Raptors' },
    ]

    const result = GameMatchingService.matchPicksheetToSchedule(picksheetGames, schedule)

    expect(result.size).toBe(1)
    const match = result.get(2)
    expect(match).toBeDefined()
    expect(match!.confidence).toBe(0.75)
  })
})

describe('GameMatchingService.matchMarketToSchedule', () => {
  it('exact-match: matches within the same league', () => {
    const schedule = [makeSchedule()]
    const marketGames: SourceGame[] = [
      { homeTeam: 'Buffalo Bills', awayTeam: 'Miami Dolphins', spread: -2.5 },
    ]

    const result = GameMatchingService.matchMarketToSchedule(marketGames, schedule, 'NFL')

    expect(result.size).toBe(1)
    expect(result.get(1)!.confidence).toBe(1.0)
  })

  it('no-match: a league filter excludes an otherwise exact name match', () => {
    const schedule = [makeSchedule({ league: 'NCAAF' })]
    const marketGames: SourceGame[] = [
      { homeTeam: 'Buffalo Bills', awayTeam: 'Miami Dolphins', spread: -2.5 },
    ]

    const result = GameMatchingService.matchMarketToSchedule(marketGames, schedule, 'NFL')

    expect(result.size).toBe(0)
  })
})
