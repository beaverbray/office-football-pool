#!/usr/bin/env npx tsx
/**
 * One-time interactive login — creates the session that scheduled runs reuse.
 *
 * Opens a REAL (headful) browser so a human can complete the Splash Sports
 * sign-in, including the reCAPTCHA. Nothing here defeats or bypasses the
 * CAPTCHA: a person solves it. Once signed in, the resulting browser session is
 * captured to disk and `fetch-picksheet.ts` reuses it instead of logging in.
 *
 * Usage:
 *   npm run login                 # opens browser, waits for you to sign in
 *   npm run login -- --print-b64  # also print base64 for the CI secret
 *
 * Credentials in .env (OFFICE_POOL_EMAIL / OFFICE_POOL_PASSWORD) are only used
 * to pre-fill the form as a convenience — you still solve the CAPTCHA and click.
 */

import 'dotenv/config'
import { promises as fs } from 'node:fs'
import path from 'node:path'
// Plain puppeteer, deliberately NOT puppeteer-extra/stealth.
//
// Stealth exists to hide *headless* automation. Here a human drives a headful
// browser, so there is nothing to hide — and stealth's patches (spoofed
// navigator.webdriver, faked plugins, patched permissions) produce an
// internally inconsistent fingerprint that reCAPTCHA Enterprise detects. A
// patched browser looks MORE suspicious than a clean one, which is how we got
// "Wrong or expired reCaptcha" here while headless fetching still needs stealth
// to get past the CloudFront WAF. Different problems, opposite treatments.
import puppeteer from 'puppeteer'
import type { Page } from 'puppeteer'
import {
  captureSession,
  saveSession,
  DEFAULT_SESSION_PATH
} from './lib/session'
import {
  assertLooksLikePicksheet,
  PicksheetAuthError,
  PicksheetNotReadyError
} from './lib/picksheet-content'

// officefootballpool.com links to this branded sign-in URL.
const SIGN_IN_URL = 'https://app.splashsports.com/sign-in?brand=ofp'
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000
const VERIFY_WEEK_ID = 671

// Persistent profile: makes this look like a normal, returning browser rather
// than a fresh automated instance, and lets a still-valid login be reused on
// the next run instead of re-solving the CAPTCHA. Gitignored.
const PROFILE_DIR = path.resolve(process.cwd(), '.picksheet-browser-profile')

async function waitForSignIn(page: Page): Promise<void> {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS
  let lastUrl = ''

  while (Date.now() < deadline) {
    const url = page.url()
    if (url !== lastUrl) {
      console.log(`   ...currently at: ${url}`)
      lastUrl = url
    }
    if (!url.includes('/sign-in')) return
    await new Promise(resolve => setTimeout(resolve, 1500))
  }

  throw new Error(
    `Timed out after ${LOGIN_TIMEOUT_MS / 60000} minutes waiting for sign-in. ` +
    `Re-run and complete the login in the browser window.`
  )
}

