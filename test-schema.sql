-- Quick verification queries to run in Supabase SQL Editor

-- 1. Check if afbp schema exists
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'afbp';

-- 2. List all tables in afbp schema
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'afbp'
ORDER BY table_name;

-- 3. Count rows in each afbp table
SELECT 'core_schedule' as table_name, COUNT(*) as row_count FROM afbp.core_schedule
UNION ALL
SELECT 'pipeline_current', COUNT(*) FROM afbp.pipeline_current
UNION ALL
SELECT 'analysis_predictions', COUNT(*) FROM afbp.analysis_predictions
UNION ALL
SELECT 'shared_analyses', COUNT(*) FROM afbp.shared_analyses
UNION ALL
SELECT 'pipeline_job_runs', COUNT(*) FROM afbp.pipeline_job_runs
UNION ALL
SELECT 'pipeline_picks_rows', COUNT(*) FROM afbp.pipeline_picks_rows;

-- 4. Check if old public tables still exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('schedule', 'current_pipeline', 'predictions', 'shared_analyses')
ORDER BY table_name;

-- 5. Check current search_path
SHOW search_path;
