-- ============================================================================
-- AFBP Schema Migration
-- ============================================================================
-- Purpose: Reorganize database tables into dedicated afbp schema
--   - Migrate 6 actively used tables with domain-prefixed names
--   - Drop 18 unused tables from initial schema
--   - Separate football pool data from concert app data
--
-- Tables Being Migrated (6):
--   schedule → afbp.core_schedule
--   job_runs → afbp.pipeline_job_runs
--   picks_rows → afbp.pipeline_picks_rows
--   current_pipeline → afbp.pipeline_current
--   predictions → afbp.analysis_predictions
--   shared_analyses → afbp.shared_analyses
--
-- Tables Being Dropped (18):
--   Pool management (6): pools, pool_participants, pool_weeks, pool_games,
--                        pool_picks, raw_pool_games
--   Team/Spread (6): teams, team_aliases, game_spreads, spread_history,
--                    spread_buckets, historical_games
--   Market data (3): market_games, raw_market_games, dashboard_games
--   Other (3): user_preferences, schema_version, + any other unused
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create AFBP Schema
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS afbp;
COMMENT ON SCHEMA afbp IS 'American Football Betting Pool - Analysis tool schema';

-- ============================================================================
-- STEP 2: Migrate Active Tables (6 tables)
-- ============================================================================

-- 2.1: schedule → afbp.core_schedule
-- Most used table (8 uses) - Game schedule reference data
ALTER TABLE IF EXISTS public.schedule SET SCHEMA afbp;
ALTER TABLE IF EXISTS afbp.schedule RENAME TO core_schedule;

-- Recreate index with new name
DROP INDEX IF EXISTS public.schedule_pkey CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_core_schedule_pkey ON afbp.core_schedule(match_number);

COMMENT ON TABLE afbp.core_schedule IS 'NFL/NCAAF game schedule reference data';

-- 2.2: job_runs → afbp.pipeline_job_runs
-- Pipeline execution tracking (3 uses, currently commented in code)
ALTER TABLE IF EXISTS public.job_runs SET SCHEMA afbp;
ALTER TABLE IF EXISTS afbp.job_runs RENAME TO pipeline_job_runs;

COMMENT ON TABLE afbp.pipeline_job_runs IS 'Pipeline execution history and status tracking';

-- 2.3: picks_rows → afbp.pipeline_picks_rows
-- Raw parsed picksheet data (1 use, currently commented in code)
ALTER TABLE IF EXISTS public.picks_rows SET SCHEMA afbp;
ALTER TABLE IF EXISTS afbp.picks_rows RENAME TO pipeline_picks_rows;

-- Update FK constraint to reference new table name
ALTER TABLE IF EXISTS afbp.pipeline_picks_rows
  DROP CONSTRAINT IF EXISTS picks_rows_source_run_id_fkey CASCADE;

ALTER TABLE IF EXISTS afbp.pipeline_picks_rows
  ADD CONSTRAINT pipeline_picks_rows_source_run_id_fkey
    FOREIGN KEY (source_run_id)
    REFERENCES afbp.pipeline_job_runs(id)
    ON DELETE CASCADE;

COMMENT ON TABLE afbp.pipeline_picks_rows IS 'Raw parsed picksheet data linked to pipeline jobs';

-- 2.4: current_pipeline → afbp.pipeline_current
-- Current pipeline state - SINGLETON table (4 uses)
ALTER TABLE IF EXISTS public.current_pipeline SET SCHEMA afbp;
ALTER TABLE IF EXISTS afbp.current_pipeline RENAME TO pipeline_current;

COMMENT ON TABLE afbp.pipeline_current IS 'Current pipeline state (singleton: id=current)';

-- 2.5: predictions → afbp.analysis_predictions
-- External predictions from Warren Nolan, NFELO, etc. (3 uses)
ALTER TABLE IF EXISTS public.predictions SET SCHEMA afbp;
ALTER TABLE IF EXISTS afbp.predictions RENAME TO analysis_predictions;

COMMENT ON TABLE afbp.analysis_predictions IS 'External predictions from Warren Nolan, NFELO, and other sources';

-- 2.6: shared_analyses → afbp.shared_analyses
-- Shareable analysis snapshots (3 uses)
ALTER TABLE IF EXISTS public.shared_analyses SET SCHEMA afbp;
-- Keep name as shared_analyses (already has good prefix)

COMMENT ON TABLE afbp.shared_analyses IS 'Shareable analysis snapshots with 30-day expiration';

-- ============================================================================
-- STEP 3: Recreate RLS Policies for Migrated Tables
-- ============================================================================

-- 3.1: afbp.core_schedule RLS
ALTER TABLE afbp.core_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to schedule" ON afbp.core_schedule;
CREATE POLICY "Allow public read access to core_schedule"
  ON afbp.core_schedule
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role can manage schedule" ON afbp.core_schedule;
CREATE POLICY "Service role can manage core_schedule"
  ON afbp.core_schedule
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3.2: afbp.pipeline_job_runs RLS
ALTER TABLE afbp.pipeline_job_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read" ON afbp.pipeline_job_runs;
CREATE POLICY "Allow authenticated read pipeline_job_runs"
  ON afbp.pipeline_job_runs
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage" ON afbp.pipeline_job_runs;
CREATE POLICY "Service role can manage pipeline_job_runs"
  ON afbp.pipeline_job_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3.3: afbp.pipeline_picks_rows RLS
