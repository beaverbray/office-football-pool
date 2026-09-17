/**
 * Is the saved picksheet still about games that have yet to be played?
 *
 * /api/refresh-all re-prices whatever slate is already in afbp.pipeline_current;
 * it cannot pull a new one, because Splash rejects datacenter source IPs and the
 * route runs on Vercel. Once every saved game has kicked off, The Odds API feed
 * (which only carries upcoming events) shares nothing with the slate, matching
 * returns 0, and the pipeline throws "No games could be matched" — a true
 * statement about the wrong subject, roughly 60s and one Odds API call later.
 *
 * Observed live on 2026-09-16: the saved slate was "NFL Week 1 | CFB Week 2"
 * (65 games, last kickoff 2026-09-15T00:15Z) while the odds feed started at
 * 2026-09-17T23:30Z. The pool had posted the new slate on the Tuesday; the
 * picksheet fetch was not due to run until the Thursday.
 */

export interface SlateFreshness {
  /** Games in the saved picksheet. */
  total: number
  /** Of those, how many carry a kickoff time at all. */
  timed: number
  /** Of the timed ones, how many have yet to kick off. */
  upcoming: number
  /** Latest kickoff in the slate, ISO, or null when no game carries a time. */
  lastKickoff: string | null
  /** Every timed game has kicked off: refreshing cannot match anything. */
  expired: boolean
}

interface TimedGame {
  gameTime?: string | null
}

export function assessSlate(games: TimedGame[], now: number = Date.now()): SlateFreshness {
  let timed = 0
  let upcoming = 0
  let last = Number.NEGATIVE_INFINITY

  for (const game of games) {
    if (!game?.gameTime) continue
    const kickoff = Date.parse(game.gameTime)
    if (Number.isNaN(kickoff)) continue
    timed++
    if (kickoff > now) upcoming++
    if (kickoff > last) last = kickoff
  }

  return {
    total: games.length,
    timed,
    upcoming,
    lastKickoff: last === Number.NEGATIVE_INFINITY ? null : new Date(last).toISOString(),
    // Unparseable or absent kickoffs must not condemn a slate: an older
    // picksheet format without gameTime is unknowable, not stale, and the
    // pipeline can still match it on team names.
    expired: timed > 0 && upcoming === 0
  }
}
