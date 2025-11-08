-- Check what's currently in the afbp schema
SELECT 'AFBP SCHEMA TABLES' as check_type, schemaname, tablename
FROM pg_tables
WHERE schemaname = 'afbp'
ORDER BY tablename;

-- Check if our tables still exist in public schema
SELECT 'PUBLIC SCHEMA - OUR TABLES' as check_type, tablename
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('schedule', 'current_pipeline', 'predictions', 'shared_analyses', 'job_runs', 'picks_rows')
ORDER BY tablename;

-- Check all schemas
SELECT DISTINCT schemaname
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname;
