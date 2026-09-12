/**
 * Deep links to OddsShark's matchup page for a given game.
 *
 * OddsShark addresses matchups by opaque numeric id — /sport/football/nfl/
 * matchup/379928 — with no derivable slug. Guessed URLs like
 * /nfl/seattle-new-england-odds return HTTP 200 with the generic NFL landing
 * page, so a naive check would call them valid; they are soft 404s, confirmed
 * by a nonsense path returning the identical title.
 *
 * The ids are recoverable, though. Each matchup anchor on the league odds page
 * sits beside the two teams' logos, whose filenames carry the team alias —
 * exactly the alias Splash gives us. Measured on the live NFL page: 32 of 32
 * matchups resolved to precisely two aliases, none ambiguous.
 */

const ODDSSHARK = 'https://www.oddsshark.com'

/** Splash's league value to OddsShark's path segment and logo directory. */
const LEAGUE_PATHS: Record<'NFL' | 'NCAAF', { odds: string; sport: string; logos: string }> = {
  NFL: { odds: '/nfl/odds', sport: 'football/nfl', logos: 'nfl' },
  NCAAF: { odds: '/ncaaf/odds', sport: 'football/ncaaf', logos: 'ncaaf' }
}

/** Key a game by its two aliases, order-independent. */
export function matchupKey(a: string, b: string): string {
  return [a.toUpperCase(), b.toUpperCase()].sort().join('|')
}

/**
 * Scrape one league's odds page into `alias|alias -> matchup url`.
 *
 * Returns an empty map on any failure. These links are a convenience; a
 * scraping change must not break a refresh.
 */
export async function fetchMatchupLinks(
  league: 'NFL' | 'NCAAF'
): Promise<Map<string, string>> {
  const links = new Map<string, string>()
  const { odds, sport, logos } = LEAGUE_PATHS[league]

  let html: string
  try {
    const res = await fetch(`${ODDSSHARK}${odds}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        Accept: 'text/html'
      }
    })
    if (!res.ok) return links
    html = await res.text()
  } catch {
    return links
  }

  // Collect the aliases appearing near each matchup link. The anchor itself
  // wraps only a logo, so the window has to reach past it to catch both sides.
  const anchor = new RegExp(`/sport/${sport.replace('/', '\\/')}/matchup/(\\d+)`, 'g')
  const logo = new RegExp(`svg_logos/${logos}/([a-z0-9]+)\\.svg`, 'g')
  const aliasesById = new Map<string, Set<string>>()

  for (const m of html.matchAll(anchor)) {
    const id = m[1]
    const window = html.slice(Math.max(0, m.index - 150), m.index + 700)
    if (!aliasesById.has(id)) aliasesById.set(id, new Set())
    for (const l of window.matchAll(logo)) aliasesById.get(id)!.add(l[1].toUpperCase())
  }

  for (const [id, aliases] of aliasesById) {
    // Exactly two, or we cannot say which game it is. Skipping beats guessing:
    // a link to the wrong matchup is worse than no link.
    if (aliases.size !== 2) continue
    const [a, b] = [...aliases]
    links.set(matchupKey(a, b), `${ODDSSHARK}/sport/${sport}/matchup/${id}`)
  }

  return links
}

/** Both leagues, as one lookup keyed `LEAGUE:ALIAS|ALIAS`. */
export async function fetchAllMatchupLinks(): Promise<Record<string, string>> {
  const [nfl, ncaaf] = await Promise.all([
    fetchMatchupLinks('NFL'),
    fetchMatchupLinks('NCAAF')
  ])
  const out: Record<string, string> = {}
  for (const [k, v] of nfl) out[`NFL:${k}`] = v
  for (const [k, v] of ncaaf) out[`NCAAF:${k}`] = v
  return out
}
