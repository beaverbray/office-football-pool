# Office Football Pool - Database Schema Reorganization PRD

## Project Overview

### Current State
The Office Football Pool application is an **analysis tool** that compares picksheet-style text against live market odds. Currently, only **6 out of 30+ database tables** are actually being used. These 6 active tables reside in the default `public` schema within Supabase PostgreSQL, intermixed with 24 unused tables and 4 Music/Concert app tables.

**Actually Used Tables** (from codebase analysis):
- `schedule` - 8 uses
- `current_pipeline` - 4 uses
- `shared_analyses` - 3 uses
- `predictions` - 3 uses
- `job_runs` - 3 uses (in commented code)
- `picks_rows` - 1 use (in commented code)

**Unused Tables** (18 tables from initial schema):
- Pool management: `pools`, `pool_participants`, `pool_weeks`, `pool_games`, `pool_picks`, `raw_pool_games`
- Team/spread analysis: `teams`, `team_aliases`, `game_spreads`, `spread_history`, `spread_buckets`, `historical_games`
- Market data: `market_games`, `raw_market_games`, `dashboard_games`
- Other: `user_preferences`, `schema_version`

### Target State
Move only the **6 actively used tables** into a single dedicated schema `afbp` (American Football Betting Pool) and rename with clear prefixes:

**Naming Convention**: `afbp.{domain}_{table_name}`

**Tables to Migrate** (6 total):
- **Core**: `schedule` → `afbp.core_schedule`
- **Pipeline**: `job_runs` → `afbp.pipeline_job_runs`
- **Pipeline**: `picks_rows` → `afbp.pipeline_picks_rows`
- **Pipeline**: `current_pipeline` → `afbp.pipeline_current`
- **Analysis**: `predictions` → `afbp.analysis_predictions`
- **Shared**: `shared_analyses` → `afbp.shared_analyses`

**Tables to Drop** (18 unused tables):
- All pool management tables
- All team/spread analysis tables
- All unused market data tables
- User preferences and schema version

### Business Goals
- Clearly separate analysis tool data from concert app data
- **Remove 18 unused tables** to simplify database
- Improve code maintainability and developer onboarding
- Create clear domain boundaries through naming conventions
- Simplify permission management (single schema)
- Reduce cognitive load and database bloat

## Table Organization

Only 6 actively used tables will be migrated to the `afbp` schema with domain-based prefixes.

### Core Domain (`core_*`)
**Purpose**: Essential game schedule data

**Tables**:
1. `afbp.core_schedule` (was `public.schedule`) - **[8 uses]** - NFL/NCAAF game schedule
   - Primary data source for game information
   - Most heavily used table in the application
   - Contains: league, match_number, week, date, location, home_team, away_team

**Access Pattern**: Read-heavy from API endpoints and services

### Pipeline Domain (`pipeline_*`)
**Purpose**: ETL pipeline operations and data processing

**Tables**:
1. `afbp.pipeline_job_runs` (was `public.job_runs`) - **[3 uses, commented]** - Pipeline execution tracking
   - Job type, source file, status, timestamps
   - Counts, errors, metadata in JSONB

2. `afbp.pipeline_picks_rows` (was `public.picks_rows`) - **[1 use, commented]** - Raw parsed picksheet data
   - Linked to job_runs via source_run_id FK
   - Contains parsed game data from picksheets

3. `afbp.pipeline_current` (was `public.current_pipeline`) - **[4 uses]** - Current pipeline state
   - Singleton table (id = 'current')
   - Stores most recent pipeline analysis
   - Contains pipeline_data JSONB and picksheet_text

**Access Pattern**: Writes during pipeline execution, reads for status/debugging

### Analysis Domain (`analysis_*`)
**Purpose**: External predictions and analysis data

**Tables**:
1. `afbp.analysis_predictions` (was `public.predictions`) - **[3 uses]** - External predictions
   - Warren Nolan, NFELO, other prediction sources
   - Win probabilities, spreads, confidence levels
   - Scraped prediction data with metadata

**Access Pattern**: Bulk writes during scraping, reads for comparison

### Shared Domain (`shared_*`)
**Purpose**: Cross-cutting application features

