-- ============================================================================
-- Grant Service Role Permissions for Historical Data Loading
-- ============================================================================
-- This migration grants the service role the necessary permissions to
-- load historical data into the afbp schema tables.
-- ============================================================================

BEGIN;

-- Grant usage on afbp schema to service role
GRANT USAGE ON SCHEMA afbp TO service_role;

-- Grant all privileges on all tables in afbp schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA afbp TO service_role;

-- Grant all privileges on all sequences in afbp schema
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA afbp TO service_role;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA afbp
GRANT ALL PRIVILEGES ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA afbp
GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;

-- Specific grants for key tables
GRANT SELECT, INSERT, UPDATE, DELETE ON afbp.core_teams TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON afbp.historical_games TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON afbp.historical_spread_buckets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON afbp.historical_spread_discrepancies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON afbp.pool_picks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON afbp.pool_performance_analysis TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON afbp.analysis_gap_metrics TO service_role;

COMMIT;

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify permissions were granted:
-- SELECT grantee, privilege_type, table_schema, table_name
-- FROM information_schema.table_privileges
-- WHERE table_schema = 'afbp' AND grantee = 'service_role';
