---
id: task-011
title: Create GitHub Actions workflow for picksheet fetch
status: To Do
assignee: []
created_date: '2025-12-06 10:29'
labels:
  - phase-2
  - github-actions
  - ci-cd
dependencies:
  - task-010
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a GitHub Actions workflow that runs the picksheet fetch script on a schedule.

**File:** `.github/workflows/fetch-picksheet.yml`

**Schedule:** Thursday 6PM PT (Friday 2AM UTC) - before Thursday Night Football

**Features:**
- Scheduled cron trigger
- Manual workflow_dispatch trigger
- Uses Node.js 20 with npm caching
- Runs the fetch-picksheet.ts script
- Passes secrets as environment variables

**Workflow:**
```yaml
name: Fetch Picksheet

on:
  schedule:
    - cron: '0 2 * * 5'  # Friday 2AM UTC = Thursday 6PM PT
  workflow_dispatch:

jobs:
  fetch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: app/package-lock.json
      - name: Install dependencies
        working-directory: app
        run: npm ci
      - name: Fetch picksheet
        working-directory: app
        env:
          OFFICE_POOL_EMAIL: ${{ secrets.OFFICE_POOL_EMAIL }}
          OFFICE_POOL_PASSWORD: ${{ secrets.OFFICE_POOL_PASSWORD }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          APP_URL: ${{ secrets.APP_URL }}
        run: npx tsx scripts/fetch-picksheet.ts
```
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Workflow file exists at .github/workflows/fetch-picksheet.yml
- [ ] #2 Scheduled to run Thursday 6PM PT
- [ ] #3 workflow_dispatch enabled for manual trigger
- [ ] #4 All required secrets are documented
- [ ] #5 Script executes successfully in GitHub Actions
<!-- AC:END -->