ALTER TABLE afbp.pipeline_picks_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read" ON afbp.pipeline_picks_rows;
CREATE POLICY "Allow authenticated read pipeline_picks_rows"
  ON afbp.pipeline_picks_rows
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage" ON afbp.pipeline_picks_rows;
CREATE POLICY "Service role can manage pipeline_picks_rows"
  ON afbp.pipeline_picks_rows
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3.4: afbp.pipeline_current RLS
ALTER TABLE afbp.pipeline_current ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON afbp.pipeline_current;
CREATE POLICY "Allow public read access pipeline_current"
  ON afbp.pipeline_current
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow public upsert" ON afbp.pipeline_current;
CREATE POLICY "Allow public upsert pipeline_current"
  ON afbp.pipeline_current
  FOR ALL
  WITH CHECK (id = 'current');

-- 3.5: afbp.analysis_predictions RLS
ALTER TABLE afbp.analysis_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous read access to predictions" ON afbp.analysis_predictions;
CREATE POLICY "Allow anonymous read access analysis_predictions"
  ON afbp.analysis_predictions
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated read access to predictions" ON afbp.analysis_predictions;
CREATE POLICY "Allow authenticated read access analysis_predictions"
  ON afbp.analysis_predictions
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage predictions" ON afbp.analysis_predictions;
CREATE POLICY "Service role can manage analysis_predictions"
  ON afbp.analysis_predictions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3.6: afbp.shared_analyses RLS
ALTER TABLE afbp.shared_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON afbp.shared_analyses;
CREATE POLICY "Allow public read access shared_analyses"
  ON afbp.shared_analyses
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role can manage" ON afbp.shared_analyses;
CREATE POLICY "Service role can manage shared_analyses"
  ON afbp.shared_analyses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- STEP 4: Drop Unused Tables (18 tables)
-- ============================================================================

-- Pool Management Tables (6) - Never implemented
DROP TABLE IF EXISTS public.pools CASCADE;
DROP TABLE IF EXISTS public.pool_participants CASCADE;
DROP TABLE IF EXISTS public.pool_weeks CASCADE;
DROP TABLE IF EXISTS public.pool_games CASCADE;
DROP TABLE IF EXISTS public.pool_picks CASCADE;
DROP TABLE IF EXISTS public.raw_pool_games CASCADE;

-- Team & Spread Analysis Tables (6) - Never implemented
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.team_aliases CASCADE;
DROP TABLE IF EXISTS public.game_spreads CASCADE;
DROP TABLE IF EXISTS public.spread_history CASCADE;
DROP TABLE IF EXISTS public.spread_buckets CASCADE;
DROP TABLE IF EXISTS public.historical_games CASCADE;

-- Market Data Tables (3) - Never implemented
DROP TABLE IF EXISTS public.market_games CASCADE;
DROP TABLE IF EXISTS public.raw_market_games CASCADE;
DROP TABLE IF EXISTS public.dashboard_games CASCADE;

-- Other Unused Tables (3+)
DROP TABLE IF EXISTS public.user_preferences CASCADE;
DROP TABLE IF EXISTS public.schema_version CASCADE;

-- ============================================================================
-- STEP 5: Update Database Search Path
-- ============================================================================

-- Set search path to check afbp first, then public
ALTER DATABASE postgres SET search_path TO afbp, public;

-- ============================================================================
-- STEP 6: Grant Permissions on AFBP Schema
-- ============================================================================

-- Grant usage on afbp schema
GRANT USAGE ON SCHEMA afbp TO anon;
GRANT USAGE ON SCHEMA afbp TO authenticated;
GRANT USAGE ON SCHEMA afbp TO service_role;

-- Grant select on all tables in afbp to authenticated users
GRANT SELECT ON ALL TABLES IN SCHEMA afbp TO authenticated;

-- Grant select on specific tables to anonymous users
GRANT SELECT ON afbp.core_schedule TO anon;
GRANT SELECT ON afbp.analysis_predictions TO anon;
GRANT SELECT ON afbp.shared_analyses TO anon;
GRANT SELECT ON afbp.pipeline_current TO anon;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA afbp GRANT SELECT ON TABLES TO authenticated;

-- ============================================================================
-- STEP 7: Verify Migration
-- ============================================================================

-- Count tables in afbp schema (should be 6)
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'afbp';

    RAISE NOTICE 'AFBP schema contains % tables (expected: 6)', table_count;

    IF table_count <> 6 THEN
        RAISE WARNING 'Expected 6 tables in afbp schema, found %', table_count;
    END IF;
END $$;

-- List all tables in afbp schema
DO $$
DECLARE
    table_rec RECORD;
BEGIN
    RAISE NOTICE 'Tables in afbp schema:';
    FOR table_rec IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'afbp'
        ORDER BY table_name
    LOOP
        RAISE NOTICE '  - afbp.%', table_rec.table_name;
    END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- Migration Complete!
-- ============================================================================
-- Next steps:
-- 1. Update application queries to use afbp.* table names
-- 2. Test all API endpoints
-- 3. Verify RLS policies work correctly
-- 4. Monitor for any issues
-- ============================================================================
