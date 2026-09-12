import { describe, it, expect } from 'vitest'
import { interpretPrediction } from './warren-nolan-scraper'

/**
 * Rows copied from the live predict-winners page (2026-09-12). The home cell
 * carries the spread, each team's cell carries its own win probability.
 */
const LIVE_ROWS = [
  { game: 'Elon @ Rhode Island', homeSpread: -1, awayWinProb: 46, homeWinProb: 54 },
  { game: 'Albany @ Long Island', homeSpread: 3, awayWinProb: 61, homeWinProb: 39 },
  { game: 'Wofford @ Kent State', homeSpread: 1, awayWinProb: 54, homeWinProb: 46 }
]

describe('interpretPrediction', () => {
  it('treats a negative home number as the home team being favoured', () => {
    const { predictedWinner, winProbability } = interpretPrediction(-1, 46, 54)
    expect(predictedWinner).toBe('home')
    expect(winProbability).toBe(54)
  })

  it('treats a positive home number as the away team being favoured', () => {
    const { predictedWinner, winProbability } = interpretPrediction(3, 61, 39)
    expect(predictedWinner).toBe('away')
    expect(winProbability).toBe(61)
  })

  // The defect this replaces named the underdog on every row: all 115 college
  // predictions served came back with the predicted winner below 50%.
  it('never names a winner the page gives less than an even chance', () => {
    for (const row of LIVE_ROWS) {
      const { winProbability } = interpretPrediction(row.homeSpread, row.awayWinProb, row.homeWinProb)
      expect(winProbability, row.game).toBeGreaterThanOrEqual(50)
    }
  })

  it('reports the probability belonging to the team it names', () => {
    for (const row of LIVE_ROWS) {
      const { predictedWinner, winProbability } = interpretPrediction(
        row.homeSpread,
        row.awayWinProb,
        row.homeWinProb
      )
      const expected = predictedWinner === 'home' ? row.homeWinProb : row.awayWinProb
      expect(winProbability, row.game).toBe(expected)
    }
  })
})

describe('interpretPrediction on an even line', () => {
  // A pick'em has no sign to read. Before the tie-break it always named the
  // away team, so an even line could report a sub-50% "winner".
  it('names the more likely side when the spread is zero', () => {
    expect(interpretPrediction(0, 49, 51)).toEqual({ predictedWinner: 'home', winProbability: 51 })
    expect(interpretPrediction(0, 52, 48)).toEqual({ predictedWinner: 'away', winProbability: 52 })
  })

  it('still never names the less likely side', () => {
    for (const [away, home] of [[49, 51], [52, 48], [50, 50]]) {
      expect(interpretPrediction(0, away, home).winProbability).toBeGreaterThanOrEqual(50)
    }
  })
})
