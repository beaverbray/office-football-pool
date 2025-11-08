# Football Pool Analysis Pipeline - Complete Flow

## Overview
Your app is an **analysis tool** that compares picksheet spreads against live market odds and expert predictions.

## The 6 Tables with New Schema

```
afbp.core_schedule           - Game schedule reference data
afbp.pipeline_job_runs       - Pipeline execution tracking (future)
afbp.pipeline_picks_rows     - Raw parsed picksheet data (future)
afbp.pipeline_current        - Current analysis state (SINGLETON)
afbp.analysis_predictions    - External predictions (Warren Nolan, NFELO)
afbp.shared_analyses         - Shareable analysis snapshots
```

---

## Complete Pipeline Flow

### 1️⃣ **Initial Setup (One-Time)**

```
┌─────────────────────────────────────┐
│  SCHEDULE DATA (Reference)          │
│  afbp.core_schedule                 │
├─────────────────────────────────────┤
│  • NFL/NCAAF game schedules         │
│  • Match numbers, weeks, dates      │
│  • Team names, locations            │
│  • 8 uses across app (most used!)   │
└─────────────────────────────────────┘
        ↓
    [Used for lookups and validation]
```

**Schema Query Example:**
```typescript
// src/services/schedule-service.ts
const { data } = await supabase
  .from('afbp.core_schedule')  // NEW NAME
  .select('*')
  .eq('week', weekNumber)
```

---

### 2️⃣ **User Input (Control Panel)**

```
┌──────────────────────────────────────┐
│  USER ENTERS PICKSHEET TEXT          │
├──────────────────────────────────────┤
│  "1 pt San Francisco (4-1) +5.5      │
│   Thu 5:15 PM LA RAMS (3-2) -5.5    │
│   1 pt Minnesota (2-2) -3.5..."      │
└──────────────────────────────────────┘
        ↓
    [POST /api/pipeline/run]
```

---

### 3️⃣ **Pipeline Execution**

```
┌────────────────────────────────────────────────────┐
│  PIPELINE ORCHESTRATOR (In-Memory Processing)      │
├────────────────────────────────────────────────────┤
│  STEP 1: Parse Picksheet (LLM)                     │
│    • Extract teams, spreads, game times            │
│    • Detect leagues (NFL/NCAAF)                    │
│                                                     │
│  STEP 2: Fetch Market Data (Odds API)             │
│    • Get current spreads from bookmakers           │
│    • Multiple sportsbooks (FanDuel, DraftKings...) │
│                                                     │
│  STEP 3: Match Games                               │
│    • Fuzzy match picksheet → market games          │
│    • Uses afbp.core_schedule for validation  ←─────┤
│                                                     │
│  STEP 4: Compare Spreads                           │
│    • Calculate differences (picksheet vs market)   │
│    • Identify key number crossings                 │
│    • Generate KPIs and metrics                     │
└────────────────────────────────────────────────────┘
        ↓
    [Complete pipeline object in memory]
```

---

### 4️⃣ **Auto-Fetch Predictions (Parallel)**

```
┌─────────────────────────────────────┐    ┌─────────────────────────────────────┐
│  IF NFL GAMES DETECTED:             │    │  IF NCAAF GAMES DETECTED:           │
│  POST /api/nfelo/scrape             │    │  POST /api/warren-nolan/scrape      │
├─────────────────────────────────────┤    ├─────────────────────────────────────┤
│  • Scrape NFELO predictions         │    │  • Scrape Warren Nolan predictions  │
│  • Win probabilities, spreads       │    │  • College football picks           │
│  • Confidence levels                │    │  • Win probabilities                │
└─────────────────────────────────────┘    └─────────────────────────────────────┘
        ↓                                            ↓
        └────────────────┬───────────────────────────┘
                         ↓
        ┌──────────────────────────────────────┐
        │  SAVE TO DATABASE                    │
        │  afbp.analysis_predictions           │
        ├──────────────────────────────────────┤
        │  • source: 'NFELO' or 'Warren Nolan' │
        │  • game_date, home_team, away_team   │
        │  • predicted_winner, win_probability │
        │  • spread, confidence (H/M/L)        │
        │  • scraped_at timestamp              │
        └──────────────────────────────────────┘
```

**Schema Query Example:**
```typescript
// src/app/api/warren-nolan/scrape/route.ts
const { error } = await supabase
  .from('afbp.analysis_predictions')  // NEW NAME
  .insert(predictions)
```

---

### 5️⃣ **Save Pipeline State**

```
┌──────────────────────────────────────┐
│  SAVE TO DATABASE (SINGLETON)        │
│  afbp.pipeline_current               │
├──────────────────────────────────────┤
│  id: 'current' (always same row!)    │
│  pipeline_data: {                    │
│    parsing: { ... },                 │
│    comparison: {                     │
│      comparisons: [                  │
│        {                             │
│          homeTeam, awayTeam,         │
│          picksheetSpread,            │
│          marketSpread,               │
│          difference,                 │
│          predictions: [...]  ←───────┤ Links to predictions
│        }                             │
│      ]                               │
│    },                                │
│    kpis: { ... }                     │
│  }                                   │
│  picksheet_text: "original text"    │
│  updated_at: timestamp               │
└──────────────────────────────────────┘
```

**Schema Query Example:**
```typescript
// src/app/api/pipeline/save/route.ts
await supabase
  .from('afbp.pipeline_current')  // NEW NAME
  .upsert({
    id: 'current',
    pipeline_data: pipeline,
    picksheet_text: picksheetText,
    updated_at: new Date().toISOString()
  })
```

---

### 6️⃣ **View Results (Dashboard)**

