# Office Football Pool - 8-10 Week Complete Refactoring Plan

**Created**: 2025-11-08
**Purpose**: Systematic refactoring to address 47 identified issues from codebase analysis
**Total Issues**: 6 Critical, 23 High, 18 Medium, 6 Low
**Estimated Duration**: 8-10 weeks (1 senior developer full-time)

---

## Overview

This plan addresses all architectural, security, performance, and quality issues identified in the comprehensive codebase analysis. The approach prioritizes critical security and stability concerns first, then builds quality foundations before tackling architectural improvements.

**Key Principles**:
- Work incrementally with feature branches
- Maintain backward compatibility during refactoring
- Comprehensive testing before major changes
- Feature flags for gradual rollout
- Continuous validation and monitoring

---

## Phase 1: Critical Security & Testing Foundation (Week 1)

**Goal**: Fix immediate security vulnerabilities and establish testing infrastructure

### Tasks

#### 1.1 Set up Testing Infrastructure
- [ ] Install dependencies: `jest`, `@testing-library/react`, `@testing-library/jest-dom`, `ts-jest`
- [ ] Create `jest.config.js` with TypeScript support
- [ ] Add test scripts to `package.json`:
  - `test`: Run all tests
  - `test:watch`: Watch mode
  - `test:coverage`: Generate coverage report
- [ ] Create test utilities: `__tests__/utils/test-helpers.ts`
- [ ] Set up test database configuration
- [ ] Create initial smoke test to verify setup

**Files to Create**:
- `jest.config.js`
- `__tests__/utils/test-helpers.ts`
- `__tests__/setup.ts`
- `__tests__/example.test.ts` (initial smoke test)

**Validation**: `npm test` runs successfully, coverage report generated

---

#### 1.2 Add Input Validation (Zod Schemas)
- [ ] Create validation schemas: `src/lib/validation/schemas.ts`
  - `PipelineInputSchema` (picksheet, week, options)
  - `OddsRequestSchema` (sport, refresh)
  - `ParseLLMSchema` (text with length limits)
  - `JobIdSchema` (UUID validation)
- [ ] Create validation middleware: `src/lib/validation/middleware.ts`
- [ ] Update all API routes to use validation:
  - `src/app/api/pipeline/run/route.ts`
  - `src/app/api/pipeline/status/route.ts`
  - `src/app/api/odds/route.ts`
  - `src/app/api/parse-llm/route.ts`
- [ ] Add validation error responses (400 Bad Request)
- [ ] Write tests for all schemas

**Files to Create**:
- `src/lib/validation/schemas.ts`
- `src/lib/validation/middleware.ts`
- `__tests__/lib/validation/schemas.test.ts`

**Files to Modify**:
- All API route files to use validation

**Validation**: All API routes reject invalid inputs with proper error messages

---

#### 1.3 Fix Security Vulnerabilities
- [ ] Remove env var exposure from API responses
  - Remove `hasOddsAPIKey` and `hasOpenAIKey` from responses
  - Remove console.log statements that log API key presence
- [ ] Add rate limiting middleware
  - Install `@upstash/ratelimit` or equivalent
  - Create `src/lib/rate-limit.ts`
  - Apply to all API routes (10 requests/minute per IP)
- [ ] Sanitize error messages
  - Create error sanitization utility
  - Hide stack traces in production
  - Generic messages for 500 errors
  - Detailed errors only in development
- [ ] Add environment variable validation
  - Create `src/lib/env.ts`
  - Use Zod to validate required env vars on startup
  - Fail fast if configuration invalid

**Files to Create**:
- `src/lib/rate-limit.ts`
- `src/lib/env.ts`
- `src/lib/error-sanitizer.ts`

**Files to Modify**:
- `src/app/api/pipeline/run/route.ts` (remove env var exposure)
- `src/app/api/parse-llm/route.ts` (remove console.log)
- All API routes (add rate limiting)

**Validation**: No env vars exposed, rate limiting active, sanitized errors in production

---

#### 1.4 Convert Singletons to Factories
- [ ] Refactor `PipelineOrchestrator` to factory function
  - Change `export const pipelineOrchestrator = new PipelineOrchestrator()`
  - To `export function createPipelineOrchestrator(): PipelineOrchestrator`
- [ ] Refactor `JobQueue` to factory function
  - Change `export const jobQueue = new JobQueue()`
  - To `export function createJobQueue(): JobQueue`
- [ ] Update all imports across codebase
  - API routes create instances per request
  - No shared state between requests
- [ ] Add tests for factories
  - Test instance creation
  - Test instance isolation

**Files to Modify**:
- `src/services/pipeline-orchestrator.ts`
- `src/services/job-queue.ts`
- All API routes that import these services

**Files to Create**:
- `__tests__/services/pipeline-orchestrator.test.ts`
- `__tests__/services/job-queue.test.ts`

**Validation**: Each request gets isolated instances, no singleton pattern, basic tests passing

---

### Phase 1 Success Criteria
- ✅ Test infrastructure operational
- ✅ All API routes have input validation
- ✅ Rate limiting active on all endpoints
- ✅ No environment variables exposed
- ✅ No singleton pattern in use
- ✅ Basic test coverage (>10%)

---

## Phase 2: Job Queue & Background Processing (Week 2)

**Goal**: Replace in-memory job queue with production-ready solution

### Tasks

#### 2.1 Set up Redis/Vercel KV
- [ ] Choose solution: Vercel KV (recommended) or Upstash Redis
- [ ] Add to project:
  - Install `@vercel/kv` or `@upstash/redis`
  - Configure connection in `.env`
  - Add connection pooling configuration
