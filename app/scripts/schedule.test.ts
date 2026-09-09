import { describe, it, expect } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'

const run = promisify(execFile)
const APP_DIR = path.resolve(__dirname, '..')
const CLI = path.join(APP_DIR, 'scripts', 'schedule.ts')
const PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.officefootballpool.fetch-picksheet.plist')

/**
 * These lock two failures that were live in an installed agent, both of which
 * fail *silently* on a Thursday rather than at install time:
 *
 *  1. The plist baked in `process.execPath` — the interpreter that happened to
 *     run the installer, which was a tool-managed node under ~/.hermes rather
 *     than the user's. launchd would fail the day that directory moved.
 *  2. APP_URL was optional, so a scheduled run wrote `parsing` and skipped the
 *     refresh, leaving the dashboard blank with the run reporting SUCCESS.
 */
async function schedule(args: string[], env: Record<string, string> = {}) {
  return run('npx', ['tsx', CLI, ...args], {
    cwd: APP_DIR,
    env: { ...process.env, ...env },
  }).catch((e: { stdout?: string; stderr?: string }) => ({
    stdout: e.stdout ?? '',
    stderr: e.stderr ?? '',
  }))
}

describe('schedule install preflight', () => {
  it('refuses to install without APP_URL, naming it', async () => {
    const { stdout, stderr } = await schedule(['install'], { APP_URL: '' })
    expect(`${stdout}${stderr}`).toMatch(/APP_URL/)
    // and it must not have written a plist
    const exists = await fs.access(PLIST).then(() => true, () => false)
    expect(exists).toBe(false)
  })

  it('bakes an absolute node path that exists on disk', async () => {
    await schedule(['install'], { APP_URL: 'https://example.invalid' })
    try {
      const plist = await fs.readFile(PLIST, 'utf8')
      const nodePath = plist.match(/<string>(\/[^<]*\/node)<\/string>/)?.[1]
      expect(nodePath, 'plist should name an absolute node binary').toBeTruthy()
      expect(path.isAbsolute(nodePath!)).toBe(true)
      await expect(fs.access(nodePath!)).resolves.toBeUndefined()

      // The installer's own interpreter is not a safe choice: under a tool-managed
      // runtime it points into a directory that gets replaced on update.
      const { stdout } = await run(process.env.SHELL || '/bin/zsh', ['-lc', 'command -v node'])
      expect(nodePath).toBe(stdout.trim().split('\n').pop()!.trim())
    } finally {
      await schedule(['uninstall'])
    }
  })
})
