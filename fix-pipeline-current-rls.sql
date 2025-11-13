-- Fix RLS policy for pipeline_current to allow upserts

BEGIN;

-- Drop the existing policy
DROP POLICY IF EXISTS "Allow public upsert pipeline_current" ON afbp.pipeline_current;

-- Recreate with both USING and WITH CHECK clauses
CREATE POLICY "Allow public upsert pipeline_current"
  ON afbp.pipeline_current FOR ALL
  USING (id = 'current')
  WITH CHECK (id = 'current');

COMMIT;

-- Verify the policy was created
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'pipeline_current';
