---
id: task-008
title: Set up pg_cron schedule for automated picksheet fetch
status: To Do
assignee: []
created_date: '2025-12-06 10:10'
labels:
  - phase-2
  - supabase
  - pg_cron
  - automation
dependencies:
  - task-007
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Configure Supabase pg_cron to automatically trigger picksheet fetches before key game times.

**Schedule (Pacific Time):**
- Thursday 6:00 PM - Before TNF
- Sunday 9:00 AM - Before early games
- Sunday 1:00 PM - Before late games
- Monday 5:00 PM - Before MNF

**SQL Migration:**
```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Thursday 6PM PT = Friday 2AM UTC
SELECT cron.schedule(
  'fetch-picksheet-thursday',
  '0 2 * * 5',
  $$SELECT net.http_post(
    url := 'https://PROJECT.supabase.co/functions/v1/fetch-picksheet',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key')
    )
  )$$
);

-- Similar for Sunday morning, Sunday afternoon, Monday
```

**Note:** pg_cron uses UTC, so times need conversion from PT.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pg_cron extension is enabled
- [ ] #2 pg_net extension is enabled for HTTP calls
- [ ] #3 Four cron jobs are scheduled for game times
- [ ] #4 Cron jobs successfully trigger the Edge Function
- [ ] #5 Schedule can be viewed/managed via SQL
<!-- AC:END -->
