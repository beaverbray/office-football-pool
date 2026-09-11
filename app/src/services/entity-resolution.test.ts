import { describe, it, expect } from 'vitest'
import { EntityResolver } from './entity-resolution'

/**
 * These lock three mis-resolutions found by comparing the live Splash picksheet
 * against what production displayed: 3 of 65 games never reached the board.
 *
 * Each failed differently, and none failed loudly — the resolver returned a
 * confident answer that happened to name a different school, the pair then
 * failed to join, and the game silently vanished from the dashboard.
 */
describe('EntityResolver — picksheet names that silently mis-resolved', () => {
  const r = new EntityResolver()

  it('resolves USC to the Trojans, not South Carolina', async () => {
    // 'USC' was listed as an alias of BOTH schools and the alias scan returns
    // the first hit in object order, so every "USC" became South Carolina.
    // Adding aliases could not have fixed this; the duplicate had to go.
    expect((await r.matchTeam('USC', 'NCAAF')).matchedName).toBe('USC Trojans')
  })

  it('still resolves South Carolina by its own names', async () => {
    // The fix removed one alias from South Carolina; it must remain reachable.
    expect((await r.matchTeam('South Carolina', 'NCAAF')).matchedName).toBe('South Carolina Gamecocks')
    expect((await r.matchTeam('Gamecocks', 'NCAAF')).matchedName).toBe('South Carolina Gamecocks')
  })

  it('resolves a hyphenated name to the same team as its spaced alias', async () => {
    // normalizeTeamName deleted punctuation instead of replacing it, so
    // "Louisiana-Monroe" became "louisianamonroe" and could never equal the
    // alias "Louisiana Monroe". Exact match missed, fuzzy took over, and it
    // landed on Louisiana Ragin' Cajuns — a different school.
    const hyphen = await r.matchTeam('Louisiana-Monroe', 'NCAAF')
    expect(hyphen.matchedName).toBe('UL Monroe Warhawks')
    // Exact alias, not a fuzzy near-miss that happens to land right.
    expect(hyphen.method).toBe('alias')
    expect((await r.matchTeam('Louisiana Monroe', 'NCAAF')).matchedName).toBe('UL Monroe Warhawks')
  })

  it('keeps apostrophes as elisions rather than separators', async () => {
    // The same normaliser must NOT split on apostrophes, or "Hawai'i" stops
    // matching "Hawaii" — which is how the hyphen fix could have broken a
    // name that already worked.
    // Asserting the METHOD too, not just the name. Without it this test passes
    // even when the apostrophe rule is removed, because fuzzy matching rescues
    // the name — so it would not have caught the regression it exists for.
    for (const [name, want] of [
      ["Hawai'i", 'Hawaii Rainbow Warriors'],
      ['Fresno St.', 'Fresno State Bulldogs'],
      ['Texas A&M', 'Texas A&M Aggies']
    ] as const) {
      const m = await r.matchTeam(name, 'NCAAF')
      expect(m.matchedName).toBe(want)
      expect(m.method).toBe('alias')
    }
  })

  it('resolves Sacramento State to itself, not to its opponent', async () => {
    // Sacramento State had no entry at all in the 138-team table, so fuzzy
    // matching returned Fresno State Bulldogs — the team it was playing that
    // week. A wrong answer is worse than none here: it could have joined the
    // picksheet to the wrong market game.
    expect((await r.matchTeam('Sacramento State', 'NCAAF')).matchedName).toBe('Sacramento State Hornets')
    expect((await r.matchTeam('Fresno State', 'NCAAF')).matchedName).toBe('Fresno State Bulldogs')
  })

  it('resolves nickname-only NFL names without a league hint', async () => {
    // Splash sends NFL teams by nickname alone. The live picksheet path calls
    // matchTeam without a league, so these must not need one.
    for (const [name, want] of [
      ['49ers', 'San Francisco 49ers'],
      ['Rams', 'Los Angeles Rams'],
      ['Patriots', 'New England Patriots'],
      ['Seahawks', 'Seattle Seahawks']
    ] as const) {
      expect((await r.matchTeam(name)).matchedName).toBe(want)
    }
  })
})
