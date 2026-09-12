/**
 * Deep links to the matchup page for a given game.
 *
 * Matchups are addressed by opaque numeric id — /sport/football/nfl/matchup/
 * 379928 — with no derivable slug. Guessed URLs like
 * /nfl/seattle-new-england-odds return HTTP 200 with a generic landing page,
 * so a naive check calls them valid; they are soft 404s.
 *
 * The ids ARE discoverable: each matchup anchor on the league odds page sits
 * beside both teams' logos, whose filenames carry the same alias the pool
 * uses. Measured live: 32 of 32 NFL matchups resolved to exactly two aliases,
 * agreed independently by a byte-window parse and a DOM walk.
 *
 * Ids are read from oddsshark.com but LINKED to covers.com, which is where
 * those ids actually render. OddsShark now redirects into Covers and serves an
 * identical 520,636-byte shell for every matchup id — including a nonsense one
 * — so every link would have opened the same landing page. Covers returns a
 * distinct page per id (823KB / 755KB / 985KB for three different games, 1
 * byte for a bogus id) with `<h1>Patriots vs Seahawks</h1>`, which is how the
 * destination was actually confirmed rather than assumed.
 */

/** Where the odds pages, and therefore the matchup ids, are listed. */
const ID_SOURCE = 'https://www.oddsshark.com'
/** Where those ids resolve to a real page. */
const MATCHUP_HOST = 'https://www.covers.com'

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
    const res = await fetch(`${ID_SOURCE}${odds}`, {
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
    links.set(matchupKey(a, b), `${MATCHUP_HOST}/sport/${sport}/matchup/${id}`)
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
