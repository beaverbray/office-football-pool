/**
 * Persisted browser session for Splash Sports.
 *
 * Why this exists: the Splash Sports sign-in page is protected by reCAPTCHA, so
 * an automated headless login cannot complete it (verified: both synthetic and
 * trusted clicks fail with no session cookie). Instead a human logs in ONCE via
 * `npm run login`, which captures the resulting browser session; scheduled runs
 * then reuse that session rather than re-authenticating.
 *
 * The saved file contains live authentication cookies. Treat it exactly like a
 * password: it is gitignored and written with 0600 permissions.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { Browser, Page, CookieData } from 'puppeteer'

/** Origins whose cookies + localStorage are worth persisting. */
export const SESSION_ORIGINS = [
  'https://app.splashsports.com'
] as const

export const DEFAULT_SESSION_PATH = path.resolve(process.cwd(), '.picksheet-session.json')

const CookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string().optional(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(['Strict', 'Lax', 'None']).optional()
})

const OriginSchema = z.object({
  origin: z.string(),
  localStorage: z.array(z.object({ name: z.string(), value: z.string() }))
})

const SessionStateSchema = z.object({
  savedAt: z.string(),
  cookies: z.array(CookieSchema),
  origins: z.array(OriginSchema)
})

export type SessionState = z.infer<typeof SessionStateSchema>

/**
 * Read cookies for all domains plus localStorage for the origins we care about.
 * Navigates to each origin, because localStorage is only readable same-origin.
 */
export async function captureSession(browser: Browser, page: Page): Promise<SessionState> {
  const origins: SessionState['origins'] = []

  for (const origin of SESSION_ORIGINS) {
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 45000 })
      const entries = await page.evaluate(() => {
        const out: Array<{ name: string; value: string }> = []
        for (let i = 0; i < window.localStorage.length; i++) {
          const name = window.localStorage.key(i)
          if (name === null) continue
          out.push({ name, value: window.localStorage.getItem(name) ?? '' })
        }
        return out
      })
      origins.push({ origin, localStorage: entries })
    } catch (error) {
      console.warn(
        `  (could not read localStorage for ${origin}: ` +
        `${error instanceof Error ? error.message : String(error)})`
      )
    }
  }

  const cookies = await browser.cookies()

  return {
    savedAt: new Date().toISOString(),
    // Keep only the fields the schema models, so the file stays stable across
    // Puppeteer versions that add incidental cookie metadata.
    cookies: cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite
    })),
    origins
  }
}

export async function saveSession(state: SessionState, filePath = DEFAULT_SESSION_PATH): Promise<void> {
  // 0600: this file is equivalent to a credential.
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), { mode: 0o600 })
  await fs.chmod(filePath, 0o600)
}

/**
 * Load a saved session.
 *
 * Prefers `PICKSHEET_SESSION_B64` (base64 JSON) so CI can supply the session as
 * a secret without committing it; falls back to the on-disk file for local runs.
 * Returns null when no session is available, so callers can print guidance.
 */
export async function loadSession(filePath = DEFAULT_SESSION_PATH): Promise<SessionState | null> {
  const inline = process.env.PICKSHEET_SESSION_B64
  let raw: string

  if (inline) {
    raw = Buffer.from(inline, 'base64').toString('utf8')
  } else {
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch {
      return null
    }
  }

  const parsed = SessionStateSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    throw new Error(
      `Session data is malformed (${parsed.error.issues.length} schema issue(s)). ` +
      `Re-create it with: npm run login`
    )
  }
  return parsed.data
}

/**
 * Apply a saved session to a fresh browser: cookies first, then localStorage
 * per origin (which requires being on that origin to write).
 */
export async function restoreSession(browser: Browser, page: Page, state: SessionState): Promise<void> {
  if (state.cookies.length > 0) {
    const cookies: CookieData[] = state.cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite
    }))
    await browser.setCookie(...cookies)
  }

  for (const entry of state.origins) {
    if (entry.localStorage.length === 0) continue
    try {
      await page.goto(entry.origin, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.evaluate(items => {
        for (const item of items) window.localStorage.setItem(item.name, item.value)
      }, entry.localStorage)
    } catch (error) {
      console.warn(
        `  (could not restore localStorage for ${entry.origin}: ` +
        `${error instanceof Error ? error.message : String(error)})`
      )
    }
  }
}

/** Human-readable age, used to warn before a session silently expires. */
export function describeSessionAge(state: SessionState): { ageDays: number; text: string } {
  const ageMs = Date.now() - new Date(state.savedAt).getTime()
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000))
  const ageHours = Math.floor(ageMs / (60 * 60 * 1000))
  return {
    ageDays,
    text: ageDays >= 1 ? `${ageDays} day(s) old` : `${ageHours} hour(s) old`
  }
}
