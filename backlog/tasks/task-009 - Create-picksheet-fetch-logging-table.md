---
id: task-009
title: Create picksheet fetch logging table
status: To Do
assignee: []
created_date: '2025-12-06 10:10'
labels:
  - phase-2
  - supabase
  - database
  - monitoring
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a table to log picksheet fetch attempts for monitoring and debugging.

**SQL Migration:**
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
  source TEXT NOT NULL,  -- 'cron' | 'manual'
  games_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying recent fetches
CREATE INDEX idx_picksheet_fetch_log_triggered 
  ON afbp.picksheet_fetch_log(triggered_at DESC);
```

**Edge Function should log:**
- Start time, end time, duration
- Success/failure status
- Error message if failed
- Number of games extracted
- Source (cron vs manual)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Table afbp.picksheet_fetch_log exists
- [ ] #2 Edge Function logs all fetch attempts
- [ ] #3 Successful fetches show games_count
- [ ] #4 Failed fetches include error_message
- [ ] #5 Source field distinguishes cron vs manual
<!-- AC:END -->
