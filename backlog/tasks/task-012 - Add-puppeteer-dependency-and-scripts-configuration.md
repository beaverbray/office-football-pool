---
id: task-012
title: Add puppeteer dependency and scripts configuration
status: To Do
assignee: []
created_date: '2025-12-06 10:29'
labels:
  - phase-2
  - dependencies
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add Puppeteer as a dev dependency for the picksheet fetch script.

**Commands:**
```bash
cd app
npm install puppeteer --save-dev
```

**Notes:**
- Puppeteer is only used in GitHub Actions, not in the Next.js app
- Puppeteer automatically downloads Chromium during npm install
- In GitHub Actions, Ubuntu runners have necessary dependencies pre-installed
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 puppeteer added to devDependencies in package.json
- [ ] #2 npm install completes successfully
- [ ] #3 Puppeteer can be imported in scripts/fetch-picksheet.ts
<!-- AC:END -->
