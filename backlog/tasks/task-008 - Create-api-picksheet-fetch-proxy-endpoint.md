---
id: task-008
title: Create /api/picksheet/fetch proxy endpoint
status: To Do
assignee: []
created_date: '2025-12-06 10:10'
labels:
  - phase-2
  - api
  - frontend
dependencies:
  - task-007
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a Next.js API route that proxies requests to the Supabase Edge Function, enabling manual picksheet fetch from the frontend.

**File:** `app/src/app/api/picksheet/fetch/route.ts`

```typescript
import { NextResponse } from 'next/server'

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { success: false, error: 'Missing Supabase configuration' },
      { status: 500 }
    )
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/fetch-picksheet`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ source: 'manual' })
    }
  )

  const data = await response.json()
  return NextResponse.json(data, { status: response.status })
}
```

This allows the Control Panel to have a "Fetch Picksheet" button.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 API route exists at /api/picksheet/fetch
- [ ] #2 POST request triggers Edge Function
- [ ] #3 Response includes success/error status
- [ ] #4 Works from Control Panel frontend
<!-- AC:END -->
