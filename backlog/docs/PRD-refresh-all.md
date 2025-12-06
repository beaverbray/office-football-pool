# PRD: One-Click Dashboard Refresh

## Problem Statement

Currently, refreshing the dashboard with updated data requires multiple manual steps:

1. **Login** to officefootballpool.com
2. **Navigate** to the picksheet print page (`/picksheet_print.cfm?weekid=XXX`)
3. **Copy** the picksheet text
4. **Paste** into the Control Panel
5. **Wait** for pipeline to process
6. **Manually trigger** prediction scrapers (NFELO, Warren Nolan) if needed

This workflow is tedious, error-prone, and discourages frequent updates during game weeks when odds are moving.

---

## Goal

**One button to refresh everything.**

A user clicks "Refresh All" on the dashboard and the system automatically:
1. Fetches the latest picksheet from officefootballpool.com
2. Scrapes current prediction models (NFELO, Warren Nolan)
3. Fetches live market odds
4. Runs the full comparison pipeline
5. Updates the dashboard with fresh data

---

## User Stories

### Primary
- **As a pool participant**, I want to refresh all data with one click so I can quickly see updated spreads and predictions without manual copy/paste.

### Secondary
- **As a pool participant**, I want the system to auto-detect the current week so I don't have to remember or specify week numbers.
- **As a pool participant**, I want to see progress feedback during the refresh so I know the system is working.
- **As a pool participant**, I want the refresh to be fast (< 30 seconds ideally) so I can check updates frequently on game day.

---

## Proposed Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard: "Refresh All" Button                            │
└──────────────────────────┬──────────────────────────────────┘
                           │ POST /api/refresh-all
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Refresh Orchestrator                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ Picksheet Fetch │  │ Week Detection  │  (parallel)       │
│  │ (authenticated) │  │ (NFL + NCAAF)   │                   │
│  └────────┬────────┘  └────────┬────────┘                   │
│           │                    │                            │
│           ▼                    ▼                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Parallel Data Fetch                                 │    │
│  │  • NFELO predictions (if NFL games detected)       │    │
│  │  • Warren Nolan predictions (if NCAAF detected)    │    │
│  │  • Live odds from The Odds API                     │    │
│  └─────────────────────────────────────────────────────┘    │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Pipeline Execution                                  │    │
│  │  • Parse picksheet (LLM)                           │    │
│  │  • Entity resolution                               │    │
│  │  • Game matching                                   │    │
│  │  • Spread comparison + KPI calculation             │    │
│  └─────────────────────────────────────────────────────┘    │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Persist Results                                     │    │
│  │  • Save to Supabase (pipeline_current)             │    │
│  │  • Update predictions table                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Dashboard: Updated with fresh data                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Components to Build

### 1. Picksheet Scraper Service

**Purpose:** Authenticate with officefootballpool.com and fetch picksheet data.

**Technical Approach:**

| Option | Pros | Cons |
|--------|------|------|
| **A. Puppeteer (headless browser)** | Full browser automation, handles JS | Heavy, won't work in Vercel serverless |
| **B. Session cookie injection** | Lightweight, works in serverless | Cookie expires, manual refresh needed |
| **C. External browser service (Browserless.io)** | Works in serverless, no local deps | Additional cost, external dependency |
| **D. GitHub Actions scheduled job** | Free, reliable, runs on schedule | Not on-demand, delay between updates |

**Recommended:** Start with **Option A (Puppeteer)** as a local/CLI script, with the API endpoint calling it when available. Fall back to manual paste if scraper unavailable.

**Implementation Details:**
- Login flow: `app.splashsports.com/sign-in` → redirect to `officefootballpool.com`
- Credentials stored in environment variables: `OFFICE_POOL_EMAIL`, `OFFICE_POOL_PASSWORD`
- Week ID auto-detection: Query current week, calculate `weekid` parameter
- Output: Raw picksheet text (same format currently pasted manually)

**File:** `app/src/services/picksheet-scraper.ts`

---

### 2. API Endpoint: `/api/refresh-all`

**Purpose:** Single endpoint that orchestrates the complete refresh flow.

**Request:**
```typescript
POST /api/refresh-all
{
  // Optional overrides
  weekId?: number,        // Force specific week (auto-detect if omitted)
  skipPicksheet?: boolean // Use cached picksheet, just refresh odds/predictions
}
```

**Response:**
```typescript
{
  success: boolean,
  pipeline: PipelineResult,
  timing: {
    picksheetFetch: number,
    predictionsScrape: number,
    oddsFetch: number,
    pipelineExecution: number,
    total: number
  },
  sources: {
    picksheet: 'fetched' | 'cached' | 'manual',
    nfelo: { count: number, week: number } | null,
    warrenNolan: { count: number, week: number } | null,
    odds: { nfl: number, ncaaf: number }
  }
}
```

