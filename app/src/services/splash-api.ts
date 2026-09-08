/**
 * Client for the Splash Sports contests API (contests.app.splashsports.com).
 *
 * Auth model:
 *  - The cookie named `accessToken` is a Cognito ID token (`token_use: "id"`),
 *    valid 60 minutes.
 *  - Cognito InitiateAuth is unusable here (the app client has a secret), so
 *    refresh goes through Splash's backend.
 *  - `POST /universal-auth/refresh` requires BOTH tokens in the body and
 *    returns a fresh access token in the response body, not via Set-Cookie.
 *    The stored access token must therefore be kept even once expired.
 *  - `refreshToken` is the durable credential (~30 days); re-login is monthly.
 */

import { z } from 'zod'

const AUTH_BASE = 'https://api.auth.splashsports.com'
const API_BASE = 'https://api.splashsports.com/contests-service-v2/api'
const ORIGIN = 'https://contests.app.splashsports.com'

// The SPA sends these; the API rejects or degrades without the version header.
const CLIENT_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  Origin: ORIGIN,
  Referer: `${ORIGIN}/`,
  'splash-accept-version': '1',
  'x-app-platform': 'web',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
}

// ============================================================================
// Schemas — validate at the boundary; everything downstream is typed.
// ============================================================================

const TeamSchema = z.object({
  id: z.string(),
  alias: z.string(),
  name: z.string(),
  score: z.number().nullable().optional(),
  /** Points; negative = favoured. Null before the line is posted. */
  spread: z.number().nullable(),
  /** Percentage 0-100, as published by the pool (NOT 0-1). */
  winProbability: z.number().nullable(),
  record: z.object({ wins: z.number(), losses: z.number(), ties: z.number() }).nullable().optional(),
  top25Ranking: z.number().nullable().optional()
})

const GameSchema = z.object({
  gameId: z.string(),
  startsAt: z.string(),
  lockAt: z.string().nullable().optional(),
  status: z.string(),
  league: z.string(),
  home: TeamSchema,
  away: TeamSchema,
  totalsEnabled: z.boolean().optional(),
  total: z.number().nullable().optional(),
  isMustPickTeam: z.boolean().optional(),
  isTiebreakerGame: z.boolean().optional(),
  possiblePoints: z.unknown().optional()
})

const PicksheetSchema = z.object({
  contestId: z.string(),
  slateId: z.string(),
  entryId: z.string().nullable().optional(),
  picksheetAvailable: z.boolean().optional(),
  slateFullyLockedAt: z.string().nullable().optional(),
  leagueMinimums: z.array(z.object({ league: z.string(), minimum: z.number() })).optional(),
  games: z.array(GameSchema)
})

const SlateSchema = z.object({
  id: z.string(),
  contestId: z.string(),
  name: z.string(),
  abbreviation: z.string(),
  status: z.string(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  pickLockDate: z.string().nullable().optional(),
  spreadLocksAt: z.string().nullable().optional(),
  isCurrentSlate: z.boolean().optional(),
  isLocked: z.boolean().optional(),
  spreadIsLocked: z.boolean().optional(),
  gameCount: z.number().optional()
})

/** The slates endpoint is paginated: `{ data, offset, limit, total }`. */
const SlatesResponseSchema = z.object({
  data: z.array(SlateSchema),
  offset: z.number().optional(),
  limit: z.number().optional(),
  total: z.number().optional()
})

const RefreshSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().optional()
})

export type SplashTeam = z.infer<typeof TeamSchema>
export type SplashGame = z.infer<typeof GameSchema>
export type SplashPicksheet = z.infer<typeof PicksheetSchema>
export type SplashSlate = z.infer<typeof SlateSchema>

export interface SplashTokens {
  accessToken: string
  refreshToken: string
}

/** Thrown when the API rejects our credentials; the fix is `npm run login`. */
export class SplashAuthError extends Error {}

/** Some responses are bare, others wrapped in `{ data: ... }`. Normalize. */
function unwrap(body: unknown): unknown {
  // `in` narrows the property to `unknown` on its own — no assertion needed,
  // and the zod parse downstream is what actually establishes the shape.
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data
  }
  return body
}

async function request(url: string, accessToken: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { ...CLIENT_HEADERS, Authorization: `Bearer ${accessToken}` }
  })

  if (res.status === 401 || res.status === 403) {
    throw new SplashAuthError(
      `Splash API returned ${res.status} for ${new URL(url).pathname}. ` +
      `The session is missing, expired, or not an entrant of this contest. ` +
      `Refresh it with: npm run login`
    )
  }
  if (!res.ok) {
    throw new Error(`Splash API ${res.status} for ${new URL(url).pathname}: ${(await res.text()).slice(0, 200)}`)
  }
  return res.json()
}

// ============================================================================
// API
// ============================================================================

/**
 * Exchange the stored token pair for a fresh access token.
 *
 * Both tokens are required — the endpoint rejects a request carrying only the
 * refresh token, which is also why the stored access token must never be
 * dropped from the session even once it has expired.
 */
