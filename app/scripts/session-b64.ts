#!/usr/bin/env npx tsx
/**
 * Emit the saved session as base64, for the PICKSHEET_SESSION_B64 secret.
 *
 * No browser. If you already have a working `.picksheet-session.json` there is
 * no reason to sit through the sign-in and reCAPTCHA again just to produce the
 * secret — `npm run login -- --print-b64` does that only as part of the
 * interactive flow.
 *
 * Emits only the accessToken/refreshToken pair by default: GitHub caps secrets
 * at 64KB and a full session is ~139KB base64, almost all of it localStorage
 * the browserless path never reads.
 *
 * Verifies before printing, so a dead session can't be published as a secret:
 * both tokens present, refresh succeeds, and (if SPLASH_CONTEST_ID is set) the
 * contest is reachable.
 *
 *   npm --prefix app run session:b64
 *   npm --prefix app run session:b64 -- --full    # whole session (local use)
 *   npm -s --prefix app run session:b64 -- --quiet | gh secret set PICKSHEET_SESSION_B64
 *
 * --quiet prints only the base64, so it can be piped. Note the `-s`: without
 * it `npm run` writes its banner to stdout and the secret is stored corrupt.
 */

import 'dotenv/config'
import { loadSession, describeSessionAge, DEFAULT_SESSION_PATH } from './lib/session'
import { refreshAccessToken, getSlates } from '@/services/splash-api'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const quiet = args.includes('--quiet')
  // Default is tokens-only; --full emits everything for local backup/debugging.
  const full = args.includes('--full')
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

  // Emit ONLY the two tokens. GitHub caps secrets at 64KB and a full session
  // is ~139KB base64 — but 94KB of that is app.splashsports.com localStorage,
  // which the browserless CI path never reads. It restores no origins and
  // looks up exactly `accessToken` and `refreshToken`.
  const minimal = {
    savedAt: session.savedAt,
    cookies: session.cookies.filter(c => c.name === 'accessToken' || c.name === 'refreshToken'),
    origins: []
  }

  const payload = full ? JSON.stringify(session) : JSON.stringify(minimal)
  const b64 = Buffer.from(payload).toString('base64')

  if (b64.length > 64 * 1024) {
    throw new Error(
      `Encoded session is ${b64.length} bytes, over GitHub's 64KB secret limit. ` +
      (full ? 'Drop --full to emit just the tokens.' : 'This should not happen for a token-only payload.')
    )
  }

  if (quiet) {
    process.stdout.write(b64)
    return
  }

  log(`  payload: ${full ? 'full session' : 'tokens only'}, ${b64.length} bytes base64 (limit 65536)`)
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
