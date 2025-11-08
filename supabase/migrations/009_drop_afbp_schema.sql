-- ============================================================================
-- Drop AFBP Schema (Cleanup before fresh migration)
-- ============================================================================
-- Purpose: Remove previously created afbp schema to allow clean migration
-- Run this BEFORE running 009_afbp_schema_migration.sql
-- ============================================================================

BEGIN;

-- Drop the afbp schema and all its contents
DROP SCHEMA IF EXISTS afbp CASCADE;

-- Verify the old tables still exist in public
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('schedule', 'current_pipeline', 'predictions', 'shared_analyses', 'job_runs', 'picks_rows');

    RAISE NOTICE 'Found % tables in public schema (expected: 6)', table_count;

    IF table_count < 6 THEN
        RAISE WARNING 'Expected 6 tables in public schema, found %. Migration may fail.', table_count;
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- Cleanup Complete
-- ============================================================================
-- Next step: Run 009_afbp_schema_migration.sql
-- ============================================================================
