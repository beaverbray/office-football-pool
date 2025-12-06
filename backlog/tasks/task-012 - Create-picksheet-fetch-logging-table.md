---
id: task-012
title: Create picksheet fetch logging table
status: In Progress
assignee: []
created_date: '2025-12-06 10:29'
updated_date: '2025-12-06 10:32'
labels:
  - phase-2
  - database
  - monitoring
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a database table to log picksheet fetch attempts for monitoring.

**Migration SQL:**
```sql
CREATE TABLE afbp.picksheet_fetch_log (
  id SERIAL PRIMARY KEY,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  week_id INTEGER,
  nfl_week INTEGER,
  season INTEGER,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  duration_ms INTEGER,
  source TEXT NOT NULL,  -- 'github_actions' | 'manual'
  picksheet_length INTEGER  -- character count of fetched picksheet
);

-- Index for querying recent fetches
CREATE INDEX idx_picksheet_fetch_log_triggered_at 
ON afbp.picksheet_fetch_log(triggered_at DESC);
```

This table allows monitoring fetch success/failure rates and debugging issues.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Migration creates table successfully
- [ ] #2 Table exists in afbp schema
- [ ] #3 fetch-picksheet.ts logs to this table
- [ ] #4 Can query recent fetch attempts
<!-- AC:END -->
