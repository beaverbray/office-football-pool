-- Check all policies on pipeline_current
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
  AND schemaname = 'afbp'
ORDER BY policyname;

-- Check table permissions
SELECT 
  grantee,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'afbp'
  AND table_name = 'pipeline_current'
ORDER BY grantee, privilege_type;

-- Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'pipeline_current'
  AND schemaname = 'afbp';