**Tables**:
1. `afbp.shared_analyses` (was `public.shared_analyses`) - **[3 uses]** - Shareable analysis snapshots
   - Temporary shared analysis links with expiration
   - Pipeline data snapshots for sharing
   - View count tracking, 30-day default expiration

**Access Pattern**: Writes on share creation, reads on share access

## Requirements

### R1: SQL Migration File Creation
**Description**: Create a comprehensive SQL migration file that creates the `afbp` schema, moves and renames only the 6 actively used tables, and drops 18 unused tables.

**Acceptance Criteria**:
- Migration file uses idempotent statements (CREATE SCHEMA IF NOT EXISTS)
- Creates single `afbp` schema
- **6 tables migrated**: schedule, job_runs, picks_rows, current_pipeline, predictions, shared_analyses
- **18 tables dropped**: All pool management, team management, spread analysis, and market data tables
- Foreign key constraints updated (only picks_rows → job_runs FK exists)
- All indexes preserved during migration
- RLS policies recreated with new table names
- Migration can be run multiple times safely
- Includes verification that dropped tables are truly unused

**Tables to Migrate and Rename**:
1. `schedule` → `afbp.core_schedule`
2. `job_runs` → `afbp.pipeline_job_runs`
3. `picks_rows` → `afbp.pipeline_picks_rows` (FK to job_runs)
4. `current_pipeline` → `afbp.pipeline_current`
5. `predictions` → `afbp.analysis_predictions`
6. `shared_analyses` → `afbp.shared_analyses`

**Tables to Drop**:
- `teams`, `team_aliases`, `game_spreads`, `pool_games`, `pool_weeks`, `pool_picks`, `pool_participants`, `pools`, `market_games`, `raw_market_games`, `dashboard_games`, `raw_pool_games`, `historical_games`, `spread_buckets`, `spread_history`, `user_preferences`, `schema_version`, `schedule` (if keeping as core_schedule)

**Technical Details**:
- File location: `supabase/migrations/00X_football_pool_schema_cleanup.sql`
- Use transaction to ensure atomicity
- Only one FK constraint to update: picks_rows.source_run_id → pipeline_job_runs.id
- Should include comments documenting each domain's purpose
- Backup unused tables before dropping (optional, for safety)

**Migration Pattern**:
```sql
BEGIN;

-- 1. Create schema
CREATE SCHEMA IF NOT EXISTS afbp;

-- 2. Migrate active tables
ALTER TABLE public.schedule SET SCHEMA afbp;
ALTER TABLE afbp.schedule RENAME TO core_schedule;

ALTER TABLE public.job_runs SET SCHEMA afbp;
ALTER TABLE afbp.job_runs RENAME TO pipeline_job_runs;

ALTER TABLE public.picks_rows SET SCHEMA afbp;
ALTER TABLE afbp.picks_rows RENAME TO pipeline_picks_rows;

ALTER TABLE public.current_pipeline SET SCHEMA afbp;
ALTER TABLE afbp.current_pipeline RENAME TO pipeline_current;

ALTER TABLE public.predictions SET SCHEMA afbp;
ALTER TABLE afbp.predictions RENAME TO analysis_predictions;

ALTER TABLE public.shared_analyses SET SCHEMA afbp;
-- Keep name as shared_analyses (already prefixed)

-- 3. Update FK constraint
ALTER TABLE afbp.pipeline_picks_rows
  DROP CONSTRAINT IF EXISTS picks_rows_source_run_id_fkey,
  ADD CONSTRAINT pipeline_picks_rows_source_run_id_fkey
    FOREIGN KEY (source_run_id) REFERENCES afbp.pipeline_job_runs(id);

-- 4. Drop unused tables
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.team_aliases CASCADE;
-- ... (all 18 unused tables)

-- 5. Recreate RLS policies
-- ...

COMMIT;
```

### R2: RLS Policy Migration
**Description**: All existing Row Level Security (RLS) policies must be recreated for renamed tables in the `afbp` schema.

**Acceptance Criteria**:
- All existing RLS policies catalogued from public schema tables
- Policies recreated for new table names in `afbp` schema
- Service role maintains full access to all `afbp.*` tables
- Authenticated users maintain read access where appropriate
- Admin role checks via JWT metadata still function
- Anonymous access limited to appropriate tables

