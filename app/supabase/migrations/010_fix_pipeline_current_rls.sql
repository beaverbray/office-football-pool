-- Fix RLS policy for afbp.pipeline_current
-- The upsert policy needs both USING and WITH CHECK clauses for proper access

BEGIN;

-- Drop the existing policy
DROP POLICY IF EXISTS "Allow public upsert pipeline_current" ON afbp.pipeline_current;

-- Recreate with both USING (for reading/updating) and WITH CHECK (for inserting/updating)
CREATE POLICY "Allow public upsert pipeline_current"
  ON afbp.pipeline_current
  FOR ALL
  USING (id = 'current')
  WITH CHECK (id = 'current');

COMMIT;

-- Verify the policy
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'pipeline_current'
  AND schemaname = 'afbp';