export async function refreshAccessToken(tokens: SplashTokens): Promise<string> {
  const res = await fetch(`${AUTH_BASE}/universal-auth/refresh`, {
    method: 'POST',
    headers: { ...CLIENT_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
  })

  if (!res.ok) {
    throw new SplashAuthError(
      `Token refresh failed (${res.status}). The refresh token is likely expired ` +
      `(Cognito refresh tokens last ~30 days). Re-authenticate with: npm run login`
    )
  }
  return RefreshSchema.parse(unwrap(await res.json())).accessToken
}

/**
 * All slates (weeks) for a contest, in schedule order.
 *
 * The endpoint is paginated (server default `limit` 20); this follows `offset`
 * until `total` is collected, so callers always get every slate.
 *
 * @param pageSize optional explicit page size; omit to use the server default.
 */
export async function getSlates(
  accessToken: string,
  contestId: string,
  pageSize?: number
): Promise<SplashSlate[]> {
  const collected: SplashSlate[] = []
  let offset = 0

  // Bounded: guards against a server that never advances `offset`.
  for (let page = 0; page < 50; page++) {
    const qs = new URLSearchParams({ contestId, offset: String(offset) })
    if (pageSize !== undefined) qs.set('limit', String(pageSize))

    const parsed = SlatesResponseSchema.parse(
      await request(`${API_BASE}/contests/slates?${qs}`, accessToken)
    )
    collected.push(...parsed.data)

    const total = parsed.total ?? collected.length
    if (parsed.data.length === 0 || collected.length >= total) break
    offset = collected.length
  }

  return collected
}

/**
 * The slate the pool itself considers current.
 *
 * This is the pool's own authority on which week is live, and replaces the
 * ESPN-derived week arithmetic for pick purposes — no preseason/postseason
 * edge cases, no magic weekId reference point.
 */
export async function getCurrentSlate(accessToken: string, contestId: string): Promise<SplashSlate | null> {
  const slates = await getSlates(accessToken, contestId)
  return slates.find(s => s.isCurrentSlate) ?? null
}

export async function getPicksheet(
  accessToken: string,
  params: { contestId: string; slateId: string; entryId: string }
): Promise<SplashPicksheet> {
  const qs = new URLSearchParams({
    contestId: params.contestId,
    slateId: params.slateId,
    entryId: params.entryId
  })
  return PicksheetSchema.parse(unwrap(await request(`${API_BASE}/team-pickem/picksheets?${qs}`, accessToken)))
}

// ============================================================================
// Adaptation to the existing pipeline shape
// ============================================================================

export interface NormalizedPoolGame {
  gameId: string
  /**
   * Matches the union used by comparison-engine / entity-resolution /
   * game-matching-service ('NCAAF', not 'NCAA' — schedule-service and
   * week-detector use 'NCAA', which is a separate, pre-existing split).
   */
  league: 'NFL' | 'NCAAF'
  gameTime: string
  /** Splash team names. NFL is nickname-only; CFB is the school name. */
  homeTeam: string
  awayTeam: string
  homeAlias: string
  awayAlias: string
  /** Home-perspective spread, matching the pipeline's convention. */
  spread: number | null
  /** 0-1, converted from the API's 0-100. */
  homeWinProbability: number | null
  isMustPick: boolean
  isTiebreaker: boolean
}

/**
 * Map API games onto the pipeline's vocabulary.
 *
 * Games without a posted spread are kept with `spread: null` rather than
 * dropped, so callers can distinguish "no line yet" from "game missing".
 */
export function normalizeGames(picksheet: SplashPicksheet): NormalizedPoolGame[] {
  return picksheet.games.map(g => ({
    gameId: g.gameId,
    league: g.league.toLowerCase() === 'nfl' ? ('NFL' as const) : ('NCAAF' as const),
    gameTime: g.startsAt,
    homeTeam: g.home.name,
    awayTeam: g.away.name,
    homeAlias: g.home.alias,
    awayAlias: g.away.alias,
    spread: g.home.spread,
    homeWinProbability: g.home.winProbability === null ? null : g.home.winProbability / 100,
    isMustPick: g.isMustPickTeam ?? false,
    isTiebreaker: g.isTiebreakerGame ?? false
  }))
}

/**
 * Adapt to the `SourceGame` shape the matcher and comparison engine consume.
 *
 * Entity resolution is still required: Splash ids are canonical only within
 * Splash, and the pipeline's real join is pool <-> market. NFL team names here
 * are nickname-only ("Seahawks") whereas the market side is city-qualified
 * ("Seattle Seahawks"). CFB uses unambiguous school names.
 */
export function toSourceGames(
  picksheet: SplashPicksheet
): Array<{ homeTeam: string; awayTeam: string; spread?: number; league?: 'NFL' | 'NCAAF'; gameTime?: string; gameId?: string }> {
  return normalizeGames(picksheet).map(g => ({
    homeTeam: g.homeTeam,
    awayTeam: g.awayTeam,
    spread: g.spread ?? undefined,
    league: g.league,
    gameTime: g.gameTime,
    gameId: g.gameId
  }))
}
