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

## Existing Infrastructure Analysis

### What Already Exists

| Component | Location | Status | Notes |
|-----------|----------|--------|-------|
| **NFELO Scraper** | `services/nfelo-scraper.ts` | ✅ Complete | Fetches from GitHub CSV, has `scrapeCurrentWeek()` |
| **Warren Nolan Scraper** | `services/warren-nolan-scraper.ts` | ✅ Complete | Scrapes HTML, has `scrapeCurrentWeek()` |
| **Pipeline Orchestrator** | `services/pipeline-orchestrator.ts` | ✅ Complete | Full pipeline with progress callbacks |
| **Week Detector** | `services/week-detector.ts` | ✅ Complete | ESPN API + calendar fallback |
| **Refresh Endpoint** | `/api/pipeline/refresh` | ⚠️ Partial | Only refreshes odds, not predictions |
| **Prediction Scrapers API** | `/api/nfelo/scrape`, `/api/warren-nolan/scrape` | ✅ Complete | Support `saveToDatabase` flag |
| **Dashboard** | `components/CompactDashboard.tsx` | ⚠️ Partial | Has refresh button, but limited functionality |
| **NavBar** | `components/NavBar.tsx` | ✅ Complete | Already has refresh/share buttons |

### Key Observations

1. **Most components exist** - We're primarily wiring them together, not building from scratch
2. **Current refresh is incomplete** - `/api/pipeline/refresh` only fetches new odds, doesn't scrape predictions
3. **Prediction scrapers are standalone** - Must be called separately, results saved to DB
4. **Dashboard fetches predictions separately** - Uses `/api/predictions/latest` after pipeline runs
5. **Week detection is robust** - ESPN API with calendar fallback, works for NFL and NCAA

### Data Flow Today

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Current Flow (Multiple Manual Steps)                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User manually:                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐               │
│  │ Login to │───▶│ Copy     │───▶│ Paste in │───▶│ Execute  │               │
│  │ OFP      │    │ Picksheet│    │ Control  │    │ Pipeline │               │
│  └──────────┘    └──────────┘    │ Panel    │    └────┬─────┘               │
│                                  └──────────┘         │                      │
│                                                       ▼                      │
│  Separately:                           ┌──────────────────────────┐          │
│  ┌──────────────────┐                  │ /api/pipeline/run        │          │
│  │ Click "Refresh"  │───▶ only gets    │ - Parse picksheet (LLM)  │          │
│  │ on Dashboard     │    fresh odds    │ - Fetch odds (Odds API)  │          │
│  └──────────────────┘                  │ - Match games            │          │
│                                        │ - Compare spreads        │          │
│  Separately (or never):                │ - Save to pipeline_current│         │
│  ┌──────────────────┐                  └──────────────────────────┘          │
│  │ Manually trigger │                                                        │
│  │ NFELO/WN scrape  │───▶ saves to analysis_predictions table               │
│  └──────────────────┘                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture Overview

### Proposed Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Dashboard: "REFRESH ALL" Button                                            │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │ POST /api/refresh-all
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Refresh Orchestrator (NEW)                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Stage 1: Setup (0-5%)                                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ • Detect current week (WeekDetector - NFL and NCAA)                    │ │
│  │ • Load existing picksheet from pipeline_current if available           │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                           │                                                  │
│                           ▼                                                  │
│  Stage 2: Parallel Data Fetch (5-50%)                                        │
│  ┌────────────────────┬─────────────────────┬───────────────────────────┐   │
│  │ NFELO Scraper      │ Warren Nolan Scraper │ Odds API (via Pipeline)  │   │
│  │ (NFL predictions)  │ (NCAA predictions)   │ (NFL + NCAAF in parallel)│   │
│  │ saveToDatabase:true│ saveToDB: true       │                          │   │
│  └────────┬───────────┴──────────┬──────────┴─────────────┬─────────────┘   │
│           │                      │                        │                  │
│           ▼                      ▼                        │                  │
│  ┌─────────────────────────────────────────┐              │                  │
│  │ analysis_predictions table              │              │                  │
│  │ (fresh predictions saved)               │              │                  │
│  └─────────────────────────────────────────┘              │                  │
│                                                           │                  │
│  Stage 3: Pipeline Execution (50-90%)                     │                  │
│  ┌────────────────────────────────────────────────────────▼─────────────┐   │
│  │ PipelineOrchestrator.runPipeline()                                   │   │
│  │ • Use existing picksheet games (skip LLM parsing)                    │   │
│  │ • Fresh odds already fetched                                         │   │
│  │ • Match games using schedule                                         │   │
│  │ • Calculate spread deltas + KPIs                                     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                           │                                                  │
│                           ▼                                                  │
│  Stage 4: Persist & Respond (90-100%)                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ • Save to pipeline_current (upsert)                                  │   │
│  │ • Return success + timing metrics                                    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Dashboard: Auto-reloads with fresh data                                     │
│  • Fresh odds from pipeline comparison                                       │
│  • Fresh predictions from /api/predictions/latest                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Enhanced Refresh (MVP) - Recommended Starting Point

