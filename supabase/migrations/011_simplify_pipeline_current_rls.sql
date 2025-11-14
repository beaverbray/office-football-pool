-- Simplify RLS policies for afbp.pipeline_current
-- Remove conflicting policies and create a single comprehensive policy

BEGIN;

-- Drop all existing policies
DROP POLICY IF EXISTS "Allow public read access pipeline_current" ON afbp.pipeline_current;
DROP POLICY IF EXISTS "Allow public upsert pipeline_current" ON afbp.pipeline_current;
DROP POLICY IF EXISTS "Allow public read access" ON afbp.pipeline_current;
DROP POLICY IF EXISTS "Allow public upsert" ON afbp.pipeline_current;

-- Create a single comprehensive policy for anonymous users
-- This allows full access (SELECT, INSERT, UPDATE, DELETE) to the singleton row
CREATE POLICY "Allow all operations on pipeline_current"
  ON afbp.pipeline_current
  FOR ALL
  TO anon, authenticated
  USING (id = 'current')
  WITH CHECK (id = 'current');

COMMIT;

-- Verify the policy
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
