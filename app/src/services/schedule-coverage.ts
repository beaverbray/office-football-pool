/**
 * Does this schedule describe the same slate of games as the picksheet?
 *
 * `core_schedule.date` is an unpadded US string ("9/5/25"). The explicit parse
 * below is not load-bearing today — V8 reads that form correctly, confirmed by
 * mutation-testing this against `Date.parse` — but it pins the two-digit-year
 * expansion and yields UTC rather than local midnight, so the window is not
 * silently timezone-dependent. Treat it as a stated assumption, not a guard.
 *
 * Answering by date rather than by attempting the match keeps a stale schedule
 * from costing an LLM-resolution storm before it is rejected.
 */
export function scheduleCoversPicksheet(scheduleGames: any[], picksheetGames: any[]): boolean {
  const parseScheduleDate = (raw: unknown): number | null => {
    const m = typeof raw === 'string' && raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    if (!m) return null
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])
    return Date.UTC(year, Number(m[1]) - 1, Number(m[2]))
  }

  const picksheetTimes = picksheetGames
    .map(g => Date.parse(g?.gameTime ?? g?.game_time ?? ''))
    .filter(Number.isFinite)
  // No usable dates on either side: fall through to the matching pass rather
  // than rejecting a schedule that might be fine.
  if (picksheetTimes.length === 0) return true

  const scheduleTimes = scheduleGames.map(g => parseScheduleDate(g?.date)).filter((t): t is number => t !== null)
  if (scheduleTimes.length === 0) return true

  const target = picksheetTimes.sort((a, b) => a - b)[Math.floor(picksheetTimes.length / 2)]
  const TEN_DAYS = 10 * 24 * 60 * 60 * 1000
  return scheduleTimes.some(t => Math.abs(t - target) <= TEN_DAYS)
}
