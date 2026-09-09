import { describe, it, expect } from 'vitest'
import { scheduleCoversPicksheet } from './schedule-coverage'

/**
 * `core_schedule` has no season column and no ingest anywhere in the repo, so
 * it ages out silently: week 1 returns 99 rows dated 9/5/25 while the live
 * contest is week 1 of 2026. Populated, and entirely irrelevant.
 *
 * This gate must reject by date BEFORE any matching is attempted — the failed
 * pass costs an LLM-resolution storm (176s measured live) that a warm entity
 * cache hides on a long-running server but a cold process pays in full.
 */
const wk1of2026 = [
  { gameTime: '2026-09-10T20:20:00.000Z' },
  { gameTime: '2026-09-13T17:00:00.000Z' },
]

describe('scheduleCoversPicksheet', () => {
  it('rejects a schedule from the previous season', () => {
    const stale = [{ date: '9/5/25' }, { date: '9/6/25' }, { date: '9/7/25' }]
    expect(scheduleCoversPicksheet(stale, wk1of2026)).toBe(false)
  })

  it('accepts a schedule covering the same slate', () => {
    const current = [{ date: '9/10/26' }, { date: '9/13/26' }]
    expect(scheduleCoversPicksheet(current, wk1of2026)).toBe(true)
  })

  it('parses unpadded M/D/YY rather than trusting Date parsing of that form', () => {
    // Single-digit month and day, two-digit year — the actual column format.
    expect(scheduleCoversPicksheet([{ date: '9/9/26' }], wk1of2026)).toBe(true)
  })

  it('does not reject on a near-miss within the same week', () => {
    // Schedules and picksheets disagree on kickoff dates by a day or two.
    expect(scheduleCoversPicksheet([{ date: '9/16/26' }], wk1of2026)).toBe(true)
  })

  it('rejects a schedule a full season away even with many rows', () => {
    const many = Array.from({ length: 99 }, (_, i) => ({ date: `9/${(i % 28) + 1}/25` }))
    expect(scheduleCoversPicksheet(many, wk1of2026)).toBe(false)
  })

  it('falls through to the matching pass when dates are unusable, rather than rejecting', () => {
    expect(scheduleCoversPicksheet([{ date: 'garbage' }], wk1of2026)).toBe(true)
    expect(scheduleCoversPicksheet([{ date: '9/5/25' }], [{ gameTime: undefined }])).toBe(true)
  })
})
