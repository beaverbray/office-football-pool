-- Fix RLS policy for current_pipeline table to allow upserts
-- The previous policy only had WITH CHECK but not USING clause
-- which prevented upsert operations

-- Drop the old policy
DROP POLICY IF EXISTS "Allow public upsert" ON current_pipeline;

-- Create updated policy with both USING and WITH CHECK clauses
-- USING clause: allows reading/updating existing rows where id = 'current'
-- WITH CHECK clause: allows inserting/updating rows where id = 'current'
CREATE POLICY "Allow public upsert" ON current_pipeline
    FOR ALL
    USING (id = 'current')
    WITH CHECK (id = 'current');