- [ ] Create abstraction layer: `src/lib/redis.ts`
  - Export configured Redis client
  - Add connection health check
  - Add error handling for connection failures
- [ ] Add monitoring
  - Log connection events
  - Track Redis operations

**Files to Create**:
- `src/lib/redis.ts`
- `__tests__/lib/redis.test.ts`

**Environment Variables**:
- `KV_REST_API_URL` or `UPSTASH_REDIS_REST_URL`
- `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_TOKEN`

**Validation**: Redis connection working, health checks passing

---

#### 2.2 Implement Persistent Job Queue
- [ ] Create new job queue: `src/services/job-queue-v2.ts`
  - Redis-backed storage
  - Job persistence with TTL
  - Status tracking: pending, running, completed, failed
  - Retry logic with exponential backoff
  - Dead letter queue for permanently failed jobs
- [ ] Implement job operations:
  - `createJob(input)`: Create and persist job
  - `startJob(jobId)`: Mark job as running
  - `completeJob(jobId, result)`: Store result
  - `failJob(jobId, error)`: Handle failure with retry
  - `getJob(jobId)`: Retrieve job status
  - `listJobs(status?)`: List jobs by status
- [ ] Add automatic cleanup:
  - Remove completed jobs after 24 hours
  - Remove failed jobs after 7 days
  - Implement efficient cleanup using Redis TTL
- [ ] Add job prioritization (optional for v1)

**Files to Create**:
- `src/services/job-queue-v2.ts`
- `src/types/job.ts` (job type definitions)
- `__tests__/services/job-queue-v2.test.ts`

**Validation**: Jobs persist across restarts, retry on transient failures, cleanup working

---

#### 2.3 Replace setImmediate Pattern
- [ ] Evaluate background job solutions:
  - Option A: Vercel Background Functions (if available)
  - Option B: Queue-based processing with separate worker
  - Option C: Inngest or similar service
- [ ] Implement chosen solution
- [ ] Update pipeline run endpoint:
  - Remove `setImmediate` pattern
  - Use proper background job execution
  - Add timeout handling (max 60s for serverless)
  - Add error boundaries
- [ ] Add observability:
  - Log job start/completion
  - Track execution time
  - Alert on failures

**Files to Modify**:
- `src/app/api/pipeline/run/route.ts`

**Files to Create** (if needed):
- Background job handler or worker configuration

**Validation**: Background jobs execute reliably, errors caught and logged, no silent failures

---

#### 2.4 Write Comprehensive Job Queue Tests
- [ ] Unit tests for job queue operations
  - Test job creation, retrieval, status updates
  - Test TTL and cleanup
  - Test retry logic
- [ ] Integration tests with Redis
  - Test persistence across connections
  - Test concurrent operations
  - Test error handling
- [ ] Test retry scenarios
  - Transient failures retry successfully
  - Permanent failures go to dead letter queue
  - Exponential backoff works correctly
- [ ] Test cleanup and expiration
  - Jobs expire after TTL
  - Cleanup runs as expected

**Files to Create**:
- `__tests__/services/job-queue-v2.test.ts`
- `__tests__/integration/job-queue.integration.test.ts`

**Validation**: 90%+ test coverage for job queue, all edge cases tested

---

### Phase 2 Success Criteria
- ✅ Redis/Vercel KV configured and connected
- ✅ Jobs persist across server restarts
- ✅ Retry logic working with exponential backoff
- ✅ No data loss on failures
- ✅ Background jobs execute reliably
- ✅ 90%+ test coverage for job queue

---

## Phase 3: Service Layer Refactoring (Week 3-4)

**Goal**: Split God classes and implement proper service architecture

### Week 3: Split PipelineOrchestrator

#### 3.1 Create Service Architecture
- [ ] Create service directory: `src/services/pipeline/`
- [ ] Define service interfaces: `src/services/pipeline/interfaces.ts`
  - `IPicksheetService`
  - `IOddsService`
  - `IMatchingService`
  - `IComparisonService`
  - `ICacheService`
  - `ILoggingService`

**Files to Create**:
- `src/services/pipeline/interfaces.ts`

---

#### 3.2 Extract PicksheetService
- [ ] Create `src/services/pipeline/picksheet-service.ts`
- [ ] Move parsing logic from PipelineOrchestrator
  - LLM parsing (lines 275-370)
  - Manual game parsing
  - Validation logic
- [ ] Implement interface `IPicksheetService`
- [ ] Add comprehensive tests
  - Test LLM parsing with mock responses
  - Test manual parsing
  - Test error handling

**Files to Create**:
- `src/services/pipeline/picksheet-service.ts`
- `__tests__/services/pipeline/picksheet-service.test.ts`

**Validation**: Picksheet parsing extracted, tested independently

---

#### 3.3 Extract OddsService
- [ ] Create `src/services/pipeline/odds-service.ts`
- [ ] Move odds retrieval logic from PipelineOrchestrator
  - ESPN API integration (lines 371-400)
  - Odds API integration
  - Response parsing
  - Error handling
- [ ] Implement interface `IOddsService`
- [ ] Add caching layer
- [ ] Add comprehensive tests with API mocks

**Files to Create**:
- `src/services/pipeline/odds-service.ts`
- `__tests__/services/pipeline/odds-service.test.ts`

**Validation**: Odds retrieval extracted, API calls mocked in tests

---

#### 3.4 Extract MatchingService
- [ ] Create `src/services/pipeline/matching-service.ts`
- [ ] Move game matching logic from PipelineOrchestrator
  - Schedule-based matching (lines 482-576)
  - Legacy matching (lines 582-739)
  - Entity resolution integration
  - Threshold-based matching