**Technical Details**:
- RLS policies dropped from public schema tables before rename
- Recreated on `afbp.*` tables after migration
- Policy names updated to match new table names (e.g., `reference_teams_select_policy`)
- Test each policy after migration

**Example Policy Recreation**:
```sql
-- Old policy on public.teams
DROP POLICY IF EXISTS "teams_select_policy" ON public.teams;

-- New policy on afbp.reference_teams
CREATE POLICY "reference_teams_select_policy" ON afbp.reference_teams
  FOR SELECT USING (true);
```

### R3: Application Query Updates
**Description**: Update all application code that queries the database to use new schema-qualified table names (only 6 tables affected).

**Acceptance Criteria**:
- All Supabase client queries updated to `afbp.{domain}_{table}` format
- All raw SQL queries updated with new table names
- No hardcoded table name assumptions in dynamic queries
- Type definitions updated to reference new table names

**Files to Update** (based on codebase analysis):
- `src/services/schedule-service.ts` - 8 updates for `schedule` → `afbp.core_schedule`
- `src/app/api/pipeline/save/route.ts` - 1 update for `current_pipeline` → `afbp.pipeline_current`
- `src/app/api/pipeline/refresh/route.ts` - 2 updates for `current_pipeline` → `afbp.pipeline_current`
- `src/app/api/pipeline/current/route.ts` - 1 update for `current_pipeline` → `afbp.pipeline_current`
- `src/app/api/predictions/latest/route.ts` - 2 updates for `predictions` → `afbp.analysis_predictions`
- `src/app/api/warren-nolan/scrape/route.ts` - 1 update for `predictions` → `afbp.analysis_predictions`
- `src/app/api/cache/save/route.ts` - 1 update for `shared_analyses` → `afbp.shared_analyses`
- `src/app/api/cache/get/[id]/route.ts` - 2 updates for `shared_analyses` → `afbp.shared_analyses`
- `src/app/api/schedule/check/route.ts` - 3 updates for `schedule` → `afbp.core_schedule`
- `src/app/api/parse-picksheet/route.ts` - Uncomment and update `job_runs` and `picks_rows` references

**Example Changes**:
```typescript
// Before
const { data } = await supabase.from('schedule').select('*')
const { data } = await supabase.from('current_pipeline').select('*')
const { data } = await supabase.from('predictions').select('*')

// After
const { data } = await supabase.from('afbp.core_schedule').select('*')
const { data } = await supabase.from('afbp.pipeline_current').select('*')
const { data } = await supabase.from('afbp.analysis_predictions').select('*')
```

**Estimated Updates**: ~20-25 query updates across 9-10 files

### R4: TypeScript Type Updates
**Description**: Update TypeScript types and interfaces to reflect new schema organization.

**Acceptance Criteria**:
- Generated types include schema prefixes if applicable
- Type imports organized by schema
- No breaking changes to existing type usage
- Type generation scripts updated

**Technical Details**:
- May need to regenerate Supabase types after migration
- Consider organizing types by schema in separate files
- Update any type generation configuration

### R5: Foreign Key Validation
**Description**: Verify the single foreign key constraint is updated to reference new table names and works correctly.

**Acceptance Criteria**:
- FK constraint updated to reference new table names
- Referential integrity maintained
- Cascade behaviors preserved (if any)
- Constraint name updated for clarity

**Foreign Key to Update and Verify**:
- `afbp.pipeline_picks_rows.source_run_id` → `afbp.pipeline_job_runs.id`
  - **Only FK in the 6 migrated tables**
  - Links parsed picksheet rows to their pipeline job execution
  - Cascade behavior: verify if ON DELETE CASCADE is needed

**Technical Details**:
- Single FK within the same `afbp` schema (simple)
- Constraint name update: `picks_rows_source_run_id_fkey` → `pipeline_picks_rows_source_run_id_fkey`
- Use `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT` pattern

**Verification Query**:
```sql
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'afbp'
  AND tc.constraint_type = 'FOREIGN KEY';
```

