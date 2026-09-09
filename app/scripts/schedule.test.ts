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
      ['APP_URL', 'SPLASH_CONTEST_ID', 'SPLASH_ENTRY_ID', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'].sort()
    )
  })
})

describe('buildPlist', () => {
  const agent: AgentSpec = {
    label: 'com.example.job', script: 'job.ts', weekday: 4, hour: 18, minute: 0,
    requires: [], why: 'test'
  }
  const plist = buildPlist(agent, '/opt/node/bin/node', '/app/tsx.mjs', '/app/fetch.ts', '/logs')

  it('schedules at the agent declared time', () => {
    expect(plist).toContain('<key>Weekday</key><integer>4</integer>')
    expect(plist).toContain('<key>Hour</key><integer>18</integer>')
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
  it('schedules the odds snapshot before the picksheet fetch in the week', () => {
    // OPEN means the Tuesday-morning line. If the snapshot ran after the fetch
    // there would be no earlier observation than Thursday evening, and the
    // column would be showing a near-closing line labelled as an opening one.
    const snapshot = AGENTS.find(a => a.script === 'snapshot-odds.ts')!
    const fetch = AGENTS.find(a => a.script === 'fetch-picksheet-api.ts')!
    expect(snapshot.weekday).toBeLessThan(fetch.weekday)
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
    expect(missingConfig({ SUPABASE_SERVICE_ROLE_KEY: 'k', SUPABASE_URL: 'u' }, snapshot.requires)).toEqual([])
  })
})