async function main(): Promise<void> {
  const printB64 = process.argv.slice(2).includes('--print-b64')

  console.log('='.repeat(64))
  console.log('Interactive login — creates the session used by scheduled fetches')
  console.log('='.repeat(64))
  console.log('')

  console.log(`Browser profile: ${PROFILE_DIR}`)
  const browser = await puppeteer.launch({
    headless: false,
    // Real system Chrome, not the bundled "Chrome for Testing" build — the
    // latter is itself a recognised automation signal.
    channel: 'chrome',
    userDataDir: PROFILE_DIR,
    defaultViewport: null,
    // No --no-sandbox here: those are container workarounds that also read as
    // automation. Suppress the automation banner/flag instead.
    args: ['--window-size=1400,950', '--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation']
  })

  try {
    const page = (await browser.pages())[0] ?? (await browser.newPage())

    console.log(`Opening ${SIGN_IN_URL}`)
    await page.goto(SIGN_IN_URL, { waitUntil: 'networkidle2', timeout: 60000 })

    const accept = await page.$('.osano-cm-accept')
    if (accept) {
      await accept.click()
      await new Promise(resolve => setTimeout(resolve, 600))
    }

    // Convenience only — the human still solves the CAPTCHA and submits.
    const email = process.env.OFFICE_POOL_EMAIL
    const password = process.env.OFFICE_POOL_PASSWORD
    if (email && password) {
      try {
        await page.waitForSelector('input[type="text"]', { timeout: 10000 })
        await page.type('input[type="text"]', email, { delay: 30 })
        await page.type('input[type="password"]', password, { delay: 30 })
        console.log('Pre-filled email and password from .env')
      } catch {
        console.log('(could not pre-fill the form — enter credentials manually)')
      }
    }

    console.log('')
    console.log('-'.repeat(64))
    console.log('  ACTION REQUIRED, in the browser window that just opened:')
    console.log('    1. Complete the CAPTCHA if shown')
    console.log('    2. Click "Log in"  --  promptly, please')
    console.log('')
    console.log('  Do it without long pauses: reCAPTCHA tokens expire after about')
    console.log('  two minutes, and a stale one fails as "Wrong or expired reCaptcha".')
    console.log('  If you hit that error, just reload the page and retry.')
    console.log('  That error can also mean a VPN/proxy is in the way.')
    console.log('')
    console.log('  (If this profile is still signed in, login is skipped automatically.)')
    console.log('-'.repeat(64))
    console.log('')

    await waitForSignIn(page)
    console.log('Signed in.')

    // Visit OFP so it establishes its own session cookies via the SSO handoff,
    // then prove the session actually works by fetching a real picksheet.
    const picksheetUrl = `https://www.officefootballpool.com/picksheet_print.cfm?weekid=${VERIFY_WEEK_ID}`
    console.log(`Verifying access: ${picksheetUrl}`)
    await page.goto(picksheetUrl, { waitUntil: 'networkidle2', timeout: 60000 })

    const text = await page.evaluate(() => document.body.innerText)
    let authConfirmed = false
    try {
      assertLooksLikePicksheet(text, VERIFY_WEEK_ID)
      authConfirmed = true
      console.log(`Verified — received a real picksheet (${text.length} chars).`)
    } catch (error) {
      if (error instanceof PicksheetNotReadyError) {
        // Only a logged-in user is shown "no games this week", so this proves
        // authentication even though there is no picksheet to read yet.
        authConfirmed = true
        console.log('Verified — authenticated. This week has no schedule posted yet:')
        console.log(`  ${error.message}`)
      } else if (error instanceof PicksheetAuthError) {
        // Saving here would produce a session that opens nothing, and the
        // scheduled job would fail every week. Fail loudly instead.
        throw new Error(
          `Signed in to Splash Sports, but officefootballpool.com does not ` +
          `recognise the session: ${error.message}\n\n` +
          `  Splash and OFP keep separate sessions. Sign in to ` +
          `officefootballpool.com directly in the browser window, then re-run.\n` +
          `  Nothing was saved.`
        )
      } else {
        console.warn('')
        console.warn('WARNING: signed in, but verification was inconclusive:')
        console.warn(`  ${error instanceof Error ? error.message : String(error)}`)
        console.warn('Saving the session anyway; a different week may still work.')
        console.warn('')
      }
    }

    if (authConfirmed) {
      console.log('OFP access confirmed.')
    }

    console.log('Capturing session...')
    const state = await captureSession(browser, page)
    await saveSession(state)

    const domainSeen: Record<string, true> = {}
    for (const cookie of state.cookies) domainSeen[cookie.domain] = true
    const domainCount = Object.keys(domainSeen).length
    console.log('')
    console.log('='.repeat(64))
    console.log(`Saved: ${DEFAULT_SESSION_PATH}  (permissions 0600)`)
    console.log(`  cookies : ${state.cookies.length} across ${domainCount} domain(s)`)
    for (const entry of state.origins) {
      console.log(`  storage : ${entry.origin} -> ${entry.localStorage.length} item(s)`)
    }
    console.log('')
    console.log('This file contains live auth cookies. It is gitignored — keep it that way.')
    console.log('Scheduled/local fetches will now reuse it:  npm run fetch-picksheet')
    console.log('='.repeat(64))

    if (printB64) {
      const b64 = Buffer.from(await fs.readFile(DEFAULT_SESSION_PATH, 'utf8')).toString('base64')
      console.log('')
      console.log('Base64 for the PICKSHEET_SESSION_B64 GitHub secret:')
      console.log('')
      console.log(b64)
      console.log('')
    }
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error('\nLogin failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