- [ ] Implement interface `IMatchingService`
- [ ] Add comprehensive tests
  - Test exact matches
  - Test fuzzy matches
  - Test edge cases (duplicates, missing games)

**Files to Create**:
- `src/services/pipeline/matching-service.ts`
- `__tests__/services/pipeline/matching-service.test.ts`

**Validation**: Matching logic extracted, all matching scenarios tested

---

#### 3.5 Extract ComparisonService
- [ ] Create `src/services/pipeline/comparison-service.ts`
- [ ] Move comparison logic from PipelineOrchestrator (lines 744-908)
- [ ] Implement interface `IComparisonService`
- [ ] Add spread comparison logic
- [ ] Add comprehensive tests

**Files to Create**:
- `src/services/pipeline/comparison-service.ts`
- `__tests__/services/pipeline/comparison-service.test.ts`

**Validation**: Comparison logic extracted and tested

---

#### 3.6 Create New PipelineOrchestrator
- [ ] Create slim orchestrator: `src/services/pipeline/pipeline-orchestrator-v2.ts`
- [ ] Responsibilities: coordination ONLY
  - Accept dependencies via constructor (DI)
  - Coordinate service calls
  - Handle progress callbacks
  - Manage overall flow
- [ ] Keep orchestrator under 200 lines
- [ ] Add comprehensive tests with service mocks

**Files to Create**:
- `src/services/pipeline/pipeline-orchestrator-v2.ts`
- `__tests__/services/pipeline/pipeline-orchestrator-v2.test.ts`

**Validation**: Orchestrator only coordinates, no business logic, <200 lines

---

### Week 4: Dependency Injection & API Route Cleanup

#### 3.7 Extract Business Logic from API Routes
- [ ] Create `src/services/pipeline/pipeline-service.ts`
- [ ] Move all business logic from API routes
  - Request validation
  - Service coordination
  - Error handling
  - Response formatting
- [ ] API routes become thin HTTP layers:
  - Parse request
  - Call service
  - Format response
  - Handle HTTP-specific concerns only

**Files to Create**:
- `src/services/pipeline/pipeline-service.ts`
- `__tests__/services/pipeline/pipeline-service.test.ts`

**Files to Modify**:
- `src/app/api/pipeline/run/route.ts` (thin down to <50 lines)
- `src/app/api/pipeline/status/route.ts`

**Validation**: API routes <50 lines each, business logic in services

---

#### 3.8 Implement Dependency Injection
- [ ] Create DI container: `src/lib/di-container.ts`
- [ ] Use lightweight DI library (tsyringe or awilix) or manual factory
- [ ] Register all services:
  - `PicksheetService`
  - `OddsService`
  - `MatchingService`
  - `ComparisonService`
  - `PipelineService`
- [ ] Update API routes to use DI:
  - Resolve services from container
  - Pass dependencies explicitly
- [ ] Add container lifecycle management

**Files to Create**:
- `src/lib/di-container.ts`
- `__tests__/lib/di-container.test.ts`

**Files to Modify**:
- All API routes to use DI container

**Validation**: All dependencies injected, no hard-coded imports, easily mockable

---

#### 3.9 Add Comprehensive Service Tests
- [ ] Achieve 80%+ coverage for all services
- [ ] Unit tests for each service method
- [ ] Integration tests for service interactions
- [ ] Mock external dependencies (APIs, database)
- [ ] Test error handling paths
- [ ] Test edge cases and boundary conditions

**Target Coverage**:
- `PicksheetService`: 85%+
- `OddsService`: 80%+
- `MatchingService`: 90%+
- `ComparisonService`: 85%+
- `PipelineService`: 80%+

**Validation**: `npm run test:coverage` shows 80%+ for all services

---

### Phase 3 Success Criteria
- ✅ PipelineOrchestrator split into 5+ focused services
- ✅ Each service has single responsibility
- ✅ API routes are thin HTTP layers (<50 lines)
- ✅ Dependency injection implemented
- ✅ 80%+ test coverage for all services
- ✅ No God classes remaining

---

## Phase 4: Data Migration & Performance (Week 5)

**Goal**: Eliminate code duplication and optimize performance

### Tasks

#### 4.1 Migrate Team Mappings to Database
- [ ] Design database schema:
  - `teams` table (id, league, name, abbreviation, aliases)
  - `team_aliases` table (team_id, alias, fuzzy_score)
  - Add indexes for fast lookups
- [ ] Create migration scripts:
  - `migrations/001_create_teams_tables.sql`
  - `migrations/002_seed_nfl_teams.sql`
  - `migrations/003_seed_ncaaf_teams.sql`
- [ ] Extract team data from `entity-resolution.ts`:
  - Convert NFL_TEAM_MAPPINGS to SQL inserts
  - Convert NCAAF_TEAM_MAPPINGS to SQL inserts
  - Preserve all aliases and variations
- [ ] Run migrations
- [ ] Update EntityResolver to query database:
  - Replace in-memory maps with database queries
  - Add query optimization
  - Implement caching (next task)

**Files to Create**:
- `migrations/001_create_teams_tables.sql`
- `migrations/002_seed_nfl_teams.sql`
- `migrations/003_seed_ncaaf_teams.sql`
- `src/lib/db/teams-repository.ts`
- `__tests__/lib/db/teams-repository.test.ts`

**Files to Modify**:
- `src/services/entity-resolution.ts` (remove hardcoded data, use database)

**Validation**: Team data in database, EntityResolver queries database successfully

---

