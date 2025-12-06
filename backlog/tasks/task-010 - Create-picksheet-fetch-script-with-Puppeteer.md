---
id: task-010
title: Create picksheet fetch script with Puppeteer
status: To Do
assignee: []
created_date: '2025-12-06 10:29'
labels:
  - phase-2
  - puppeteer
  - github-actions
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a standalone TypeScript script that fetches the picksheet using Puppeteer.

**File:** `app/scripts/fetch-picksheet.ts`

**Flow:**
1. Calculate weekId from current NFL week (ESPN API)
2. Launch Puppeteer (headless Chrome)
3. Login to splashsports.com with credentials from env vars
4. Navigate to officefootballpool.com/picksheet_print.cfm?weekid=XXX
5. Extract picksheet text from the page
6. POST picksheet to Supabase `pipeline_current` table
7. Trigger /api/refresh-all on the Next.js app

**Week ID Calculation:**
```typescript
const REFERENCE = { weekId: 648, nflWeek: 14, season: 2024 }

function calculateWeekId(nflWeek: number, season: number): number {
  const weeksSinceReference = ((season - REFERENCE.season) * 18) + (nflWeek - REFERENCE.nflWeek)
  return REFERENCE.weekId + weeksSinceReference
}
```

**Environment Variables Required:**
- OFFICE_POOL_EMAIL
- OFFICE_POOL_PASSWORD  
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- APP_URL (optional, for triggering refresh)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Script runs successfully with `npx tsx scripts/fetch-picksheet.ts`
- [ ] #2 Calculates correct weekId from ESPN API
- [ ] #3 Successfully logs into splashsports.com
- [ ] #4 Navigates to correct picksheet URL
- [ ] #5 Extracts picksheet text from page
- [ ] #6 Saves picksheet to Supabase pipeline_current table
- [ ] #7 Logs results to picksheet_fetch_log table
- [ ] #8 Handles errors gracefully with clear messages
<!-- AC:END -->
