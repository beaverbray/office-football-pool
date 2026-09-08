---
id: task-003
title: Update dashboard refresh handler to use /api/refresh-all
status: Done
assignee: []
created_date: '2025-12-06 09:14'
updated_date: '2025-12-06 09:30'
labels:
  - phase-1
  - frontend
  - refresh-all
dependencies:
  - task-001
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update the CompactDashboard component to use the new `/api/refresh-all` endpoint instead of `/api/pipeline/refresh`, and re-fetch predictions after refresh completes.

**File:** `app/src/components/CompactDashboard.tsx`

**Changes to `handleRefresh()` function (around line 274):**
1. Change fetch URL from `/api/pipeline/refresh` to `/api/refresh-all`
2. After successful refresh, re-fetch predictions from `/api/predictions/latest`
3. Update `eloPredictions` state with fresh prediction data
4. Show success message with timing information
5. Handle error cases appropriately

**Current behavior:** Only refreshes market odds
**New behavior:** Refreshes odds AND predictions in one call

**Code location:** Lines 274-318 in CompactDashboard.tsx
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 handleRefresh() calls /api/refresh-all instead of /api/pipeline/refresh
- [x] #2 After successful refresh, predictions are re-fetched from /api/predictions/latest
- [x] #3 eloPredictions state is updated with fresh data
- [x] #4 Success message shows timing information (e.g., 'Refreshed in 12.3s')
- [x] #5 Error handling displays appropriate messages for different failure modes
- [x] #6 Loading state (refreshing) works correctly during the entire operation
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation complete:
- Updated handleRefresh() at line 274 to call /api/refresh-all
- Added prediction re-fetch after successful refresh (lines 314-323)
- Success message shows timing info and games matched count (lines 325-332)
- Error handling for 'No picksheet data found' and 'No picksheet games found' errors
- Loading state (refreshing) properly managed with try/finally

TypeScript check passes.
<!-- SECTION:NOTES:END -->
