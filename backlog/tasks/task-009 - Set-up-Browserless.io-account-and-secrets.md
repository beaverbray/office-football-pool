---
id: task-009
title: Set up Browserless.io account and secrets
status: To Do
assignee: []
created_date: '2025-12-06 10:10'
labels:
  - phase-2
  - setup
  - browserless
  - secrets
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a Browserless.io account and configure Supabase secrets for the picksheet scraper.

**Steps:**
1. Sign up at browserless.io (free tier = 1000 requests/month)
2. Get API key from dashboard
3. Set Supabase secrets:
```bash
supabase secrets set BROWSERLESS_API_KEY=your-key
supabase secrets set OFFICE_POOL_EMAIL=your-email
supabase secrets set OFFICE_POOL_PASSWORD=your-password
supabase secrets set APP_URL=https://your-app.vercel.app
```

4. Test API key works with simple request

**Free tier limits:**
- 1,000 requests/month
- 30 second timeout per request
- Sufficient for ~16 scheduled fetches/month + manual testing
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Browserless.io account created
- [ ] #2 API key obtained and tested
- [ ] #3 All secrets set in Supabase
- [ ] #4 Simple test request succeeds
<!-- AC:END -->