**Goal:** Single button refreshes odds AND predictions (no picksheet scraping yet)

**What we're building:**
1. New `/api/refresh-all` endpoint that orchestrates everything
2. Update dashboard to show better progress/status
3. Auto-scrape predictions on each refresh

#### Task 1.1: Create `/api/refresh-all` Endpoint

**File:** `app/src/app/api/refresh-all/route.ts`

**Responsibilities:**
1. Detect current week (NFL and NCAA)
2. Load existing picksheet from `pipeline_current`
3. Scrape NFELO predictions (parallel)
4. Scrape Warren Nolan predictions (parallel)
5. Run pipeline with fresh odds
6. Save results
7. Return comprehensive response with timing

**Interface:**

```typescript
// Request
POST /api/refresh-all
{
  skipPredictions?: boolean,  // Skip scraping predictions (faster)
  forceWeek?: number          // Override auto-detected week
}

// Response
{
  success: boolean,
  pipeline: PipelineResult,
  timing: {
    weekDetection: number,
    nfeloScrape: number,
    warrenNolanScrape: number,
    pipelineExecution: number,
    total: number
  },
  predictions: {
    nfelo: { count: number, week: number, saved: boolean } | null,
    warrenNolan: { count: number, week: number, saved: boolean } | null
  },
  meta: {
    nflWeek: number,
    ncaaWeek: number,
    gamesMatched: number,
    picksheetSource: 'cached' | 'none'
  }
}
```

**Implementation Pattern:**

```typescript
import { WeekDetector } from '@/services/week-detector'
import { NFELOScraper } from '@/services/nfelo-scraper'
import { WarrenNolanScraper } from '@/services/warren-nolan-scraper'
import { pipelineOrchestrator } from '@/services/pipeline-orchestrator'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const timing: Record<string, number> = {}

  // 1. Detect weeks (parallel for NFL and NCAA)
  const [nflWeek, ncaaWeek] = await Promise.all([
    WeekDetector.getCurrentNFLWeek(),
    WeekDetector.getCurrentNCAAWeek()
  ])
  timing.weekDetection = Date.now() - startTime

  // 2. Load existing picksheet from database
  const { data: currentPipeline } = await supabase
    .from('pipeline_current')
    .select('*')
    .eq('id', 'current')
    .single()

  if (!currentPipeline?.pipeline_data?.comparison?.comparisons) {
    return NextResponse.json({
      success: false,
      error: 'No picksheet data found',
      message: 'Please upload a picksheet in the Control Panel first'
    }, { status: 400 })
  }

  // 3. Scrape predictions in parallel
  const predictionStart = Date.now()
  const [nfeloResult, wnResult] = await Promise.allSettled([
    NFELOScraper.scrapePredictions(nflWeek.seasonYear, nflWeek.week),
    WarrenNolanScraper.scrapePredictionsByWeek(ncaaWeek.seasonYear, ncaaWeek.week)
  ])
  timing.predictionsScrape = Date.now() - predictionStart

  // 4. Save predictions to database (if successful)
  // ... (follow pattern from existing /api/nfelo/scrape and /api/warren-nolan/scrape)

  // 5. Run pipeline refresh
  const pipelineStart = Date.now()
  const picksheetGames = extractPicksheetGames(currentPipeline.pipeline_data)
  const refreshedPipeline = await pipelineOrchestrator.runPipeline(
    { picksheetGames },
    { useOddsAPI: true, useLLM: false, week: nflWeek.week }
  )
  timing.pipelineExecution = Date.now() - pipelineStart

  // 6. Save refreshed pipeline
  await supabase.from('pipeline_current').upsert({
    id: 'current',
    pipeline_data: refreshedPipeline,
    picksheet_text: currentPipeline.picksheet_text,
    updated_at: new Date().toISOString()
  })

  // 7. Return comprehensive response
  timing.total = Date.now() - startTime
  return NextResponse.json({
    success: true,
    pipeline: refreshedPipeline,
    timing,
    predictions: { nfelo: {...}, warrenNolan: {...} },
    meta: { nflWeek: nflWeek.week, ncaaWeek: ncaaWeek.week, ... }
  })
}
```

