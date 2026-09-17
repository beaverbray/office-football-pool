import { describe, it, expect } from 'vitest'
import { assessSlate } from './picksheet-freshness'

/**
 * The live failure this guards: on 2026-09-16 afbp.pipeline_current held the
 * previous slate (65 games, last kickoff 2026-09-15T00:15Z) while the odds feed
 * started at 2026-09-17T23:30Z. /api/refresh-all ran the full pipeline and died
 * at "No games could be matched" — true, but it named the matcher rather than
 * the stale slate.
 */

const NOW = Date.parse('2026-09-16T12:00:00Z')
const game = (gameTime: string | null) => ({ gameTime })

describe('assessSlate', () => {
  it('calls a slate expired once every game has kicked off', () => {
    const result = assessSlate(
      [game('2026-09-11T00:35:00Z'), game('2026-09-13T16:00:00Z'), game('2026-09-15T00:15:00Z')],
      NOW
    )
    expect(result.expired).toBe(true)
    expect(result.timed).toBe(3)
    expect(result.upcoming).toBe(0)
    expect(result.lastKickoff).toBe('2026-09-15T00:15:00.000Z')
  })

  it('keeps a slate live while one game is still to come', () => {
    // A Thursday-night game that has already started must not condemn the rest
    // of the week: the odds feed still carries the remaining games, and the
    // refresh is exactly what re-prices them.
    const result = assessSlate([game('2026-09-11T00:35:00Z'), game('2026-09-17T23:30:00Z')], NOW)
    expect(result.expired).toBe(false)
    expect(result.upcoming).toBe(1)
  })

  it('does not condemn a slate whose games carry no usable kickoff time', () => {
    // Older picksheet formats stored no gameTime, and the matcher works on team
    // names regardless. Unknown is not stale — blocking here would make the
    // refresh unusable for that data instead of merely slow.
    const result = assessSlate([game(null), game('not a date'), {}], NOW)
    expect(result.expired).toBe(false)
    expect(result.timed).toBe(0)
    expect(result.lastKickoff).toBeNull()
  })

  it('treats an empty picksheet as unknown rather than expired', () => {
    expect(assessSlate([], NOW).expired).toBe(false)
  })
})
