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

const APP_DIR = path.resolve(__dirname, '..')
const LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'office-football-pool')
const plistPath = (label: string) => path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`)

export interface AgentSpec {
  label: string
  script: string
  /** launchd weekday: 0/7 Sunday .. 4 Thursday */
  weekday: number
  hour: number
  minute: number
  /** Env keys this agent cannot run without. */
  requires: string[]
  why: string
}

export const AGENTS: AgentSpec[] = [
  {
    label: 'com.officefootballpool.snapshot-odds',
    script: 'snapshot-odds.ts',
    // Tuesday 09:00. By Tuesday morning the previous week's results are in and
    // the injury picture has settled, so books have repriced — that repriced
    // number is what the pool is playing against, and what the dashboard's OPEN
    // column means. Without this the earliest line on record is whenever the
    // Thursday fetch ran, measured at 8.5h before kickoff: a closing line.
    weekday: 2,
    hour: 9,
    minute: 0,
    requires: ['SUPABASE_SERVICE_ROLE_KEY'],
    why: 'records the week opening lines'
  },
  {
    label: 'com.officefootballpool.fetch-picksheet',
    script: 'fetch-picksheet-api.ts',
    // Thursday 18:00 local — matches the cron this replaced (Fri 02:00 UTC),
    // before Thursday Night Football.
    weekday: 4,
    hour: 18,
    minute: 0,
    requires: ['SPLASH_CONTEST_ID', 'SPLASH_ENTRY_ID', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_URL'],
    why: 'fetches the picksheet and refreshes the pipeline'
  }
]

/**
 * Config an agent cannot run without. Pure so it can be tested against a
 * synthetic environment; the installer refuses rather than discovering a gap at
 * 18:00 on a Thursday.
 */
export function missingConfig(
  env: Record<string, string | undefined>,
  requires: string[] = AGENTS.flatMap(a => a.requires)
): string[] {
  const missing = [...new Set(requires)]
    .filter(k => k !== 'SUPABASE_URL' && !env[k])
  // .env carries the NEXT_PUBLIC_ name; the service-role client wants the bare one.
  if (!env.SUPABASE_URL && !env.NEXT_PUBLIC_SUPABASE_URL) missing.push('SUPABASE_URL')
  return missing
}

export function buildPlist(
  agent: AgentSpec,
  nodePath: string,
  tsxCli: string,
  scriptPath: string,
  logDir = LOG_DIR
): string {
  const logBase = agent.script.replace(/\.ts$/, '')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${agent.label}</string>

  <!-- Absolute paths: launchd provides almost no PATH. -->
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${tsxCli}</string>
    <string>${scriptPath}</string>
  </array>

  <!-- dotenv reads .env relative to cwd. -->
  <key>WorkingDirectory</key>
  <string>${APP_DIR}</string>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key><integer>${agent.weekday}</integer>
    <key>Hour</key><integer>${agent.hour}</integer>
    <key>Minute</key><integer>${agent.minute}</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>${path.join(logDir, `${logBase}.log`)}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(logDir, `${logBase}.error.log`)}</string>

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
export async function resolveNode(): Promise<string> {
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

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const hhmm = (a: AgentSpec) => `${String(a.hour).padStart(2, '0')}:${String(a.minute).padStart(2, '0')}`

async function install(): Promise<void> {
  const nodePath = await resolveNode()
  const tsxCli = path.join(APP_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  try { await fs.access(tsxCli) } catch { throw new Error(`Cannot find tsx at ${tsxCli}`) }

  // Check every agent's config before installing any, so a partial install
  // cannot leave one job scheduled and another silently missing.
  for (const agent of AGENTS) {
    const missing = missingConfig(process.env, agent.requires)
    if (missing.length) {
      throw new Error(
        `Missing from app/.env for ${agent.label}: ${missing.join(', ')}\n` +
        `  Agents run with .env as their only configuration, so add them there first.`
      )
    }
  }

  await fs.mkdir(LOG_DIR, { recursive: true })
  const uid = process.getuid?.() ?? 0

  for (const agent of AGENTS) {
    const scriptPath = path.join(APP_DIR, 'scripts', agent.script)
    try { await fs.access(scriptPath) } catch { throw new Error(`Cannot find script at ${scriptPath}`) }

    const plist = plistPath(agent.label)
    await fs.mkdir(path.dirname(plist), { recursive: true })
    await fs.writeFile(plist, buildPlist(agent, nodePath, tsxCli, scriptPath))

    // bootout first so re-installing picks up changes.
    await run('launchctl', ['bootout', `gui/${uid}/${agent.label}`]).catch(() => { /* not loaded */ })
    await run('launchctl', ['bootstrap', `gui/${uid}`, plist])

    console.log(`Installed ${agent.label}`)
    console.log(`  runs : ${DAYS[agent.weekday]}s at ${hhmm(agent)} local — ${agent.why}`)
    console.log(`  logs : ${path.join(LOG_DIR, agent.script.replace(/\.ts$/, '.log'))}`)
    console.log(`  now  : launchctl kickstart -p gui/${uid}/${agent.label}`)
    console.log('')
  }
}

async function uninstall(): Promise<void> {
  const uid = process.getuid?.() ?? 0
  for (const agent of AGENTS) {
    await run('launchctl', ['bootout', `gui/${uid}/${agent.label}`]).catch(() => { /* not loaded */ })
    await fs.rm(plistPath(agent.label), { force: true })
    console.log(`Removed ${agent.label}`)
  }
}

async function status(): Promise<void> {
  const uid = process.getuid?.() ?? 0
  for (const agent of AGENTS) {
    const plist = plistPath(agent.label)
    const installed = await fs.access(plist).then(() => true, () => false)
    console.log(`${agent.label}  (${DAYS[agent.weekday]}s ${hhmm(agent)})`)
    console.log(`  plist   : ${installed ? plist : '(not installed)'}`)

    const { stdout } = await run('launchctl', ['print', `gui/${uid}/${agent.label}`]).catch(() => ({ stdout: '' }))
    if (!stdout) {
      console.log('  launchd : not loaded')
    } else {
      // launchd prints "state = not running" / "last exit code = (never)" —
      // capture to end of line, not the first token.
      const state = stdout.match(/state = (.+)/)?.[1]?.trim() ?? 'unknown'
      const last = stdout.match(/last exit code = (.+)/)?.[1]?.trim() ?? 'n/a'
      console.log(`  launchd : loaded (state: ${state}, last exit code: ${last})`)
    }

    const logFile = path.join(LOG_DIR, agent.script.replace(/\.ts$/, '.log'))
    const log = await fs.readFile(logFile, 'utf8').catch(() => '')
    console.log(`  log     : ${log ? logFile : '(no runs yet)'}`)
    if (log) console.log(log.trimEnd().split('\n').slice(-4).map(l => `    ${l}`).join('\n'))
    console.log('')
  }
}

// Only dispatch when run directly. Importing this module (e.g. from tests)
// must not consume argv or exit the host process.
if (require.main === module) {
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
}
