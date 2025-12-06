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

### Phase 2: Picksheet Scraper (CLI First)

**Goal:** Automated picksheet fetching for local development

**Components:**
1. `app/src/services/picksheet-scraper.ts` - Puppeteer-based scraper
2. `scripts/fetch-picksheet.ts` - CLI entry point
3. `package.json` script: `npm run fetch-picksheet`

#### Task 2.1: Create Picksheet Scraper Service

**File:** `app/src/services/picksheet-scraper.ts`

**Key challenges:**
- Login via `app.splashsports.com/sign-in`
- Navigate to `officefootballpool.com/picksheet_print.cfm?weekid=XXX`
- Extract text content
- Handle auth failures gracefully

**Week ID Calculation (needs validation):**

```typescript
// Known reference: Week 14, 2024 season = weekId 648
const REFERENCE = { weekId: 648, nflWeek: 14, season: 2024 }

function calculateWeekId(nflWeek: number, season: number): number {
  // Assumption: 18 weeks per season, weekId increments sequentially
  const weeksSinceReference =
    ((season - REFERENCE.season) * 18) + (nflWeek - REFERENCE.nflWeek)
  return REFERENCE.weekId + weeksSinceReference
}
```

**Environment Variables:**

```env
OFFICE_POOL_EMAIL=your-email@example.com
OFFICE_POOL_PASSWORD=your-password
```

#### Task 2.2: Create CLI Script

**File:** `app/scripts/fetch-picksheet.ts`

```typescript
#!/usr/bin/env npx tsx
import { PicksheetScraper } from '../src/services/picksheet-scraper'

async function main() {
  const weekId = process.argv[2] ? parseInt(process.argv[2]) : undefined
  const result = await PicksheetScraper.fetch(weekId)

  if (result.success) {
    console.log(`Fetched ${result.gameCount} games for week ${result.weekId}`)
    console.log(result.picksheetText)
  } else {
    console.error('Failed:', result.error)
    process.exit(1)
  }
}

main()
```

**Package.json addition:**

```json
{
  "scripts": {
    "fetch-picksheet": "npx tsx scripts/fetch-picksheet.ts"
  }
}
```

---

### Phase 3: Full Automation (Future)

**Goal:** One-click refresh including picksheet fetch

**Decision Required:** Serverless browser solution

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| **Browserless.io** | Works in Vercel, managed | External dependency | ~$0.01/request |
| **Puppeteer on Railway** | Self-hosted, no limits | Requires server management | ~$5/mo |
| **GitHub Actions** | Free, reliable | Not on-demand (scheduled only) | Free |
| **Keep CLI + Manual** | Simple, no cost | Still requires manual step | Free |

**Recommendation:** Start with CLI (Phase 2), consider Browserless.io for Phase 3 if on-demand is truly needed.

#### Task 3.1: Create `/api/picksheet/fetch` Endpoint

Only implement if using Browserless.io or dedicated server.

**File:** `app/src/app/api/picksheet/fetch/route.ts`

```typescript
export async function POST(request: NextRequest) {
  // Check if we're in an environment that supports browser automation
  if (!process.env.BROWSERLESS_API_KEY && !canRunPuppeteerLocally()) {
    return NextResponse.json({
      success: false,
      error: 'Picksheet fetch not available in this environment',
      suggestion: 'Please paste picksheet manually in Control Panel'
    }, { status: 501 })
  }

  const result = await PicksheetScraper.fetch()
  return NextResponse.json(result)
}
```

#### Task 3.2: Update `/api/refresh-all` to Include Picksheet

Add picksheet fetch as optional first step:

```typescript
// In /api/refresh-all/route.ts
const { skipPicksheet = true } = await request.json()

if (!skipPicksheet && isPicksheetFetchAvailable()) {
  const picksheetResult = await PicksheetScraper.fetch()
  if (picksheetResult.success) {
    // Run full pipeline with fresh picksheet
    await pipelineOrchestrator.runPipeline({
      picksheetText: picksheetResult.picksheetText
    }, { useLLM: true, ... })
  }
}
```

---

### Phase 4: Scheduled Refresh (Optional)

**Goal:** Auto-refresh at key times

**Options:**
1. **Vercel Cron** - Simple, built-in
2. **GitHub Actions** - Free, flexible
3. **External cron service** - More control

**Suggested Schedule:**
- Thursday 6:00 PM PT (before TNF)
- Sunday 9:00 AM PT (before early games)
- Sunday 1:00 PM PT (before late games)
- Monday 5:00 PM PT (before MNF)

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
| `app/src/services/picksheet-scraper.ts` | 2 | Puppeteer-based scraper |
| `app/scripts/fetch-picksheet.ts` | 2 | CLI entry point |
| `app/src/app/api/picksheet/fetch/route.ts` | 3 | API endpoint for scraper |

### Modified Files

| File | Phase | Changes |
|------|-------|---------|
| `app/src/components/CompactDashboard.tsx` | 1 | Update handleRefresh(), add timing display |
| `app/src/components/NavBar.tsx` | 1 | Update button text |
| `app/package.json` | 2 | Add fetch-picksheet script |
| `app/.env.example` | 2 | Add OFFICE_POOL_EMAIL/PASSWORD |

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