#### 4.2 Implement Redis Caching Strategy
- [ ] Create cache service: `src/services/cache-service.ts`
- [ ] Implement caching for frequently accessed data:
  - Team mappings (cache for 24 hours)
  - Odds data (cache for 5 minutes)
  - Schedule data (cache for 1 hour)
  - Entity resolution results (cache for 1 hour)
- [ ] Implement cache strategies:
  - LRU eviction policy
  - TTL-based expiration
  - Cache warming on startup
  - Manual cache invalidation endpoints
- [ ] Add cache metrics:
  - Hit/miss ratio
  - Cache size
  - Eviction count
- [ ] Update services to use cache:
  - Check cache before database/API
  - Store results in cache
  - Handle cache failures gracefully

**Files to Create**:
- `src/services/cache-service.ts`
- `src/lib/cache-config.ts`
- `__tests__/services/cache-service.test.ts`

**Files to Modify**:
- `src/services/entity-resolution.ts` (add caching)
- `src/services/pipeline/odds-service.ts` (add caching)

**Validation**: Cache hit rate >70% for repeated requests, sub-200ms response times

---

#### 4.3 Add Database Connection Pooling
- [ ] Configure Supabase client with connection pooling:
  ```typescript
  const supabase = createClient(url, key, {
    db: {
      pool: {
        min: 2,
        max: 10,
        idleTimeoutMillis: 30000
      }
    }
  })
  ```
- [ ] Create database utility: `src/lib/db/client.ts`
  - Export configured Supabase client
  - Add connection health checks
  - Add connection metrics
- [ ] Monitor connection usage:
  - Log active connections
  - Alert on connection pool exhaustion
- [ ] Update all database queries to use pooled client

**Files to Create**:
- `src/lib/db/client.ts`
- `src/lib/db/health-check.ts`

**Files to Modify**:
- All files that create Supabase clients

**Validation**: Connection pool active, no connection exhaustion, metrics tracked

---

#### 4.4 Optimize Component Performance
- [ ] Split CompactDashboard into smaller components:
  - `GameCard.tsx` - Individual game display
  - `FilterPanel.tsx` - Filtering controls
  - `SortControls.tsx` - Sorting options
  - `GameList.tsx` - Game list container
  - `CompactDashboard.tsx` - Top-level orchestration
- [ ] Move expensive operations to server:
  - Pre-compute normalized team names in API
  - Return normalized data from backend
  - Remove client-side EntityResolver
- [ ] Optimize React rendering:
  - Use React.memo for expensive components
  - Optimize useMemo dependencies
  - Implement virtualization for long lists
  - Use React Context for shared services
- [ ] Add performance monitoring:
  - Track component render times
  - Monitor re-render frequency
  - Add React DevTools profiling

**Files to Create**:
- `src/components/dashboard/GameCard.tsx`
- `src/components/dashboard/FilterPanel.tsx`
- `src/components/dashboard/SortControls.tsx`
- `src/components/dashboard/GameList.tsx`

**Files to Modify**:
- `src/components/CompactDashboard.tsx` (split into smaller components)

**Validation**: Component <500 lines, server-side normalization, no client-side EntityResolver

---

### Phase 4 Success Criteria
- ✅ Team data stored in database (not code)
- ✅ Redis caching with >70% hit rate
- ✅ Database connection pooling configured
- ✅ API response times <200ms (p95)
- ✅ CompactDashboard split into focused components
- ✅ No client-side expensive operations

---

## Phase 5: Testing & Quality (Week 6)

**Goal**: Achieve comprehensive test coverage and error handling

### Tasks

#### 5.1 Expand Test Coverage to 80%
- [ ] Add tests for remaining services:
  - `entity-resolution.ts`
  - `robust-spread-metric.ts`
  - `comparison-engine.ts`
  - `week-detector.ts`
- [ ] Add tests for utilities and helpers:
  - Validation helpers
  - Error sanitizers
  - Cache utilities
  - Database helpers
- [ ] Add tests for components:
  - CompactDashboard and sub-components
  - Other UI components
- [ ] Fill coverage gaps identified by coverage report

**Target Files**:
- All services: 80%+ coverage
- All utilities: 85%+ coverage
- All components: 70%+ coverage

**Validation**: Overall project coverage ≥80%

---

#### 5.2 Add Integration Tests
- [ ] Create integration test suite: `__tests__/integration/`
- [ ] Test API routes end-to-end:
  - Pipeline run endpoint with real services
  - Odds retrieval endpoint
  - Status checking endpoint
  - Parse LLM endpoint
- [ ] Test database operations:
  - Team repository CRUD operations
  - Cache service with Redis
  - Job queue with Redis
- [ ] Test external API integrations:
  - Mock ESPN API responses
  - Mock Odds API responses
  - Mock OpenAI API responses
- [ ] Test error scenarios:
  - API failures
  - Database failures
  - Timeout handling

**Files to Create**:
- `__tests__/integration/api-routes.test.ts`
- `__tests__/integration/database.test.ts`
- `__tests__/integration/external-apis.test.ts`

**Validation**: All API routes tested end-to-end, external dependencies mocked

---

#### 5.3 Add E2E Tests
- [ ] Set up Playwright or Cypress
- [ ] Install dependencies and configure
- [ ] Test critical user flows:
  - Upload picksheet and run pipeline
  - View pipeline results
  - Check job status
  - View ELO predictions
  - Filter and sort games
- [ ] Test UI interactions:
  - Form submissions
  - Button clicks
  - Navigation
  - Error states
- [ ] Test across browsers:
  - Chrome
  - Firefox
  - Safari (if possible)

