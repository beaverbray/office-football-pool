-- Check what tables exist in public schema and their row counts

-- List all tables in public schema
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Check if our original 6 tables still exist with data
SELECT
  'schedule' as table_name,
  (SELECT COUNT(*) FROM public.schedule) as row_count
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schedule')
UNION ALL
SELECT
  'current_pipeline',
  (SELECT COUNT(*) FROM public.current_pipeline)
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'current_pipeline')
UNION ALL
SELECT
  'predictions',
  (SELECT COUNT(*) FROM public.predictions)
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'predictions')
UNION ALL
SELECT
  'shared_analyses',
  (SELECT COUNT(*) FROM public.shared_analyses)
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shared_analyses')
UNION ALL
SELECT
  'job_runs',
  (SELECT COUNT(*) FROM public.job_runs)
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_runs')
UNION ALL
SELECT
  'picks_rows',
  (SELECT COUNT(*) FROM public.picks_rows)
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'picks_rows');
