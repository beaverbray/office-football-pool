-- Comprehensive fix for pipeline_current RLS and permissions
-- This ensures anonymous users can both read and write to the singleton row

BEGIN;

-- Step 1: Ensure RLS is enabled
ALTER TABLE afbp.pipeline_current ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Allow public read access pipeline_current" ON afbp.pipeline_current;
DROP POLICY IF EXISTS "Allow public upsert pipeline_current" ON afbp.pipeline_current;
DROP POLICY IF EXISTS "Allow public read access" ON afbp.pipeline_current;
DROP POLICY IF EXISTS "Allow public upsert" ON afbp.pipeline_current;
DROP POLICY IF EXISTS "Allow all operations on pipeline_current" ON afbp.pipeline_current;

-- Step 3: Grant necessary table-level permissions
GRANT ALL ON afbp.pipeline_current TO anon;
GRANT ALL ON afbp.pipeline_current TO authenticated;

-- Step 4: Create a comprehensive policy for all operations
CREATE POLICY "Enable all access for singleton row"
  ON afbp.pipeline_current
  FOR ALL
  TO anon, authenticated, service_role
  USING (id = 'current')
  WITH CHECK (id = 'current');

-- Step 5: Ensure the singleton row exists (create if missing)
INSERT INTO afbp.pipeline_current (id, pipeline_data, picksheet_text, updated_at, metadata)
VALUES (
  'current',
  '{"games": []}'::jsonb,
  NULL,
  NOW(),
  '{"source": "migration", "version": "1.0"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verification queries
SELECT 'Policies:' as info;
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'pipeline_current' AND schemaname = 'afbp';

SELECT 'Permissions:' as info;
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'afbp' AND table_name = 'pipeline_current'
ORDER BY grantee, privilege_type;

SELECT 'Row exists:' as info;
SELECT id, updated_at FROM afbp.pipeline_current WHERE id = 'current';
