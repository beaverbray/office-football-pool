import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { missingConfig, buildPlist, resolveNode, AGENTS, type AgentSpec } from './schedule'

/**
 * These lock two failures that were live in an installed agent, both of which
 * would fail *silently* on a Thursday rather than at install time:
 *
 *  1. The plist baked in `process.execPath` — whichever interpreter ran the
 *     installer, which was a tool-managed node under ~/.hermes rather than the
 *     user's. launchd would break the day that directory was replaced.
 *  2. APP_URL was optional, so a scheduled run wrote `parsing`, skipped the
 *     refresh, and left the dashboard blank while reporting SUCCESS.
 *
 * Deliberately pure: an earlier version of this file ran `launchctl bootstrap`
 * for real, which deleted the user's actual agent and could not run on the
 * ubuntu CI runner at all. Tests must not mutate machine state.
 */

const BASE = {
  SPLASH_CONTEST_ID: 'contest_x',
  SPLASH_ENTRY_ID: 'entry_x',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  SUPABASE_URL: 'https://db.example',
  APP_URL: 'https://app.example',
  ODDS_API_KEY: 'odds_x',
}

describe('missingConfig', () => {
  it('accepts a complete environment', () => {
    expect(missingConfig(BASE)).toEqual([])
  })

  it('requires APP_URL, without which a live run half-completes', () => {
    expect(missingConfig({ ...BASE, APP_URL: undefined })).toEqual(['APP_URL'])
  })

  it('accepts NEXT_PUBLIC_SUPABASE_URL in place of SUPABASE_URL', () => {
    const env = { ...BASE, SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_URL: 'https://db.example' }
    expect(missingConfig(env)).toEqual([])
  })

  it('names every gap at once rather than one per attempt', () => {
    expect(missingConfig({}).sort()).toEqual(
      ['APP_URL', 'ODDS_API_KEY', 'SPLASH_CONTEST_ID', 'SPLASH_ENTRY_ID', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'].sort()
    )
  })
})

describe('buildPlist', () => {
  const agent: AgentSpec = {
    label: 'com.example.job', script: 'job.ts',
    runs: [{ weekday: 4, hour: 18, minute: 0 }, { weekday: 2, hour: 9, minute: 30 }],
    requires: [], why: 'test'
  }
  const plist = buildPlist(agent, '/opt/node/bin/node', '/app/tsx.mjs', '/app/fetch.ts', '/logs')

  it('schedules every declared run time, not just the first', () => {
    // StartCalendarInterval must be an <array> of dicts here. As a bare dict
    // launchd keeps one time and the second run never fires — silently, on a
    // job that only proves itself once a week.
    const block = plist.match(/<key>StartCalendarInterval<\/key>\s*<array>([\s\S]*?)<\/array>/)
    expect(block).not.toBeNull()
    const times = [...block![1].matchAll(/<key>Weekday<\/key><integer>(\d+)<\/integer>\s*<key>Hour<\/key><integer>(\d+)<\/integer>\s*<key>Minute<\/key><integer>(\d+)<\/integer>/g)]
      .map(m => m.slice(1).join(':'))
    expect(times).toEqual(['4:18:0', '2:9:30'])
  })

  it('gives each agent its own label and log files', () => {
    expect(plist).toContain('<string>com.example.job</string>')
    expect(plist).toContain('/logs/job.log')
    expect(plist).toContain('/logs/job.error.log')
  })

  it('invokes node by absolute path, since launchd supplies almost no PATH', () => {
    const args = [...plist.matchAll(/<array>([\s\S]*?)<\/array>/g)][0][1]
    const paths = [...args.matchAll(/<string>([^<]+)<\/string>/g)].map(m => m[1])
    expect(paths).toEqual(['/opt/node/bin/node', '/app/tsx.mjs', '/app/fetch.ts'])
    for (const p of paths) expect(path.isAbsolute(p)).toBe(true)
  })

  it('does not leave RunAtLoad true, which would fetch on every login', () => {
    expect(plist).toMatch(/<key>RunAtLoad<\/key>\s*<false\/>/)
  })
})

describe('resolveNode', () => {
  it('returns an existing absolute path from the login shell, not the installer runtime', async () => {
    const resolved = await resolveNode()
    expect(path.isAbsolute(resolved)).toBe(true)
    await expect(fs.access(resolved)).resolves.toBeUndefined()
  })
})

describe('agent table', () => {
  it('schedules the odds snapshot before every picksheet fetch in the week', () => {
    // OPEN means the Tuesday-morning line. If the snapshot ran after a fetch
    // there would be no earlier observation than that fetch, and the column
    // would be showing a later line labelled as an opening one. Compared as
    // minutes-into-the-week because the fetch now also runs on Tuesday, so
    // weekday alone no longer separates them.
    const minuteOfWeek = (r: { weekday: number; hour: number; minute: number }) =>
      r.weekday * 1440 + r.hour * 60 + r.minute
    const snapshot = AGENTS.find(a => a.script === 'snapshot-odds.ts')!
    const fetch = AGENTS.find(a => a.script === 'fetch-picksheet-api.ts')!
    const earliestSnapshot = Math.min(...snapshot.runs.map(minuteOfWeek))
    for (const r of fetch.runs) {
      expect(earliestSnapshot).toBeLessThan(minuteOfWeek(r))
    }
  })

  it('fetches the picksheet early in the week, not only before Thursday kickoff', () => {
    // The pool posts the new slate early in the week. Fetching only on
    // Thursday left the saved slate finished-and-unmatchable for days, which
    // is what /api/refresh-all reports as an expired slate (observed
    // 2026-09-16 against a saved "NFL Week 1 | CFB Week 2").
    const fetch = AGENTS.find(a => a.script === 'fetch-picksheet-api.ts')!
    expect(Math.min(...fetch.runs.map(r => r.weekday))).toBeLessThanOrEqual(2)
    // And still covers Thursday, before the first kickoff of the slate.
    expect(fetch.runs.some(r => r.weekday === 4)).toBe(true)
  })

  it('gives every agent a distinct label, so one cannot overwrite another plist', () => {
    const labels = AGENTS.map(a => a.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('does not require picksheet credentials for the odds snapshot', () => {
    // The snapshot only needs Supabase; demanding SPLASH_*/APP_URL would block
    // installing it on a machine that only records lines.
    const snapshot = AGENTS.find(a => a.script === 'snapshot-odds.ts')!
    expect(snapshot.requires).not.toContain('SPLASH_CONTEST_ID')
    expect(snapshot.requires).not.toContain('APP_URL')
    expect(missingConfig({ SUPABASE_SERVICE_ROLE_KEY: 'k', SUPABASE_URL: 'u', ODDS_API_KEY: 'x' }, snapshot.requires)).toEqual([])
  })
})

describe('config aliases', () => {
  it('accepts either name for the Odds API key', () => {
    // getOddsAPI() throws unless one of these is set. The snapshot agent's
    // preflight previously omitted the key entirely, so it reported "all clear"
    // while the Tuesday job would have died at 09:00 — the exact failure the
    // preflight exists to prevent.
    const snapshot = AGENTS.find(a => a.script === 'snapshot-odds.ts')!
    expect(snapshot.requires).toContain('ODDS_API_KEY')
    const base = { SUPABASE_SERVICE_ROLE_KEY: 'k', SUPABASE_URL: 'u' }
    expect(missingConfig(base, snapshot.requires)).toEqual(['ODDS_API_KEY'])
    expect(missingConfig({ ...base, ODDS_API_KEY: 'x' }, snapshot.requires)).toEqual([])
    expect(missingConfig({ ...base, THE_ODDS_API_KEY: 'x' }, snapshot.requires)).toEqual([])
  })
})
