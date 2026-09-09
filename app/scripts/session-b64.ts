#!/usr/bin/env npx tsx
/**
 * Emit the saved session as base64, for the PICKSHEET_SESSION_B64 secret.
 *
 * No browser. If you already have a working `.picksheet-session.json` there is
 * no reason to sit through the sign-in and reCAPTCHA again just to produce the
 * secret — `npm run login -- --print-b64` does that only as part of the
 * interactive flow.
 *
 * Verifies before printing, so a dead session can't be published as a secret:
 * both tokens present, refresh succeeds, and (if SPLASH_CONTEST_ID is set) the
 * contest is reachable.
 *
 *   npm --prefix app run session:b64
 *   npm -s --prefix app run session:b64 -- --quiet | gh secret set PICKSHEET_SESSION_B64
 *
 * --quiet prints only the base64, so it can be piped. Note the `-s`: without
 * it `npm run` writes its banner to stdout and the secret is stored corrupt.
 */

import 'dotenv/config'
import { promises as fs } from 'node:fs'
import { loadSession, describeSessionAge, DEFAULT_SESSION_PATH } from './lib/session'
import { refreshAccessToken, getSlates } from '@/services/splash-api'

async function main(): Promise<void> {
  const quiet = process.argv.slice(2).includes('--quiet')
  const log = (msg: string) => { if (!quiet) console.error(msg) }

  const session = await loadSession()
  if (!session) {
    throw new Error(`No session at ${DEFAULT_SESSION_PATH}. Create one with: npm run login`)
  }

  const accessToken = session.cookies.find(c => c.name === 'accessToken')?.value
  const refreshToken = session.cookies.find(c => c.name === 'refreshToken')?.value
  if (!accessToken || !refreshToken) {
    throw new Error('Saved session has no Splash tokens. Re-run: npm run login')
  }

  log(`Session: ${DEFAULT_SESSION_PATH} (${describeSessionAge(session).text})`)

  // Verify rather than assume — publishing a dead secret just moves the failure
  // into CI, where it is slower to diagnose.
  const token = await refreshAccessToken({ accessToken, refreshToken })
  log('  refresh: OK')

  const contestId = process.env.SPLASH_CONTEST_ID
  if (contestId) {
    const slates = await getSlates(token, contestId)
    const current = slates.find(s => s.isCurrentSlate)
    log(`  contest: OK — ${slates.length} slates${current ? `, current ${current.abbreviation}` : ''}`)
  } else {
    log('  contest: skipped (SPLASH_CONTEST_ID not set)')
  }

  const b64 = Buffer.from(await fs.readFile(DEFAULT_SESSION_PATH, 'utf8')).toString('base64')

  if (quiet) {
    process.stdout.write(b64)
    return
  }

  console.error('')
  console.error('Set the secret with:')
  console.error('  npm -s --prefix app run session:b64 -- --quiet | gh secret set PICKSHEET_SESSION_B64')
  console.error('')
  console.log(b64)
}

main().catch(error => {
  console.error('Failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