**Files to Create**:
- `e2e/pipeline.spec.ts`
- `e2e/dashboard.spec.ts`
- `playwright.config.ts` or `cypress.config.ts`

**Validation**: All critical paths tested, E2E tests passing

---

#### 5.4 Standardize Error Handling
- [ ] Create error hierarchy: `src/lib/errors/`
  - `AppError` - Base error class
  - `ValidationError` - Input validation failures
  - `NotFoundError` - Resource not found
  - `UnauthorizedError` - Auth failures
  - `RateLimitError` - Rate limit exceeded
  - `ExternalAPIError` - External API failures
  - `DatabaseError` - Database operation failures
- [ ] Implement Result<T> pattern:
  - `type Result<T> = Success<T> | Failure`
  - Use for fallible operations
  - Clear error handling without try-catch everywhere
- [ ] Add error middleware:
  - Catch all errors in API routes
  - Map errors to HTTP status codes
  - Sanitize error messages for production
  - Log errors with context
- [ ] Centralize error logging:
  - Structured error logs
  - Include request context
  - Add error tracking (Sentry optional)

**Files to Create**:
- `src/lib/errors/app-error.ts`
- `src/lib/errors/validation-error.ts`
- `src/lib/errors/not-found-error.ts`
- `src/lib/errors/index.ts`
- `src/lib/result.ts`
- `src/middleware/error-handler.ts`

**Files to Modify**:
- All services to return Result<T>
- All API routes to use error middleware

**Validation**: Consistent error handling, proper HTTP status codes, sanitized errors

---

### Phase 5 Success Criteria
- ✅ 80%+ overall test coverage
- ✅ All critical paths have integration tests
- ✅ E2E tests covering major user flows
- ✅ Consistent error handling throughout
- ✅ Proper error types and Result pattern
- ✅ CI pipeline passing all tests

---

## Phase 6: Documentation & Maintainability (Week 7)

**Goal**: Make codebase maintainable and onboarding friendly

### Tasks

#### 6.1 Add JSDoc Comments
- [ ] Document all public APIs:
  - All service classes and methods
  - All utility functions
  - All type definitions
  - All React components
- [ ] Include in JSDoc:
  - Parameter descriptions with types
  - Return value descriptions
  - Throws declarations
  - Usage examples
  - Related functions/classes
- [ ] Use consistent format:
  ```typescript
  /**
   * Parses picksheet text using LLM
   *
   * @param text - The picksheet text to parse
   * @param options - Parsing options
   * @returns Parsed games array or error
   * @throws {ValidationError} If text is invalid
   *
   * @example
   * const result = await parsePicksheet("Game 1: Team A vs Team B")
   */
  ```

**Target**: Every public API documented

**Validation**: Generate TypeDoc, verify completeness

---

#### 6.2 Create Architecture Documentation
- [ ] Create `docs/architecture/` directory
- [ ] System architecture diagram:
  - High-level component diagram
  - Service dependencies
  - Data flow
  - External integrations
- [ ] Data flow diagrams:
  - Pipeline execution flow
  - Odds retrieval flow
  - Game matching flow
  - Comparison flow
- [ ] Service dependency graph:
  - Service relationships
  - Dependency directions
  - Interface definitions
- [ ] Deployment architecture:
  - Vercel deployment
  - Redis/KV setup
  - Database configuration
  - Environment variables

**Files to Create**:
- `docs/architecture/system-overview.md`
- `docs/architecture/data-flow.md`
- `docs/architecture/service-dependencies.md`
- `docs/architecture/deployment.md`
- Diagrams (Mermaid or draw.io)

**Validation**: Complete architecture documentation, clear diagrams

---

#### 6.3 Set up API Documentation
- [ ] Generate OpenAPI specification:
  - Use `@asteasolutions/zod-to-openapi` or similar
  - Generate from Zod schemas
  - Include all endpoints
  - Add examples
- [ ] Set up Swagger UI:
  - Add Swagger UI route: `/api/docs`
  - Serve OpenAPI spec
  - Interactive API testing
- [ ] Document all endpoints:
  - Request parameters
  - Request body schemas
  - Response schemas
  - Error responses
  - Examples for each endpoint
- [ ] Add authentication docs (once implemented)

**Files to Create**:
- `src/lib/openapi.ts`
- `src/app/api/docs/route.ts`
- `docs/api/README.md`

**Validation**: Swagger UI accessible, all endpoints documented

---

#### 6.4 Create Development Guides
- [ ] Create comprehensive README:
  - Project overview
  - Quick start guide
  - Prerequisites
  - Installation steps
  - Configuration
  - Running locally
  - Running tests
  - Deployment
- [ ] Create CONTRIBUTING.md:
  - Code style guide
  - Branch naming
  - Commit message format
  - PR process
  - Code review guidelines
- [ ] Create TESTING.md:
  - Testing philosophy
  - How to write tests
  - Running tests
  - Coverage requirements
  - Mock guidelines
- [ ] Create DEPLOYMENT.md:
  - Deployment process
  - Environment setup
  - Configuration checklist
  - Rollback procedure
  - Monitoring

**Files to Create**:
- `README.md` (update existing)
- `CONTRIBUTING.md`
- `docs/TESTING.md`
- `docs/DEPLOYMENT.md`
- `docs/TROUBLESHOOTING.md`

**Validation**: New developer can set up and run project in <30 minutes

---

### Phase 6 Success Criteria
- ✅ Every public API has JSDoc comments
- ✅ Architecture diagrams created
- ✅ Swagger UI available at /api/docs
- ✅ Complete development guides
- ✅ New developer onboarding time <1 day

---

