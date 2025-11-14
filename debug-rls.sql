-- Debug RLS policies for pipeline_current

-- 1. Check current policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'pipeline_current'
  AND schemaname = 'afbp';

-- 2. Check if RLS is enabled
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'pipeline_current'
  AND schemaname = 'afbp';

-- 3. Check table grants
SELECT
  grantee,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'afbp'
  AND table_name = 'pipeline_current'
ORDER BY grantee, privilege_type;

-- 4. Test if row exists
SELECT id, updated_at FROM afbp.pipeline_current WHERE id = 'current';
