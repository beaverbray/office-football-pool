---
id: task-011
title: Set up GitHub repository secrets for picksheet fetch
status: To Do
assignee: []
created_date: '2025-12-06 10:29'
labels:
  - phase-2
  - setup
  - secrets
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Configure GitHub repository secrets required for the picksheet fetch workflow.

**Secrets to add (Settings → Secrets and variables → Actions):**

1. `OFFICE_POOL_EMAIL` - Login email for splashsports.com
2. `OFFICE_POOL_PASSWORD` - Login password for splashsports.com
3. `SUPABASE_URL` - Supabase project URL (already may exist)
4. `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key for writes
5. `APP_URL` - Production app URL (e.g., https://your-app.vercel.app)

**Steps:**
1. Go to GitHub repo → Settings → Secrets and variables → Actions
2. Click "New repository secret" for each secret
3. Test by manually triggering the workflow
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All 5 secrets are configured in GitHub
- [ ] #2 Secrets are not exposed in logs
- [ ] #3 Manual workflow trigger succeeds with secrets
<!-- AC:END -->
