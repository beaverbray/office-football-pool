---
id: task-002
title: Update NavBar refresh button text and styling
status: Done
assignee: []
created_date: '2025-12-06 09:13'
updated_date: '2025-12-06 09:32'
labels:
  - phase-1
  - frontend
  - refresh-all
dependencies:
  - task-001
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update the NavBar component to reflect the enhanced refresh functionality.

**File:** `app/src/components/NavBar.tsx`

**Changes:**
1. Change button text from "REFRESH" to "REFRESH ALL"
2. Change refreshing state text from "REFRESHING..." to "REFRESHING ALL..."
3. Consider updating button color/styling to indicate it's a more comprehensive action

**Locations to update:**
- Line 85: Desktop button text
- Line 157-158: Mobile menu button text

**Optional enhancement:** Add tooltip or help text explaining what "Refresh All" does (fetches fresh odds and predictions)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Desktop refresh button shows 'REFRESH ALL' instead of 'REFRESH'
- [x] #2 Mobile menu refresh button shows 'REFRESH ALL'
- [x] #3 Loading state shows 'REFRESHING ALL...' or similar
- [x] #4 Button styling is consistent with the enhanced functionality
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Updated both desktop (line 85) and mobile (line 158) button text:
- Normal state: '↻ REFRESH ALL'
- Loading state: 'REFRESHING ALL...'

Used replace_all to update both occurrences. TypeScript check passes.
<!-- SECTION:NOTES:END -->
