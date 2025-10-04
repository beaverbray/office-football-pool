-- Fix RLS policy for predictions table to allow anon inserts
-- This allows the NFELO and Warren Nolan scrapers to insert predictions

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Service role can manage predictions" ON predictions;

-- Create new policy to allow anon users to insert predictions
CREATE POLICY "Allow anon insert for predictions"
  ON predictions
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Keep existing read policies
-- (The existing "Allow anonymous read access to predictions" and
--  "Allow authenticated read access to predictions" policies should remain)

-- Also allow authenticated users to insert (for future use)
CREATE POLICY "Allow authenticated insert for predictions"
  ON predictions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add comment
COMMENT ON POLICY "Allow anon insert for predictions" ON predictions IS
  'Allows anonymous API calls from scrapers to insert prediction data';