#### Task 1.2: Update Dashboard Refresh Handler

**File:** `app/src/components/CompactDashboard.tsx`

**Changes:**
1. Update `handleRefresh()` to call `/api/refresh-all` instead of `/api/pipeline/refresh`
2. Re-fetch predictions after refresh completes
3. Show more detailed progress/status
4. Display timing information after refresh

**Current code to modify (line ~274):**

```typescript
// BEFORE
const handleRefresh = async () => {
  setRefreshing(true)
  try {
    const response = await fetch('/api/pipeline/refresh', { method: 'POST' })
    // ... only refreshes odds
  }
}

// AFTER
const handleRefresh = async () => {
  setRefreshing(true)
  try {
    const response = await fetch('/api/refresh-all', { method: 'POST' })
    const data = await response.json()

    if (data.success) {
      setCurrentPipeline(data.pipeline)

      // Re-fetch predictions since they were just scraped
      const predResponse = await fetch('/api/predictions/latest')
      if (predResponse.ok) {
        const predData = await predResponse.json()
        setEloPredictions(predData.predictions || [])
      }

      // Show success with timing
      const totalSeconds = (data.timing.total / 1000).toFixed(1)
      alert(`Refreshed in ${totalSeconds}s! ${data.meta.gamesMatched} games matched.`)
    }
  } finally {
    setRefreshing(false)
  }
}
```

#### Task 1.3: Update NavBar Refresh Button Text

**File:** `app/src/components/NavBar.tsx`

**Changes:**
- Change button text from "REFRESH" to "REFRESH ALL"
- Consider adding a dropdown for "Quick Refresh" (odds only) vs "Full Refresh"

---

### Phase 2: Automated Picksheet Fetch (GitHub Actions)

**Goal:** Scheduled, fully-automated picksheet fetching once per week