### R6: Local Migration Testing
**Description**: Thoroughly test the migration in a local development environment before production.

**Acceptance Criteria**:
- Local Supabase instance running with current production schema
- Migration executed successfully without errors
- All 6 tables renamed and moved to `afbp` schema
- 18 unused tables successfully dropped
- Single FK constraint updated and validated
- RLS policies tested on new table names
- Application runs without database errors
- All API endpoints return expected data

**Test Checklist**:
- [ ] Migration runs without SQL errors
- [ ] All 6 active tables in `afbp` schema with correct domain prefixes:
  - [ ] `afbp.core_schedule`
  - [ ] `afbp.pipeline_job_runs`
  - [ ] `afbp.pipeline_picks_rows`
  - [ ] `afbp.pipeline_current`
  - [ ] `afbp.analysis_predictions`
  - [ ] `afbp.shared_analyses`
- [ ] 18 unused tables successfully dropped from `public` schema
- [ ] Concert app tables remain in `public` (city, songkick_events, spotify_artist_detail, data)
- [ ] Single FK constraint updated: pipeline_picks_rows → pipeline_job_runs
- [ ] Indexes present on all migrated tables
- [ ] RLS policies active and correct on new table names
- [ ] Service role access works
- [ ] Authenticated user access works (if applicable)
- [ ] Anonymous access restricted appropriately (if applicable)

### R7: API Endpoint Testing
**Description**: Test all API endpoints to ensure they work correctly with the new schema structure.

**Acceptance Criteria**:
- All REST endpoints tested manually
- All GraphQL queries tested (if applicable)
- Real-time subscriptions work correctly
- Error responses remain appropriate
- Performance benchmarks maintained or improved

**Endpoints to Test**:
- Team listing and details
- Game spreads and market data
- Pool management operations
- User picks submission
- Dashboard data retrieval
- Shared analysis links
- Prediction data access

### R8: Integration Test Suite
**Description**: Run the full integration test suite to catch any regression issues.

**Acceptance Criteria**:
- All existing tests pass without modification
- Tests updated to use schema-qualified names if needed
- No new test failures introduced
- Code coverage maintained at current levels
- Performance tests show acceptable results

**Test Categories**:
- Unit tests for database utilities
- Integration tests for API endpoints
- E2E tests for critical user flows
- Performance tests for dashboard queries

### R9: Production Database Backup
**Description**: Create a complete backup of the production database before migration.

**Acceptance Criteria**:
- Full database backup completed
- Backup stored in secure location
- Backup verified and restorable
- Rollback procedure documented
- Recovery time objective (RTO) < 30 minutes

**Backup Method**:
- Use Supabase dashboard backup feature
- Or use `pg_dump` for additional safety
- Store backup with timestamp
- Test restore procedure in isolated environment

### R10: Production Migration Execution
**Description**: Execute the schema migration in production during scheduled maintenance.

**Acceptance Criteria**:
- Maintenance window scheduled and communicated
- Migration executed via Supabase SQL Editor
- All tables successfully moved
- No data loss
- RLS policies active
- Search path updated
- Application deployed with updated code
- Rollback plan ready if needed

**Execution Steps**:
1. Enable maintenance mode
2. Create backup (R9)
3. Execute migration SQL
4. Verify table locations
5. Verify foreign keys
6. Deploy updated application code
7. Smoke test critical paths
8. Monitor error logs
9. Disable maintenance mode

**Maintenance Window**: 15-20 minutes estimated

### R11: Post-Migration Monitoring
**Description**: Monitor application behavior after migration to catch any issues quickly.

**Acceptance Criteria**:
- Error logs monitored for 24 hours post-migration
- Performance metrics tracked and compared to baseline
- User-reported issues tracked and addressed
- Database query performance analyzed
- No critical issues identified

**Monitoring Points**:
- Application error rates
- Database query latency
- API response times
- RLS policy enforcement
- Foreign key constraint violations
- Connection pool utilization

### R12: Documentation Updates
**Description**: Update all project documentation to reflect the new schema organization.

**Acceptance Criteria**:
- Architecture documentation updated with schema diagram
- ER diagrams recreated showing schema boundaries
- Developer onboarding guide updated
- Database conventions documented
- Migration process documented for future reference
- Rollback procedure documented