**Error Handling:**
- If picksheet fetch fails → return error with option to use cached
- If predictions fail → continue with odds only (degraded mode)
- If odds fail → return error (critical dependency)

**File:** `app/src/app/api/refresh-all/route.ts`

---

### 3. API Endpoint: `/api/picksheet/fetch`

**Purpose:** Dedicated endpoint to fetch picksheet (can be called independently).

**Request:**
```typescript
POST /api/picksheet/fetch
{
  weekId?: number  // Auto-detect if omitted
}
```

**Response:**
```typescript
{
  success: boolean,
  picksheetText: string,
  weekId: number,
  fetchedAt: string,
  gameCount: number
}
```

**File:** `app/src/app/api/picksheet/fetch/route.ts`

---

### 4. Dashboard UI Updates

**Location:** `app/src/components/CompactDashboard.tsx`

**Changes:**
1. Add "Refresh All" button (prominent, top of dashboard)
2. Progress indicator during refresh (stages + percentage)
3. Last refreshed timestamp display
4. Error state with retry option

**UI Mockup:**
```
┌──────────────────────────────────────────────────────────┐
│  OFFICE FOOTBALL POOL ANALYSIS                           │
│                                                          │
│  [🔄 REFRESH ALL]  Last updated: 2 hours ago             │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Refreshing... Fetching picksheet (1/4)      [████░░] │ │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ... rest of dashboard ...                               │
└──────────────────────────────────────────────────────────┘
```

---

## Week ID Calculation

The picksheet URL uses `weekid` parameter that increments each week.

**Logic to implement:**
```typescript
// Known reference point
const REFERENCE = { weekId: 648, nflWeek: 14, season: 2024 }

// Calculate current weekId
function getCurrentWeekId(nflWeek: number, season: number): number {
  const weeksSinceReference =
    ((season - REFERENCE.season) * 18) + // 18 weeks per NFL season
    (nflWeek - REFERENCE.nflWeek)
  return REFERENCE.weekId + weeksSinceReference
}
```

**Note:** This formula needs validation. May need to scrape/detect from the site itself.

---

## Environment Variables

**New:**
```env
# Already exist
OFFICE_POOL_EMAIL=user@example.com
OFFICE_POOL_PASSWORD=secret

# May need to add
BROWSERLESS_API_KEY=xxx  # If using external browser service
```

---

## Rollout Plan

### Phase 1: Manual Picksheet + Auto Predictions (Current + Polish)
- Keep manual paste workflow
- Add "Refresh Odds & Predictions" button to dashboard
- Auto-scrape NFELO + Warren Nolan when refresh triggered
- **Effort:** Low (mostly wiring existing endpoints)

### Phase 2: Local Picksheet Scraper
- Implement Puppeteer-based scraper as CLI script
- Can be run locally: `npm run fetch-picksheet`
- Dashboard still uses manual paste, but script available
- **Effort:** Medium

### Phase 3: Full Automation
- Integrate scraper into API (requires solving serverless browser issue)
- Options: Browserless.io, dedicated server, GitHub Actions
- "Refresh All" button triggers complete flow
- **Effort:** Medium-High (depends on hosting solution)

### Phase 4: Scheduled Refresh (Optional)
- Cron job to auto-refresh at key times (Thursday 6pm, Sunday 10am, etc.)
- Notifications when refresh complete
- **Effort:** Low (once Phase 3 complete)

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time to refresh dashboard | 3-5 minutes (manual) | < 30 seconds |
| Steps to refresh | 6 manual steps | 1 click |
| Data staleness | Hours (manual refresh) | Minutes (on-demand) |

---

## Open Questions

1. **Week ID formula:** Is the calculation `weekId = 648 + (week - 14)` correct? Need to verify across multiple weeks.

2. **Authentication persistence:** How long do session cookies last? Can we cache and reuse?

3. **Rate limiting:** Does officefootballpool.com have rate limits or bot detection?

4. **Serverless browser:** Which solution for production?
   - Browserless.io ($0.01/request)
   - Self-hosted Puppeteer on Railway/Render
   - GitHub Actions (free but not on-demand)

5. **Fallback behavior:** If picksheet fetch fails, should we:
   - Block the entire refresh?
   - Allow refresh with stale picksheet?
   - Prompt user to paste manually?

---

## Appendix: Current Data Flow

```
Manual Flow (Today):
User → Login to OFP → Copy picksheet → Paste in Control Panel →
       Click Execute → Wait for pipeline → View dashboard

Proposed Flow:
User → Click "Refresh All" → Wait 20-30s → View updated dashboard
```

---

## References

- Existing scrapers: `warren-nolan-scraper.ts`, `nfelo-scraper.ts`
- Pipeline orchestrator: `pipeline-orchestrator.ts`
- Current refresh endpoint: `/api/pipeline/refresh`
- Picksheet URL: `https://www.officefootballpool.com/picksheet_print.cfm?weekid=XXX`
- Login URL: `https://app.splashsports.com/sign-in`