**Why GitHub Actions:**
- Puppeteer/Chromium **cannot run on Vercel** (serverless limitation)
- Supabase Edge Functions also serverless - no browser support
- GitHub Actions runs in a **full VM** - Puppeteer works natively
- **Free** for public repos, generous free tier for private
- Only need to fetch picksheet **once per week** (it doesn't change)
- Can be triggered manually via workflow_dispatch

**Architecture:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  GitHub Actions (scheduled: Thursday 6PM PT)                                │
│  Or manual trigger via workflow_dispatch                                    │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │ runs in Ubuntu VM with Node.js + Puppeteer
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Fetch Picksheet Script: scripts/fetch-picksheet.ts                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Calculate weekId from current NFL week (ESPN API)                       │
│  2. Launch Puppeteer (headless Chrome)                                      │
│  3. Login to splashsports.com                                               │
│  4. Navigate to officefootballpool.com/picksheet_print.cfm?weekid=XXX       │
│  5. Extract picksheet text from page                                        │
│  6. POST picksheet to Supabase (pipeline_current table)                     │
│  7. Trigger /api/refresh-all on the Next.js app                             │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Next.js App: /api/refresh-all                                              │
│  - Scrapes predictions (NFELO, Warren Nolan)                                │
│  - Fetches fresh odds                                                       │
│  - Updates dashboard                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Cost:** Free (GitHub Actions free tier: 2,000 minutes/month for private repos)

#### Task 2.1: Create Picksheet Fetch Script

**File:** `app/scripts/fetch-picksheet.ts`

**Responsibilities:**
1. Calculate weekId from current NFL week (ESPN API)
2. Launch Puppeteer and login to splashsports.com
3. Navigate to picksheet page with calculated weekId
4. Extract picksheet text
5. Save to Supabase `pipeline_current` table
6. Optionally trigger `/api/refresh-all`

**Implementation Pattern:**

```typescript
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'

// Known reference: Week 14, 2024 season = weekId 648
const REFERENCE = { weekId: 648, nflWeek: 14, season: 2024 }

async function calculateWeekId(): Promise<number> {
  const response = await fetch(
    'http://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
  )
  const data = await response.json()
  const week = data.week?.number ?? 1
  const season = data.season?.year ?? new Date().getFullYear()

  const weeksSinceReference =
    ((season - REFERENCE.season) * 18) + (week - REFERENCE.nflWeek)
  return REFERENCE.weekId + weeksSinceReference
}

async function fetchPicksheet() {
  const weekId = await calculateWeekId()
  console.log(`Fetching picksheet for weekId: ${weekId}`)

  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()

  // Login to splashsports.com
  await page.goto('https://app.splashsports.com/sign-in')
  await page.type('input[name="email"]', process.env.OFFICE_POOL_EMAIL!)
  await page.type('input[name="password"]', process.env.OFFICE_POOL_PASSWORD!)
  await page.click('button[type="submit"]')
  await page.waitForNavigation()

  // Navigate to picksheet
  await page.goto(
    `https://www.officefootballpool.com/picksheet_print.cfm?weekid=${weekId}`
  )

  // Extract picksheet text
  const picksheetText = await page.evaluate(() => document.body.innerText)

  await browser.close()

  // Save to Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ... save picksheet and trigger refresh
}
```

#### Task 2.2: Create GitHub Actions Workflow

**File:** `.github/workflows/fetch-picksheet.yml`

```yaml
name: Fetch Picksheet

on:
  schedule:
    # Thursday 6PM PT = Friday 2AM UTC (before Thursday Night Football)
    - cron: '0 2 * * 5'
  workflow_dispatch:  # Allow manual trigger

