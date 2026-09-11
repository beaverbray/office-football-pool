import { describe, it, expect } from 'vitest'
import { EntityResolver, AMBIGUOUS_ALIASES, ambiguousAliases } from './entity-resolution'

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
    expect((await r.matchTeam('SCAR', 'NCAAF')).matchedName).toBe('South Carolina Gamecocks')
    // Deliberately NOT 'Gamecocks': Jacksonville State are Gamecocks too, so
    // that alias is ambiguous and now refuses. An earlier version of this test
    // asserted it resolved to South Carolina, which was first-match-wins —
    // the very behaviour this change removes.
    expect((await r.matchTeam('Gamecocks', 'NCAAF')).confidence).toBe(0)
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

describe('ambiguous aliases refuse rather than guess', () => {
  const r = new EntityResolver()

  it('refuses abbreviations claimed by more than one school', async () => {
    // The exact scan returns the first matching entry at 0.95 confidence, so
    // for a shared alias the loser is unreachable and the caller cannot tell a
    // right answer from a wrong one. 'USC' proved that in production.
    for (const name of ['OSU', 'MSU', 'UT', 'KSU']) {
      const m = await r.matchTeam(name, 'NCAAF')
      expect(m.confidence, `${name} should not resolve`).toBe(0)
      expect(m.matchedName).toBe(name)
    }
  })

  it('refuses bare mascots shared across schools', async () => {
    // Only reachable via fuzzy today, since Splash sends school names — but
    // fuzzy is exactly what turned Sacramento State into its own opponent.
    for (const name of ['Bulldogs', 'Trojans', 'Wildcats', 'Owls']) {
      expect((await r.matchTeam(name, 'NCAAF')).confidence, name).toBe(0)
    }
  })

  it('still resolves each ambiguous abbreviation\u2019s schools by their real names', async () => {
    // Refusing the abbreviation must not make the schools unreachable.
    for (const [name, want] of [
      ['Ohio State', 'Ohio State Buckeyes'],
      ['Oklahoma State', 'Oklahoma State Cowboys'],
      ['Oregon State', 'Oregon State Beavers'],
      ['Michigan State', 'Michigan State Spartans'],
      ['Mississippi State', 'Mississippi State Bulldogs'],
      ['Texas', 'Texas Longhorns'],
      ['Tennessee', 'Tennessee Volunteers']
    ] as const) {
      expect((await r.matchTeam(name, 'NCAAF')).matchedName, name).toBe(want)
    }
  })

  it('computes ambiguity per team, not per repeated alias', () => {
    // An entry listing both 'Iowa' and 'IOWA' normalises to one key twice and
    // is NOT a collision. Counting claimants in an array rather than a Set
    // inflated an earlier survey of this table from 23 to 35.
    expect(AMBIGUOUS_ALIASES.NCAAF.has('iowa')).toBe(false)
    expect(AMBIGUOUS_ALIASES.NCAAF.has('army')).toBe(false)
    expect(AMBIGUOUS_ALIASES.NCAAF.has('duke')).toBe(false)
    // The NFL table has no shared aliases at all.
    expect(AMBIGUOUS_ALIASES.NFL.size).toBe(0)
  })

  it('does not treat a team\u2019s own official name as ambiguous', () => {
    // Tested against a synthetic table, because no real entry currently hits
    // this case — an earlier version asserted it over names that were not
    // aliases at all, so it passed no matter what the code did.
    //
    // It matters because matchTeam refuses before the official-name branch
    // runs: if an official name landed in the ambiguous set, that team would
    // become unreachable by its own name.
    // Two OTHER teams must both claim it, or the size > 1 check alone would
    // keep it out and the exclusion would go untested — which is exactly how
    // an earlier version of this test passed while proving nothing.
    const table = {
      'Miami Hurricanes': ['Canes'],
      'Miami RedHawks': ['Miami Hurricanes', 'Miami OH'],
      'Miami Ohio': ['Miami Hurricanes']
    }
    const ambiguous = ambiguousAliases(table)
    expect(ambiguous.has('miami hurricanes')).toBe(false)
  })

  it('flags an alias shared by two teams in a synthetic table', () => {
    const table = { 'A Tigers': ['Tigers', 'A'], 'B Tigers': ['Tigers', 'B'] }
    expect([...ambiguousAliases(table)]).toEqual(['tigers'])
  })

  it('does not flag one entry repeating an alias in different case', () => {
    const table = { 'Iowa Hawkeyes': ['Iowa', 'IOWA', 'Hawkeyes'] }
    expect([...ambiguousAliases(table)]).toEqual([])
  })
})

describe('ambiguity must not swallow NFL nicknames', () => {
  const r = new EntityResolver()

  it('resolves NFL nicknames that are also shared college mascots', async () => {
    // A blanket refusal checked BOTH tables, and these six are unambiguous in
    // the NFL but shared mascots in college. Splash sends NFL teams by
    // nickname with no league hint, so the first version of the ambiguity
    // guard silently dropped six real games off the board — caught only by
    // re-running the live source comparison, which fell from 63 to 62.
    for (const [name, want] of [
      ['Bears', 'Chicago Bears'],
      ['Broncos', 'Denver Broncos'],
      ['Cardinals', 'Arizona Cardinals'],
      ['Eagles', 'Philadelphia Eagles'],
      ['Falcons', 'Atlanta Falcons'],
      ['Panthers', 'Carolina Panthers']
    ] as const) {
      const m = await r.matchTeam(name)
      expect(m.matchedName, name).toBe(want)
      expect(m.confidence, name).toBeGreaterThan(0.9)
    }
  })

  it('still refuses an ambiguous college name with no league hint', async () => {
    // And must not let cross-league fuzzy rescue it: before this ordering was
    // right, "OSU" resolved to Houston Texans at 0.80 confidence — the exact
    // failure mode the guard exists to prevent, reintroduced one layer down.
    for (const name of ['OSU', 'MSU', 'UT', 'Bulldogs', 'Trojans']) {
      const m = await r.matchTeam(name)
      expect(m.confidence, name).toBe(0)
      expect(m.matchedName, name).toBe(name)
    }
  })

  it('still resolves real college names with no league hint', async () => {
    for (const [name, want] of [
      ['Ohio State', 'Ohio State Buckeyes'],
      ['Boston College', 'Boston College Eagles'],
      ['Sacramento State', 'Sacramento State Hornets']
    ] as const) {
      expect((await r.matchTeam(name)).matchedName, name).toBe(want)
    }
  })
})
