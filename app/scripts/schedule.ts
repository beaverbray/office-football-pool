#!/usr/bin/env npx tsx
/**
 * Install / remove the weekly picksheet fetch as a macOS launchd agent.
 *
 * GitHub-hosted runners cannot do this job: Splash rejects datacenter source
 * IPs with a 403 FIREWALL_ERROR in their own middleware, ahead of auth (an
 * identical request from a residential IP reaches auth and returns 401). So
 * the fetch has to run from this machine.
 *
 *   npm --prefix app run schedule:install
 *   npm --prefix app run schedule:status
 *   npm --prefix app run schedule:uninstall
 *
 * launchd re-runs a missed StartCalendarInterval once the machine wakes, so a
 * Mac asleep at the scheduled time still fetches — just later.
 */

import 'dotenv/config'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

const LABEL = 'com.officefootballpool.fetch-picksheet'
const APP_DIR = path.resolve(__dirname, '..')
const PLIST_PATH = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
const LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'office-football-pool')

// Thursday 18:00 local — matches the old cron (Fri 02:00 UTC), before TNF.
const WEEKDAY = 4
const HOUR = 18
const MINUTE = 0

function buildPlist(nodePath: string, tsxCli: string, script: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <!-- Absolute paths: launchd provides almost no PATH. -->
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${tsxCli}</string>
    <string>${script}</string>
  </array>

  <!-- dotenv reads .env relative to cwd. -->
  <key>WorkingDirectory</key>
  <string>${APP_DIR}</string>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key><integer>${WEEKDAY}</integer>
    <key>Hour</key><integer>${HOUR}</integer>
    <key>Minute</key><integer>${MINUTE}</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>${path.join(LOG_DIR, 'fetch.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(LOG_DIR, 'fetch.error.log')}</string>

  <key>RunAtLoad</key>
  <false/>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
`
}

/**
 * The node the *user's* shell resolves — not `process.execPath`.
 *
 * The installer may itself be run by some tool-managed interpreter living in a
 * directory that gets replaced on update (this bit once, baking in a path under
 * ~/.hermes). launchd would then fail silently every Thursday. A login shell
 * reproduces the PATH the user actually maintains.
 */
async function resolveNode(): Promise<string> {
  const shell = process.env.SHELL || '/bin/zsh'
  const { stdout } = await run(shell, ['-lc', 'command -v node']).catch(() => ({ stdout: '' }))
  const resolved = stdout.trim().split('\n').pop()?.trim()
  if (!resolved) {
    throw new Error(
      `Could not resolve node from a login shell (${shell} -lc 'command -v node').\n` +
      `  launchd needs an absolute path; ensure node is on your login PATH.`
    )
  }
  try { await fs.access(resolved) } catch { throw new Error(`Resolved node does not exist: ${resolved}`) }
  return resolved
}

async function install(): Promise<void> {
  const nodePath = await resolveNode()
  const tsxCli = path.join(APP_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  const script = path.join(APP_DIR, 'scripts', 'fetch-picksheet-api.ts')

  for (const [label, p] of [['tsx', tsxCli], ['script', script]] as const) {
    try { await fs.access(p) } catch { throw new Error(`Cannot find ${label} at ${p}`) }
  }

  // Fail before installing rather than every Thursday at 18:00.
  const missing = ['SPLASH_CONTEST_ID', 'SPLASH_ENTRY_ID', 'SUPABASE_SERVICE_ROLE_KEY']
    .filter(k => !process.env[k])
  if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push('SUPABASE_URL')
  // APP_URL is required for a scheduled run specifically. Without it the fetch
  // writes `parsing` and returns without triggering /api/refresh-all, leaving
  // `pipeline_data` with no `comparison` — the dashboard renders blank until
  // somebody POSTs the refresh by hand. A half-completed pipeline on a timer
  // is worse than a loud failure.
  if (!process.env.APP_URL) missing.push('APP_URL')
  if (missing.length) {
    throw new Error(
      `Missing from app/.env: ${missing.join(', ')}\n` +
      `  The agent runs with .env as its only configuration, so add them there first.`
    )
  }

  await fs.mkdir(LOG_DIR, { recursive: true })
  await fs.mkdir(path.dirname(PLIST_PATH), { recursive: true })
  await fs.writeFile(PLIST_PATH, buildPlist(nodePath, tsxCli, script))

  const uid = process.getuid?.() ?? 0
  // bootout first so re-installing picks up changes.
  await run('launchctl', ['bootout', `gui/${uid}/${LABEL}`]).catch(() => { /* not loaded */ })
  await run('launchctl', ['bootstrap', `gui/${uid}`, PLIST_PATH])

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  console.log('Installed launchd agent')
  console.log(`  label   : ${LABEL}`)
  console.log(`  plist   : ${PLIST_PATH}`)
  console.log(`  runs    : ${days[WEEKDAY]}s at ${String(HOUR).padStart(2, '0')}:${String(MINUTE).padStart(2, '0')} local`)
  console.log(`  logs    : ${path.join(LOG_DIR, 'fetch.log')}`)
  console.log('')
  console.log('Run it now without waiting:')
  console.log(`  launchctl kickstart -p gui/${uid}/${LABEL}`)
}

async function uninstall(): Promise<void> {
  const uid = process.getuid?.() ?? 0
  await run('launchctl', ['bootout', `gui/${uid}/${LABEL}`]).catch(() => { /* not loaded */ })
  await fs.rm(PLIST_PATH, { force: true })
  console.log(`Removed ${LABEL} and ${PLIST_PATH}`)
}

async function status(): Promise<void> {
  const uid = process.getuid?.() ?? 0
  let installed = true
  try { await fs.access(PLIST_PATH) } catch { installed = false }
  console.log(`plist    : ${installed ? PLIST_PATH : '(not installed)'}`)

  const { stdout } = await run('launchctl', ['print', `gui/${uid}/${LABEL}`]).catch(() => ({ stdout: '' }))
  if (!stdout) {
    console.log('launchd  : not loaded')
  } else {
    // launchd prints "state = not running" / "last exit code = (never)" —
    // capture to end of line, not the first token.
    const state = stdout.match(/state = (.+)/)?.[1]?.trim() ?? 'unknown'
    const last = stdout.match(/last exit code = (.+)/)?.[1]?.trim() ?? 'n/a'
    console.log(`launchd  : loaded (state: ${state}, last exit code: ${last})`)
  }

  const logFile = path.join(LOG_DIR, 'fetch.log')
  const log = await fs.readFile(logFile, 'utf8').catch(() => '')
  console.log(`log      : ${log ? logFile : '(no runs yet)'}`)
  if (log) console.log(log.trimEnd().split('\n').slice(-6).map(l => `  ${l}`).join('\n'))
}

const action = process.argv[2]
const actions: Record<string, () => Promise<void>> = { install, uninstall, status }
const chosen = actions[action]

if (!chosen) {
  console.error(`Usage: schedule.ts <install|uninstall|status>`)
  process.exit(1)
}

chosen().catch(error => {
  console.error('Failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