## Phase 7: Code Quality & Polish (Week 8)

**Goal**: Fix remaining quality issues and technical debt

### Tasks

#### 7.1 Fix Type Safety Issues
- [ ] Remove all `any` types:
  - Find: `grep -r ": any" src/`
  - Replace with proper types
  - Use generics where appropriate
- [ ] Add proper type definitions:
  - Create missing interfaces
  - Define union types for status/enums
  - Add type guards for runtime checks
- [ ] Fix type coercions:
  - Remove `as any` casts
  - Fix type assertion issues
  - Ensure type safety
- [ ] Enable TypeScript strict mode:
  - `"strict": true` in tsconfig.json
  - `"noImplicitAny": true`
  - `"strictNullChecks": true`
  - Fix all resulting errors

**Files to Modify**:
- `src/services/job-queue.ts` (remove `any`)
- `src/services/pipeline-orchestrator.ts` (remove `any`)
- `tsconfig.json` (enable strict mode)
- All files with type issues

**Validation**: Zero `any` types, strict mode enabled, no type errors

---

#### 7.2 Extract Constants
- [ ] Create constants directory: `src/constants/`
- [ ] Extract all magic numbers to constants:
  - Job configuration: `src/constants/job-config.ts`
  - NFL configuration: `src/constants/nfl-config.ts`
  - NCAAF configuration: `src/constants/ncaaf-config.ts`
  - Pipeline configuration: `src/constants/pipeline-config.ts`
  - Cache configuration: `src/constants/cache-config.ts`
- [ ] Document meaning of each constant:
  ```typescript
  /**
   * Maximum number of concurrent jobs allowed in queue
   * Prevents memory exhaustion from unbounded job creation
   */
  export const MAX_JOBS = 100

  /**
   * Job time-to-live in milliseconds (1 hour)
   * Jobs are automatically cleaned up after this duration
   */
  export const JOB_TTL_MS = 60 * 60 * 1000
  ```
- [ ] Add type safety for constants:
  - Use `as const` for literal types
  - Create branded types where appropriate
  - Export typed constants
- [ ] Update all files to use constants:
  - Replace hardcoded values
  - Import from constants files

**Files to Create**:
- `src/constants/job-config.ts`
- `src/constants/nfl-config.ts`
- `src/constants/ncaaf-config.ts`
- `src/constants/pipeline-config.ts`
- `src/constants/cache-config.ts`
- `src/constants/index.ts`

**Files to Modify**:
- All files with magic numbers

**Validation**: No magic numbers, all constants documented and typed

---

#### 7.3 Improve Naming Consistency
- [ ] Fix inconsistent casing:
  - `useOddsAPI` → `useOddsApi` (or stick with API)
  - `ncaaf` → `NCAAF` (consistent with NFL)
  - Standardize acronym casing
- [ ] Rename unclear variables:
  - `p95SpreadDelta` → document or rename to `percentile95SpreadDelta`
  - Document abbreviations in comments
- [ ] Fix verbose names:
  - `getCurrentNFLWeekWeekWeek` → `getCurrentNFLWeek`
- [ ] Remove underscore prefix for private properties:
  - `_lastMatches` → use `private` keyword
  - `_scheduleMatches` → use `private` keyword
- [ ] Follow TypeScript conventions:
  - Classes: PascalCase
  - Functions/methods: camelCase
  - Constants: UPPER_SNAKE_CASE
  - Interfaces: PascalCase with I prefix (optional)
  - Types: PascalCase

**Files to Modify**:
- Files with naming issues (identified in analysis)

**Validation**: Consistent naming throughout, no unclear abbreviations

---

#### 7.4 Replace console.log with Proper Logging
- [ ] Choose logging library:
  - Recommended: `pino` (fast, structured)
  - Alternative: `winston`
- [ ] Install and configure logger:
  ```typescript
  // src/lib/logger.ts
  import pino from 'pino'

  export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined
  })
  ```
- [ ] Replace all `console.log` statements:
  - `console.log` → `logger.info`
  - `console.error` → `logger.error`
  - `console.warn` → `logger.warn`
  - Add structured context to logs
- [ ] Add log levels appropriately:
  - `debug`: Detailed diagnostic info
  - `info`: General informational messages
  - `warn`: Warning messages
  - `error`: Error messages
- [ ] Add request correlation IDs:
  - Generate ID per request
  - Include in all logs for that request
  - Easier to trace request flow
- [ ] Configure log aggregation (optional):
  - Send to Vercel Logs
  - Or use external service (Datadog, Logtail)

**Files to Create**:
- `src/lib/logger.ts`
- `src/middleware/request-logger.ts`

**Files to Modify**:
- All files with `console.log`, `console.error`, etc.

**Validation**: No console.log statements, structured logging throughout

---

### Phase 7 Success Criteria
- ✅ Zero `any` types in codebase
- ✅ TypeScript strict mode enabled
- ✅ No magic numbers (all constants)
- ✅ Consistent naming conventions
- ✅ Structured logging with pino/winston
- ✅ Code quality metrics improved

---

## Phase 8: Authentication & Authorization (Week 9)

**Goal**: Secure the application properly

### Tasks

#### 8.1 Choose Auth Solution
- [ ] Evaluate options:
  - **NextAuth.js** - Free, integrated with Next.js
  - **Clerk** - Easy, great DX, paid plans
  - **Auth0** - Enterprise features, complex setup
  - **API Keys** - Simple, for internal tools
- [ ] Decision criteria:
  - Budget constraints
  - User management needs
  - Social login requirements
  - Session management
