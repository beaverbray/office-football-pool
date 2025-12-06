---
id: task-006
title: Add puppeteer dependency and environment setup
status: To Do
assignee: []
created_date: '2025-12-06 09:47'
labels:
  - phase-2
  - setup
  - dependencies
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the necessary dependencies and environment configuration for the picksheet scraper.

**Dependencies to add:**
```bash
npm install puppeteer puppeteer-core
```

**Environment variables to document:**
Add to `.env.example`:
```env
# Picksheet Scraper (Phase 2)
OFFICE_POOL_EMAIL=your-email@example.com
OFFICE_POOL_PASSWORD=your-password
```

**TypeScript types:**
Ensure puppeteer types are available for TypeScript.

**Notes:**
- puppeteer-core is lighter weight for production
- Full puppeteer includes bundled Chromium for local dev
- Consider adding to .gitignore if any browser cache directories are created
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 puppeteer and puppeteer-core are installed
- [ ] #2 .env.example includes OFFICE_POOL_EMAIL and OFFICE_POOL_PASSWORD
- [ ] #3 TypeScript can import puppeteer without errors
- [ ] #4 README or docs updated with environment variable requirements
<!-- AC:END -->
