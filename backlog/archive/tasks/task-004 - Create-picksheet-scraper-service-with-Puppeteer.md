---
id: task-004
title: Create picksheet-scraper service with Puppeteer
status: To Do
assignee: []
created_date: '2025-12-06 09:47'
labels:
  - phase-2
  - backend
  - scraper
  - puppeteer
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the picksheet scraper service that automates fetching picksheet data from officefootballpool.com.

**File:** `app/src/services/picksheet-scraper.ts`

**Key responsibilities:**
1. Login via `app.splashsports.com/sign-in`
2. Navigate to `officefootballpool.com/picksheet_print.cfm?weekid=XXX`
3. Extract picksheet text content
4. Handle auth failures gracefully
5. Calculate weekId from NFL week number

**Week ID Calculation:**
```typescript
// Known reference: Week 14, 2024 season = weekId 648
const REFERENCE = { weekId: 648, nflWeek: 14, season: 2024 }

function calculateWeekId(nflWeek: number, season: number): number {
  const weeksSinceReference =
    ((season - REFERENCE.season) * 18) + (nflWeek - REFERENCE.nflWeek)
  return REFERENCE.weekId + weeksSinceReference
}
```

**Environment Variables Required:**
- `OFFICE_POOL_EMAIL` - Login email
- `OFFICE_POOL_PASSWORD` - Login password

**Interface:**
```typescript
interface PicksheetResult {
  success: boolean
  picksheetText?: string
  gameCount?: number
  weekId?: number
  error?: string
}
```
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Service class exists at app/src/services/picksheet-scraper.ts
- [ ] #2 Login to splashsports.com works with credentials from env vars
- [ ] #3 Navigation to picksheet_print.cfm page works
- [ ] #4 Picksheet text extraction returns game data
- [ ] #5 weekId calculation is correct based on reference data
- [ ] #6 Auth failures return clear error messages
- [ ] #7 Service is reusable from both CLI and API contexts
<!-- AC:END -->
