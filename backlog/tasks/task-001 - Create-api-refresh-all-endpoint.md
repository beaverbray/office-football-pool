---
id: task-001
title: Create /api/refresh-all endpoint
status: In Progress
assignee: []
created_date: '2025-12-06 09:13'
updated_date: '2025-12-06 09:17'
labels:
  - phase-1
  - api
  - refresh-all
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the main orchestration endpoint that combines week detection, prediction scraping, pipeline refresh, and database persistence into a single API call.

**File:** `app/src/app/api/refresh-all/route.ts`

**Responsibilities:**
1. Detect current week (NFL and NCAA) using WeekDetector
2. Load existing picksheet from `pipeline_current` table
3. Scrape NFELO predictions in parallel
4. Scrape Warren Nolan predictions in parallel
5. Save predictions to `analysis_predictions` table
6. Run pipeline with fresh odds (using existing picksheet games)
7. Save refreshed pipeline to database
8. Return comprehensive response with timing metrics

**Key patterns to follow:**
- Use `Promise.allSettled()` for parallel prediction scraping with graceful degradation
- Follow existing patterns from `/api/nfelo/scrape` and `/api/warren-nolan/scrape` for saving predictions
- Use `supabaseAdmin` for write operations
- Include timing metrics for each stage

**Reference:** See PRD-refresh-all.md for full API interface specification
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 POST /api/refresh-all returns success with pipeline data
- [ ] #2 Week detection works for both NFL and NCAA
- [ ] #3 NFELO predictions are scraped and saved to database
- [ ] #4 Warren Nolan predictions are scraped and saved to database
- [ ] #5 Pipeline runs with fresh odds against existing picksheet games
- [ ] #6 Timing metrics included in response (weekDetection, predictionsScrape, pipelineExecution, total)
- [ ] #7 Graceful degradation if prediction scraping fails (continue with odds only)
- [ ] #8 Returns 400 error with helpful message if no picksheet exists
<!-- AC:END -->