```
┌──────────────────────────────────────┐
│  LOAD FROM DATABASE                  │
│  GET /api/pipeline/current           │
├──────────────────────────────────────┤
│  • Read afbp.pipeline_current        │
│  • Display comparisons on dashboard  │
│  • Show spreads, differences, KPIs   │
└──────────────────────────────────────┘
        ↓
    [User views analysis on main page]
```

---

### 7️⃣ **Refresh Market Data (Later)**

```
┌──────────────────────────────────────┐
│  USER CLICKS "REFRESH"               │
│  POST /api/pipeline/refresh          │
├──────────────────────────────────────┤
│  1. Load afbp.pipeline_current       │
│  2. Extract picksheet games          │
│  3. Fetch fresh Odds API data        │
│  4. Re-run comparison engine         │
│  5. Update afbp.pipeline_current     │
└──────────────────────────────────────┘
```

**Schema Query Example:**
```typescript
// src/app/api/pipeline/refresh/route.ts
const { data } = await supabase
  .from('afbp.pipeline_current')  // NEW NAME
  .select('*')
  .eq('id', 'current')
  .single()

// ... refresh market data ...

await supabase
  .from('afbp.pipeline_current')  // NEW NAME
  .upsert({
    id: 'current',
    pipeline_data: refreshedPipeline,
    picksheet_text: picksheetText
  })
```

---

### 8️⃣ **Share Analysis (Optional)**

```
┌──────────────────────────────────────┐
│  USER CLICKS "SHARE"                 │
│  POST /api/cache/save                │
├──────────────────────────────────────┤
│  • Generate unique share_id          │
│  • Copy current pipeline_data        │
│  • Save to afbp.shared_analyses      │
│  • Return shareable link             │
└──────────────────────────────────────┘
        ↓
┌──────────────────────────────────────┐
│  afbp.shared_analyses                │
├──────────────────────────────────────┤
│  id: uuid                            │
│  share_id: "abc123" (unique)         │
│  pipeline_data: { ... }              │
│  created_at: timestamp               │
│  expires_at: now + 30 days           │
│  view_count: 0                       │
└──────────────────────────────────────┘
        ↓
┌──────────────────────────────────────┐
│  OTHERS VIEW SHARED LINK             │
│  GET /share/abc123                   │
├──────────────────────────────────────┤
│  • Read from afbp.shared_analyses    │
│  • Increment view_count              │
│  • Display read-only dashboard       │
└──────────────────────────────────────┘
```

**Schema Query Example:**
```typescript
// src/app/api/cache/save/route.ts
const { data } = await supabase
  .from('afbp.shared_analyses')  // NEW NAME
  .insert({
    share_id: shareId,
    pipeline_data: pipelineData,
    expires_at: expiresAt
  })
  .select()
  .single()
```

---

## Future Tables (Commented Out Currently)

### afbp.pipeline_job_runs
**Purpose:** Track pipeline execution history
**Status:** Code commented out, will be activated later
**Use Case:** Audit trail, debugging, performance monitoring

```typescript
// Currently commented in parse-picksheet/route.ts
// const { data: jobRun } = await supabase
//   .from('afbp.pipeline_job_runs')
//   .insert({
//     job_type: 'picksheet_parse',
//     status: 'running',
//     metadata: { picksheet_length }
//   })
```

### afbp.pipeline_picks_rows
**Purpose:** Store raw parsed picksheet rows
**Status:** Code commented out, will be activated later
**Use Case:** Data lineage, re-processing, historical analysis

```typescript
// Currently commented in parse-picksheet/route.ts
// await supabase
//   .from('afbp.pipeline_picks_rows')
//   .insert(parsedRows.map(row => ({
//     source_run_id: jobRun.id,  // FK to pipeline_job_runs
//     home_name_raw: row.homeTeam,
//     away_name_raw: row.awayTeam,
//     home_spread_raw: row.spread
//   })))
```

---

## Data Flow Summary

```
User Input (Picksheet Text)
    ↓
Pipeline Processing (In-Memory)
    ↓
    ├─→ afbp.core_schedule (lookup/validation)
    ↓
    ├─→ afbp.analysis_predictions (scrape & store)
    ↓
    └─→ afbp.pipeline_current (save result)
         ↓
         └─→ afbp.shared_analyses (optional sharing)
```

---

## Key Insights About Your Schema

### ✅ What You Actually Use (6 Tables)
1. **afbp.core_schedule** - Game reference data (8 uses)
2. **afbp.pipeline_current** - Current analysis state (4 uses, SINGLETON)
3. **afbp.analysis_predictions** - External predictions (3 uses)
4. **afbp.shared_analyses** - Shareable links (3 uses)
5. **afbp.pipeline_job_runs** - Future: execution tracking
6. **afbp.pipeline_picks_rows** - Future: raw data storage

### ❌ What You Don't Need (18 Tables)
- Pool management (never implemented)
- Team aliases (not needed - using schedule table)
- Market data tables (data stays in memory/current_pipeline)
- Spread analytics tables (calculations done in-memory)
- Dashboard tables (computed from pipeline_current)

### 🎯 Why This Works
- **Simple & Fast:** Only 6 tables to manage
- **Singleton Pattern:** `pipeline_current` always id='current' (one row)
- **Ephemeral Processing:** Most data stays in memory during pipeline
- **Minimal Storage:** Only persist final results & predictions
- **Easy Refresh:** Re-run pipeline with fresh market data anytime

---

## After Migration Benefits

1. **Cleaner Database:** 18 unused tables removed
2. **Clear Separation:** Football pool in `afbp` schema, concert app in `public`
3. **Better Naming:** Domain prefixes show purpose at a glance
4. **Faster Queries:** Smaller schema, easier to navigate
5. **Lower Maintenance:** Only 6 tables to manage vs. 30+