jobs:
  fetch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: app/package-lock.json

      - name: Install dependencies
        working-directory: app
        run: npm ci

      - name: Fetch picksheet
        working-directory: app
        env:
          OFFICE_POOL_EMAIL: ${{ secrets.OFFICE_POOL_EMAIL }}
          OFFICE_POOL_PASSWORD: ${{ secrets.OFFICE_POOL_PASSWORD }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          APP_URL: ${{ secrets.APP_URL }}
        run: npx tsx scripts/fetch-picksheet.ts
```

**Required GitHub Secrets:**
- `OFFICE_POOL_EMAIL` - Login email for splashsports.com
- `OFFICE_POOL_PASSWORD` - Login password
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for writes)
- `APP_URL` - Production app URL (e.g., https://your-app.vercel.app)

#### Task 2.3: Week ID Calculation

**Logic (needs validation with known weeks):**

```typescript
// Known reference: Week 14, 2024 season = weekId 648
const REFERENCE = { weekId: 648, nflWeek: 14, season: 2024 }

function calculateWeekId(nflWeek: number, season: number): number {
  const weeksSinceReference =
    ((season - REFERENCE.season) * 18) + (nflWeek - REFERENCE.nflWeek)
  return REFERENCE.weekId + weeksSinceReference
}

// Get current week from ESPN API
async function getCurrentWeekId(): Promise<number> {
  const response = await fetch(
    'http://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
  )
  const data = await response.json()
  const week = data.week?.number ?? 1
  const season = data.season?.year ?? new Date().getFullYear()
  return calculateWeekId(week, season)
}
```

#### Task 2.4: Add Puppeteer Dependency

**File:** `app/package.json`

```bash
npm install puppeteer
```

Note: Puppeteer will only be used in the GitHub Actions environment, not in the Next.js app.
The script is standalone and doesn't need to be bundled with the web app.

#### Task 2.5: Manual Trigger Option

The GitHub Actions workflow supports `workflow_dispatch`, allowing manual trigger from:
1. GitHub Actions UI (Actions tab → Fetch Picksheet → Run workflow)
2. GitHub CLI: `gh workflow run fetch-picksheet.yml`
3. GitHub API

For most users, the scheduled Thursday run is sufficient since the picksheet doesn't change during the week.

---

### Phase 3: Monitoring and Reliability

**Goal:** Ensure scheduled fetches are working and handle failures gracefully

#### Task 3.1: Add Logging Table

```sql
CREATE TABLE afbp.picksheet_fetch_log (
  id SERIAL PRIMARY KEY,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  week_id INTEGER,
  nfl_week INTEGER,
  success BOOLEAN,
  error_message TEXT,
  duration_ms INTEGER,
  source TEXT  -- 'github_actions' | 'manual'
);
```

The fetch script should log results to this table for monitoring.

#### Task 3.2: GitHub Actions Notifications

GitHub Actions provides built-in failure notifications:
- Email notification on workflow failure (enabled by default)
- Can add Slack/Discord notifications via marketplace actions
- Workflow run history visible in GitHub UI

#### Task 3.3: Fallback to Manual

If GitHub Actions fetch fails, the system falls back gracefully:
- Dashboard shows "Last updated: X hours ago"
- User can still paste picksheet manually in Control Panel
- `/api/refresh-all` continues to work with cached picksheet
- Can manually trigger workflow from GitHub UI

---

## Technical Considerations

### Error Handling Strategy

```typescript
enum RefreshError {
  NO_PICKSHEET = 'no_picksheet',
  NFELO_FAILED = 'nfelo_scrape_failed',
  WARREN_NOLAN_FAILED = 'warren_nolan_scrape_failed',
  ODDS_FAILED = 'odds_fetch_failed',
  PIPELINE_FAILED = 'pipeline_failed',
  SAVE_FAILED = 'save_failed'
}

// Graceful degradation
if (nfeloResult.status === 'rejected') {
  // Log warning but continue - predictions are optional
  console.warn('NFELO scrape failed, continuing without NFL predictions')
}

if (oddsResult.status === 'rejected') {
  // This is critical - fail the entire operation
  throw new RefreshError(RefreshError.ODDS_FAILED, oddsResult.reason)
}
```

### Rate Limiting Considerations

| Service | Rate Limit | Caching | Notes |
|---------|------------|---------|-------|
| The Odds API | Based on plan | 30-min cache in code | Critical dependency |
| ESPN API | Generous | 1-hour revalidate | Used for week detection |
| NFELO (GitHub) | None | Re-fetch each time | Raw CSV file |
| Warren Nolan | Unknown | 500ms delay between requests | HTML scraping |
| officefootballpool.com | Unknown | TBD | May have bot detection |

### Database Operations

All database operations use the `afbp` schema:

```typescript
// Read operations - use regular client
import { supabase } from '@/lib/supabase'
const { data } = await supabase.from('pipeline_current').select('*')

// Write operations - use admin client (bypasses RLS)
import { supabaseAdmin } from '@/lib/supabase-admin'
await supabaseAdmin.from('analysis_predictions').insert(records)
```

---

## Success Metrics

| Metric | Current | Phase 1 Target | Phase 3 Target |
|--------|---------|----------------|----------------|
| Time to refresh | 3-5 minutes | < 30 seconds | < 30 seconds |
| Manual steps | 6 | 1 click | 1 click |
| Data sources refreshed | Odds only | Odds + Predictions | All (incl. picksheet) |
| Predictions auto-updated | Never | Each refresh | Each refresh |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| NFELO data format changes | Monitor for errors, have fallback to skip |
| Warren Nolan site structure changes | HTML parsing can break; have fallback |
| officefootballpool.com blocks scraping | Keep manual paste as backup, investigate API |
| Rate limits hit | Implement caching, add delays between requests |
| Serverless timeout (Vercel 10s) | Parallelize aggressively, consider edge functions |

---

## Files to Create/Modify

### New Files

| File | Phase | Description |
|------|-------|-------------|
| `app/src/app/api/refresh-all/route.ts` | 1 | Main orchestration endpoint |
| `app/scripts/fetch-picksheet.ts` | 2 | Puppeteer script for picksheet scraping |
| `.github/workflows/fetch-picksheet.yml` | 2 | GitHub Actions workflow |

### Modified Files

| File | Phase | Changes |
|------|-------|---------|
| `app/src/components/CompactDashboard.tsx` | 1 | Update handleRefresh(), add timing display |
| `app/src/components/NavBar.tsx` | 1 | Update button text |
| `app/package.json` | 2 | Add puppeteer dependency |

---

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Week ID formula accuracy | Implement calculation, validate with 2-3 known weeks |
| Serverless browser solution | Start with CLI (Phase 2), evaluate Browserless.io later |
| Fallback if picksheet fetch fails | Use cached picksheet + continue with refresh |
| What if predictions fail? | Log warning, continue without predictions (graceful degradation) |

---

## Appendix: Service Interfaces

### NFELOScraper

```typescript
// From services/nfelo-scraper.ts
interface NFELOPrediction {
  gameTime: string
  awayTeam: string
  homeTeam: string
  awayElo: number
  homeElo: number
  predictedWinner: 'home' | 'away'
  winProbability: number
  spread: number
  overUnder?: number
}

interface NFELOScraperResult {
  success: boolean
  predictions: NFELOPrediction[]
  scrapedAt: string
  week: number
  season: number
  error?: string
}

// Key methods
NFELOScraper.scrapePredictions(season: number, week: number): Promise<NFELOScraperResult>
NFELOScraper.scrapeCurrentWeek(): Promise<NFELOScraperResult>
```

### WarrenNolanScraper

```typescript
// From services/warren-nolan-scraper.ts
interface WarrenNolanPrediction {
  gameTime: string
  awayTeam: string
  homeTeam: string
  predictedWinner: 'home' | 'away'
  winProbability: number
  confidence: 'H' | 'M' | 'L'
  spread: number
  overUnder?: number
}

interface WarrenNolanScraperResult {
  success: boolean
  predictions: WarrenNolanPrediction[]
  scrapedAt: string
  gameDate?: string
  week?: number
  season?: number
  error?: string
}

// Key methods
WarrenNolanScraper.scrapePredictions(date: string): Promise<WarrenNolanScraperResult>
WarrenNolanScraper.scrapePredictionsByWeek(season: number, week: number): Promise<WarrenNolanScraperResult>
WarrenNolanScraper.scrapeCurrentWeek(): Promise<WarrenNolanScraperResult>
```

### WeekDetector

```typescript
// From services/week-detector.ts
interface WeekInfo {
  week: number
  seasonYear: number
  startDate: Date
  endDate: Date
}

// Key methods
WeekDetector.getCurrentNFLWeek(): Promise<WeekInfo>
WeekDetector.getCurrentNCAAWeek(): Promise<WeekInfo>
```

### PipelineOrchestrator

```typescript
// From services/pipeline-orchestrator.ts
interface PipelineConfig {
  useOddsAPI?: boolean
  useLLM?: boolean
  useWarrenNolan?: boolean
  warrenNolanDate?: string
  week?: number
  includeLogs?: boolean
  matchingThreshold?: number
}

interface PipelineInput {
  picksheetText?: string
  picksheetGames?: Array<{
    homeTeam: string
    awayTeam: string
    spread: number
    gameDate?: string
  }>
  marketGames?: Array<{...}>
}

// Key method
pipelineOrchestrator.runPipeline(
  input: PipelineInput,
  config: PipelineConfig,
  progressCallback?: (stage: string, progress: number) => void
): Promise<PipelineResult>
```

---

## References

- Existing scrapers: `warren-nolan-scraper.ts`, `nfelo-scraper.ts`
- Pipeline orchestrator: `pipeline-orchestrator.ts`
- Current refresh endpoint: `/api/pipeline/refresh`
- Predictions API: `/api/predictions/latest`
- Week detection: `/api/week` and `week-detector.ts`
- Picksheet URL: `https://www.officefootballpool.com/picksheet_print.cfm?weekid=XXX`
- Login URL: `https://app.splashsports.com/sign-in`
