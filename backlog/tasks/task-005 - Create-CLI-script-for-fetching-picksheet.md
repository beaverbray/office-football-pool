---
id: task-005
title: Create CLI script for fetching picksheet
status: To Do
assignee: []
created_date: '2025-12-06 09:47'
labels:
  - phase-2
  - cli
  - developer-tools
dependencies:
  - task-004
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a CLI script that developers can run locally to fetch the latest picksheet.

**File:** `app/scripts/fetch-picksheet.ts`

**Usage:**
```bash
# Auto-detect current week
npm run fetch-picksheet

# Specify weekId manually
npm run fetch-picksheet 648
```

**Script behavior:**
1. Accept optional weekId argument
2. Use PicksheetScraper service to fetch
3. Print success/failure status
4. Output picksheet text to stdout
5. Exit with code 1 on failure

**Package.json addition:**
```json
{
  "scripts": {
    "fetch-picksheet": "npx tsx scripts/fetch-picksheet.ts"
  }
}
```

**Example output:**
```
Fetched 25 games for week 648
[picksheet text here...]
```
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Script exists at app/scripts/fetch-picksheet.ts
- [ ] #2 npm run fetch-picksheet command works
- [ ] #3 Optional weekId argument is accepted
- [ ] #4 Success output includes game count and week
- [ ] #5 Picksheet text is printed to stdout
- [ ] #6 Failure exits with code 1 and error message
<!-- AC:END -->