- [ ] Choose solution (recommend: NextAuth.js for flexibility)
- [ ] Set up provider:
  - Install dependencies
  - Configure providers (email, Google, etc.)
  - Set up database schema (if using database sessions)

**Files to Create** (example for NextAuth.js):
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/lib/auth.ts`
- `src/middleware.ts` (auth middleware)

**Validation**: Auth provider configured, test login works

---

#### 8.2 Implement Authentication
- [ ] Set up authentication pages:
  - Login page
  - Sign up page (if applicable)
  - Password reset (if applicable)
- [ ] Add login/logout flows:
  - Sign in with email/password
  - Sign in with Google (optional)
  - Sign out functionality
- [ ] Implement session management:
  - Session creation
  - Session validation
  - Session refresh
  - Session expiration
- [ ] Add protected route middleware:
  - Check authentication on protected routes
  - Redirect to login if unauthenticated
  - Preserve intended destination
- [ ] Update API routes with auth checks:
  - Verify session/token
  - Return 401 if unauthenticated
  - Include user context in requests

**Files to Create**:
- `src/app/login/page.tsx`
- `src/middleware/auth-middleware.ts`
- `src/lib/session.ts`

**Files to Modify**:
- All API routes (add auth checks)

**Validation**: Protected routes require authentication, unauthenticated users redirected

---

#### 8.3 Implement Authorization
- [ ] Define user roles:
  - `admin` - Full access
  - `user` - Standard access
  - `viewer` - Read-only access (optional)
- [ ] Add role-based access control (RBAC):
  - Store roles in database/token
  - Check roles in middleware
  - Restrict operations by role
- [ ] Protect sensitive operations:
  - Pipeline execution (admin/user only)
  - Job queue management (admin only)
  - Configuration changes (admin only)
  - Data export (admin/user only)
- [ ] Add permission checks in UI:
  - Hide/disable features based on role
  - Show appropriate error messages
- [ ] Add resource ownership:
  - Users can only access their own data
  - Admins can access all data

**Files to Create**:
- `src/lib/rbac.ts`
- `src/middleware/authorization-middleware.ts`
- `src/types/roles.ts`

**Files to Modify**:
- API routes (add authorization checks)
- UI components (role-based rendering)

**Validation**: Different roles have different permissions, unauthorized access blocked

---

#### 8.4 Add Audit Logging
- [ ] Create audit log system:
  - Database table for audit logs
  - Log schema (user, action, resource, timestamp)
  - Audit log service
- [ ] Log authentication events:
  - Login attempts (success/failure)
  - Logout events
  - Password changes
  - Account creation
- [ ] Log sensitive operations:
  - Pipeline executions
  - Configuration changes
  - Data exports
  - Admin actions
- [ ] Add audit log viewer (admin only):
  - Filter by user, action, date range
  - Export audit logs
  - Alert on suspicious activity
- [ ] Implement log retention:
  - Keep logs for required period (90 days minimum)
  - Archive old logs
  - Automatic cleanup

**Files to Create**:
- `src/services/audit-log-service.ts`
- `src/app/api/audit/route.ts`
- `src/app/admin/audit-logs/page.tsx`
- `migrations/00X_create_audit_logs.sql`

**Validation**: All auth events logged, audit log viewer working, retention policy active

---

### Phase 8 Success Criteria
- ✅ Authentication system working (NextAuth.js or chosen solution)
- ✅ All API routes protected
- ✅ Role-based access control implemented
- ✅ Audit logging for sensitive operations
- ✅ User management UI (if applicable)
- ✅ Security testing passed

---

## Phase 9: Validation & Deployment (Week 10)

**Goal**: Final validation and production deployment

### Tasks

#### 9.1 Comprehensive Testing
- [ ] Run full test suite:
  - Unit tests: `npm test`
  - Integration tests: `npm run test:integration`
  - E2E tests: `npm run test:e2e`
  - All tests passing
- [ ] Performance testing:
  - Load test API endpoints (artillery or k6)
  - Test with 100 concurrent users
  - Verify response times <200ms (p95)
  - Check memory usage under load
- [ ] Security scanning:
  - Run `npm audit` and fix vulnerabilities
  - Use Snyk or similar for dependency scanning
  - OWASP ZAP for security testing (optional)
  - Check for common vulnerabilities
- [ ] Accessibility testing:
  - Run Lighthouse audits
  - Test keyboard navigation
  - Test screen reader compatibility
  - Verify WCAG 2.1 AA compliance

**Files to Create**:
- `scripts/load-test.yml` (artillery config)
- `scripts/security-scan.sh`

**Validation**: All tests passing, performance targets met, no critical vulnerabilities

---

#### 9.2 Performance Benchmarking
- [ ] Measure API response times:
  - Baseline metrics from production
  - Compare before/after refactoring
  - Target: <200ms p95, <500ms p99
- [ ] Check database query performance:
  - Identify slow queries
  - Add indexes where needed
  - Optimize N+1 queries
- [ ] Validate caching effectiveness:
  - Measure cache hit rate (target: >70%)
  - Check cache size and memory usage
  - Verify TTL and eviction working
- [ ] Monitor memory usage:
  - Check for memory leaks
  - Verify garbage collection
  - Monitor heap size over time
- [ ] Test bundle size:
  - Check client bundle size
  - Verify code splitting
  - Optimize large dependencies

**Tools**:
- Vercel Analytics
- Lighthouse
- Chrome DevTools
- Redis CLI (for cache stats)

**Validation**: Performance targets met, no regressions from baseline

---

#### 9.3 Security Audit
- [ ] Review all API endpoints:
  - Authentication working
  - Authorization enforced
  - Input validation present
  - Rate limiting active
- [ ] Test rate limiting:
  - Verify limits enforced
  - Test across different IPs
  - Check error responses (429)
- [ ] Verify input validation:
  - Test with invalid inputs
  - Test with malicious inputs
  - Test edge cases
  - Verify error messages don't leak info
- [ ] Check for common vulnerabilities:
  - SQL injection (if using raw SQL)
  - XSS (cross-site scripting)
  - CSRF (cross-site request forgery)
  - Clickjacking
  - Open redirects
- [ ] Review environment variables:
  - No secrets exposed to client
  - All required vars validated
  - Production values secured
- [ ] Test error handling:
  - No stack traces in production
  - Generic error messages
  - Proper logging without info disclosure

**Validation**: No security vulnerabilities, all endpoints secured, audit checklist complete

---

#### 9.4 Gradual Rollout
- [ ] Deploy to staging environment:
  - Set up staging environment (Vercel preview)
  - Deploy latest code
  - Configure staging env vars
  - Run smoke tests
- [ ] Staging validation:
  - Test all critical paths
  - Verify integrations working
  - Check performance
  - Test authentication
- [ ] Production deployment:
  - Create production checklist
  - Schedule deployment window
  - Notify stakeholders
  - Deploy to production
- [ ] Post-deployment monitoring:
  - Monitor error rates
  - Check performance metrics
  - Verify authentication working
  - Monitor API usage
- [ ] Rollback plan:
  - Document rollback procedure
  - Test rollback in staging
  - Keep previous version ready
  - Monitor for issues requiring rollback

**Files to Create**:
- `docs/DEPLOYMENT_CHECKLIST.md`
- `docs/ROLLBACK_PROCEDURE.md`

**Validation**: Successful production deployment, monitoring active, rollback tested

---

### Phase 9 Success Criteria
- ✅ All tests passing (unit, integration, E2E)
- ✅ Performance targets met (<200ms p95)
- ✅ Security audit passed
- ✅ Deployed to production successfully
- ✅ Monitoring and alerts configured
- ✅ Rollback procedure tested and documented

---

## Success Metrics (Overall Project)

### Code Quality
- ✅ Test coverage ≥80%
- ✅ Zero `any` types in codebase
- ✅ TypeScript strict mode enabled
- ✅ Zero critical security vulnerabilities
- ✅ All SOLID principles followed
- ✅ No God classes (max 200 lines per class)
- ✅ No singleton patterns in services

### Performance
- ✅ API response time <200ms (p95)
- ✅ Cache hit rate >70%
- ✅ Database connection pooling active
- ✅ Zero memory leaks
- ✅ Client bundle size optimized

### Documentation
- ✅ Every public API documented (JSDoc)
- ✅ Architecture diagrams complete
- ✅ API documentation (Swagger) available
- ✅ Development guides complete
- ✅ New developer onboarding <1 day

### Security
- ✅ Authentication/authorization implemented
- ✅ All endpoints protected
- ✅ Input validation on all routes
- ✅ Rate limiting active
- ✅ Audit logging for sensitive operations
- ✅ No sensitive data exposed

### Infrastructure
- ✅ Job persistence with Redis/KV
- ✅ Retry logic with exponential backoff
- ✅ Proper background job execution
- ✅ Database connection pooling
- ✅ Structured logging
- ✅ Monitoring and alerts

---

## Risk Mitigation Strategies

### 1. Incremental Changes
- Work in feature branches
- Small, focused PRs
- Merge frequently
- Keep main branch deployable

### 2. Backward Compatibility
- Maintain old code until new code tested
- Feature flags for gradual rollout
- Parallel implementations during migration
- Deprecate gracefully

### 3. Testing Strategy
- Write tests before refactoring
- Maintain test coverage during changes
- Integration tests for critical paths
- E2E tests for user flows

### 4. Deployment Safety
- Deploy to staging first
- Gradual production rollout
- Monitor key metrics
- Quick rollback capability

### 5. Team Collaboration
- Pair programming for critical changes
- Code reviews for all PRs
- Knowledge sharing sessions
- Document decisions (ADRs)

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 1 | Week 1 | Testing infrastructure, validation, security fixes, factory pattern |
| Phase 2 | Week 2 | Redis job queue, background processing, persistence |
| Phase 3 | Weeks 3-4 | Service layer refactoring, DI, API cleanup |
| Phase 4 | Week 5 | Database migration, caching, performance optimization |
| Phase 5 | Week 6 | 80% test coverage, integration tests, E2E tests, error handling |
| Phase 6 | Week 7 | Documentation, JSDoc, architecture diagrams, guides |
| Phase 7 | Week 8 | Type safety, constants, naming, logging |
| Phase 8 | Week 9 | Authentication, authorization, audit logging |
| Phase 9 | Week 10 | Testing, benchmarking, security audit, deployment |

**Total Duration**: 8-10 weeks (1 senior developer full-time)

---

## Next Steps

**To begin Phase 1:**
1. Create feature branch: `git checkout -b refactor/phase-1-testing-security`
2. Set up testing infrastructure (Task 1.1)
3. Add input validation schemas (Task 1.2)
4. Fix security vulnerabilities (Task 1.3)
5. Convert singletons to factories (Task 1.4)
6. Create PR for Phase 1 when complete

**Questions before starting?**
- Resource allocation (full-time vs. part-time)
- Priority adjustments needed
- Additional stakeholder input
- Timeline constraints

---

*This refactoring plan provides a systematic approach to transforming the codebase from its current state to a production-ready, well-architected application. Each phase builds on the previous one, ensuring stability and quality throughout the process.*