**Documents to Update**:
- README.md - Project structure section
- ARCHITECTURE.md - Database design section
- Database schema documentation
- API documentation (if schema affects endpoints)
- Developer setup guide

### R13: Schema Permission Configuration
**Description**: Configure appropriate permissions on the `afbp` schema for different roles.

**Acceptance Criteria**:
- Service role has full access to `afbp` schema
- Authenticated users have appropriate read access to `afbp` tables
- Anonymous users have limited read access where appropriate
- Admin users have elevated privileges where needed
- Schema-level grants documented

**Permission Strategy**:
- Grant `USAGE` on `afbp` schema to authenticated and anonymous roles
- Use RLS policies on individual tables for fine-grained access control
- Service role bypasses RLS (full access)
- Domain prefixes make it easy to identify table purposes for documentation

**Example Grants**:
```sql
GRANT USAGE ON SCHEMA afbp TO authenticated;
GRANT USAGE ON SCHEMA afbp TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA afbp TO authenticated;
GRANT SELECT ON afbp.market_*, afbp.analytics_*, afbp.reference_* TO anon;
```

### R14: Unused Table Cleanup Verification
**Description**: Verify that the 18 dropped tables are truly unused and document what was removed.

**Acceptance Criteria**:
- Comprehensive list of dropped tables documented
- Verification that no code references dropped tables
- No database views or functions reference dropped tables
- Data export/backup created before dropping (optional, for safety)
- Decision rationale documented for each dropped table

**Tables Dropped** (18 total):
**Pool Management** (6): pools, pool_participants, pool_weeks, pool_games, pool_picks, raw_pool_games
**Team/Spread** (6): teams, team_aliases, game_spreads, spread_history, spread_buckets, historical_games
**Market Data** (3): market_games, raw_market_games, dashboard_games
**Other** (3): user_preferences, schema_version, (plus any other unused tables found)

**Verification Steps**:
1. Run comprehensive code search for each dropped table name
2. Check for any database views referencing dropped tables
3. Check for any stored procedures or functions using dropped tables
4. Export data from dropped tables for archival (optional)
5. Document that these tables were part of planned features that were never implemented

### R15: Performance Benchmarking
**Description**: Benchmark key queries before and after migration to ensure no performance regression.

**Acceptance Criteria**:
- Baseline query performance measured
- Post-migration query performance measured
- No significant regression (>10% slower)
- Improvements documented where found
- Slow queries identified and optimized

**Queries to Benchmark**:
- Dashboard data loading
- Team listing with aliases
- Market data aggregation
- User picks retrieval
- Historical game analysis
- Spread bucket lookups

### R16: Search Path Configuration
**Description**: Update the database search_path to include the `afbp` schema for convenience.

**Acceptance Criteria**:
- Search path includes `afbp` schema
- Public schema remains in path for auth and concert app tables
- Search path documented
- Impact on query planning analyzed
- No negative performance impact

**Recommended Search Path**:
```sql
ALTER DATABASE postgres SET search_path TO afbp, public;
```

**Benefits**:
- Simple two-schema search path
- `afbp` schema searched first for football pool queries
- `public` schema available for auth tables and concert app
- Queries can omit schema prefix if desired (though explicit is better)

**Note**: Even with search_path configured, it's recommended to use fully-qualified table names (`afbp.reference_teams`) in application code for clarity.

## Success Metrics

- **Zero data loss**: All data from 6 migrated tables intact after migration
- **Zero downtime violations**: Migration completed within 10-15 minute window
- **100% test pass rate**: All tests passing post-migration
- **Performance maintained**: No queries >10% slower than baseline
- **Database cleanup**: 18 unused tables successfully removed
- **Clear separation**: Football pool data clearly separated from concert app
- **Code simplification**: Only 6 tables to reference instead of 23+
- **Developer satisfaction**: Improved code navigation and understanding

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Data loss during migration | Critical | Low | Full backup, transactional migration, verified restore procedure |
| RLS policies not working | High | Medium | Comprehensive testing, policy-by-policy validation |
| Application breaks in production | Critical | Low | Local testing, comprehensive query updates, rollback plan |
| Foreign keys break during rename | High | Low | All FKs within same schema, careful constraint recreation |
| Extended downtime | Medium | Low | Single schema = simpler/faster migration |
| Missed table references in code | High | Medium | Systematic search/replace, comprehensive testing |
| Query performance degradation | Medium | Low | Benchmarking before/after, search_path optimization |

