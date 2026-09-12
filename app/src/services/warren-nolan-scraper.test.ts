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
