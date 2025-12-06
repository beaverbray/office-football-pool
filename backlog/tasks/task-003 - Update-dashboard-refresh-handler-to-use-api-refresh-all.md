---
id: task-003
title: Update dashboard refresh handler to use /api/refresh-all
status: To Do
assignee: []
created_date: '2025-12-06 09:14'
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
- [ ] #1 handleRefresh() calls /api/refresh-all instead of /api/pipeline/refresh
- [ ] #2 After successful refresh, predictions are re-fetched from /api/predictions/latest
- [ ] #3 eloPredictions state is updated with fresh data
- [ ] #4 Success message shows timing information (e.g., 'Refreshed in 12.3s')
- [ ] #5 Error handling displays appropriate messages for different failure modes
- [ ] #6 Loading state (refreshing) works correctly during the entire operation
<!-- AC:END -->