**Risk Reduction vs. Multi-Schema**:
- Lower complexity → Lower risk overall
- Single schema → No cross-schema FK concerns
- Faster migration → Shorter maintenance window
- Clearer naming → Easier to spot missed updates

## Timeline Estimate

- **Planning & Design**: 1 hour (COMPLETE - this PRD)
- **Migration File Creation**: 1-2 hours (create schema, migrate 6 tables, drop 18 tables, update 1 FK, recreate RLS)
- **Application Code Updates**: 1-2 hours (~20-25 query updates across 9-10 files)
- **Local Testing**: 1 hour (verify migration, test endpoints)
- **Documentation**: 30 minutes (update docs, document dropped tables)
- **Production Execution**: 10-15 minutes (scheduled maintenance)
- **Monitoring**: 24 hours post-migration

**Total Development Time**: 4-6 hours (vs. 10-13 hours for 23 tables)
**Total Calendar Time**: 1-2 days (including testing periods)

**Significant Simplification**:
- **Only 6 tables** to migrate (vs. 23 originally planned)
- **Only 1 FK** to update (vs. 10+ originally)
- **Only ~20-25 query updates** (vs. 100+ originally)
- **Drops 18 unused tables** - cleaner database
- **Much faster migration** - lower risk
- Single schema creation, simpler permissions
- Easier to understand and maintain

## Dependencies

- Supabase PostgreSQL database access
- Local development environment with Supabase
- Access to production database for migration
- Ability to schedule maintenance window

## Out of Scope

- Moving to separate Supabase projects (different databases)
- Major application refactoring beyond query updates
- Data model changes or normalization
- New feature development
- Performance optimization unrelated to schema change
- Changing concert app tables (handled separately)

## Complete Table Mapping Reference

### Tables Being Migrated (6 total)

| Current Name | New Name | Domain | Usage Count | Purpose |
|--------------|----------|--------|-------------|---------|
| `public.schedule` | `afbp.core_schedule` | Core | 8 uses | NFL/NCAAF game schedule |
| `public.job_runs` | `afbp.pipeline_job_runs` | Pipeline | 3 uses* | Pipeline execution tracking |
| `public.picks_rows` | `afbp.pipeline_picks_rows` | Pipeline | 1 use* | Raw parsed picksheet data |
| `public.current_pipeline` | `afbp.pipeline_current` | Pipeline | 4 uses | Current pipeline state |
| `public.predictions` | `afbp.analysis_predictions` | Analysis | 3 uses | External predictions (Warren Nolan, etc.) |
| `public.shared_analyses` | `afbp.shared_analyses` | Shared | 3 uses | Shareable analysis snapshots |

*Commented out in code but will be uncommented

### Tables Being Dropped (18 total)

**Pool Management** (6 tables - never implemented):
- `pools`, `pool_participants`, `pool_weeks`, `pool_games`, `pool_picks`, `raw_pool_games`

**Team & Spread Analysis** (6 tables - never implemented):
- `teams`, `team_aliases`, `game_spreads`, `spread_history`, `spread_buckets`, `historical_games`

**Market Data** (3 tables - never implemented):
- `market_games`, `raw_market_games`, `dashboard_games`

**Other** (3 tables - never used):
- `user_preferences`, `schema_version`, plus any other discovered unused tables

### Tables Remaining in Public Schema

**Supabase Auth** (managed by Supabase):
- All `auth.*` tables

**Concert App** (separate application):
- `city`, `songkick_events`, `spotify_artist_detail`, `data`

## Summary

- **6 tables migrated** to `afbp` schema with clear domain prefixes
- **18 tables dropped** to clean up database bloat
- **4 concert app tables** remain in `public` schema
- **1 foreign key** updated
- **~20-25 query updates** needed in application code
- **Much simpler** than original 23-table migration plan
