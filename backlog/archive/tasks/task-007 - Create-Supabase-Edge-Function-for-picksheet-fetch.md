---
id: task-007
title: Create Supabase Edge Function for picksheet fetch
status: To Do
assignee: []
created_date: '2025-12-06 10:10'
labels:
  - phase-2
  - supabase
  - edge-function
  - browserless
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the Supabase Edge Function that fetches picksheet data using Browserless.io.

**File:** `supabase/functions/fetch-picksheet/index.ts`

**Flow:**
1. Receive trigger from pg_cron or manual invocation
2. Get current NFL week from ESPN API
3. Calculate weekId using reference formula
4. Call Browserless.io API to:
   - Login to splashsports.com
   - Navigate to officefootballpool.com/picksheet_print.cfm?weekid=XXX
   - Extract picksheet text
5. Save picksheet to `pipeline_current` table
6. Call Next.js `/api/refresh-all` to complete refresh

**Browserless.io API:**
```typescript
const response = await fetch('https://chrome.browserless.io/content', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${Deno.env.get('BROWSERLESS_API_KEY')}`
  },
  body: JSON.stringify({
    url: 'https://app.splashsports.com/sign-in',
    gotoOptions: { waitUntil: 'networkidle0' },
    // ... browser automation steps
  })
})
```

**Supabase Secrets Required:**
- BROWSERLESS_API_KEY
- OFFICE_POOL_EMAIL
- OFFICE_POOL_PASSWORD
- APP_URL (Next.js app URL)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Edge Function deploys successfully to Supabase
- [ ] #2 Browserless.io integration works with login flow
- [ ] #3 Picksheet text is extracted correctly
- [ ] #4 Data is saved to pipeline_current table
- [ ] #5 /api/refresh-all is triggered after fetch
- [ ] #6 Error handling returns clear messages
- [ ] #7 Function can be invoked manually for testing
<!-- AC:END -->
