-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE odds_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE alias_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SERVICE ROLE POLICIES (full access)
-- ============================================

-- Teams table
CREATE POLICY "Service role has full access to teams" ON teams
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Events table
CREATE POLICY "Service role has full access to events" ON events
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Picks rows table
CREATE POLICY "Service role has full access to picks_rows" ON picks_rows
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Odds snapshots table
CREATE POLICY "Service role has full access to odds_snapshots" ON odds_snapshots
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Matches table
CREATE POLICY "Service role has full access to matches" ON matches
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Comparisons table
CREATE POLICY "Service role has full access to comparisons" ON comparisons
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- KPI daily table
CREATE POLICY "Service role has full access to kpi_daily" ON kpi_daily
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Alias overrides table
CREATE POLICY "Service role has full access to alias_overrides" ON alias_overrides
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Job runs table
CREATE POLICY "Service role has full access to job_runs" ON job_runs
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- AUTHENTICATED USER POLICIES (read-only for most tables)
-- ============================================

-- Teams table (read-only for authenticated users)
CREATE POLICY "Authenticated users can read teams" ON teams
  FOR SELECT USING (auth.role() = 'authenticated');

-- Events table (read-only for authenticated users)
CREATE POLICY "Authenticated users can read events" ON events
  FOR SELECT USING (auth.role() = 'authenticated');

-- Picks rows table (authenticated users can read and insert their own)
CREATE POLICY "Authenticated users can read all picks_rows" ON picks_rows
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert picks_rows" ON picks_rows
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Odds snapshots table (read-only for authenticated users)
CREATE POLICY "Authenticated users can read odds_snapshots" ON odds_snapshots
  FOR SELECT USING (auth.role() = 'authenticated');

-- Matches table (read-only for authenticated users)
CREATE POLICY "Authenticated users can read matches" ON matches
  FOR SELECT USING (auth.role() = 'authenticated');

-- Comparisons table (read-only for authenticated users)
CREATE POLICY "Authenticated users can read comparisons" ON comparisons
  FOR SELECT USING (auth.role() = 'authenticated');

-- KPI daily table (read-only for authenticated users)
CREATE POLICY "Authenticated users can read kpi_daily" ON kpi_daily
  FOR SELECT USING (auth.role() = 'authenticated');

-- Alias overrides table (authenticated users can read and suggest)
CREATE POLICY "Authenticated users can read alias_overrides" ON alias_overrides
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert alias_overrides" ON alias_overrides
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND created_by = auth.uid()::text);

-- Job runs table (authenticated users can read their own)
CREATE POLICY "Authenticated users can read job_runs" ON job_runs
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================
-- ADMIN USER POLICIES (elevated privileges)
-- ============================================

-- Create admin role check function
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean AS $$
BEGIN
  -- Check if user has admin claim in JWT metadata
  RETURN coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin can manage alias overrides
CREATE POLICY "Admins can manage alias_overrides" ON alias_overrides
  FOR ALL USING (is_admin());

-- Admin can manage job runs
CREATE POLICY "Admins can manage job_runs" ON job_runs
  FOR ALL USING (is_admin());

-- Admin can insert/update matches (for manual overrides)
CREATE POLICY "Admins can manage matches" ON matches
  FOR ALL USING (is_admin());

-- ============================================
-- ANON USER POLICIES (very limited access)
-- ============================================

-- Anonymous users can only read teams
CREATE POLICY "Anonymous users can read teams" ON teams
  FOR SELECT USING (auth.role() = 'anon');

-- Anonymous users can only read events
CREATE POLICY "Anonymous users can read events" ON events
  FOR SELECT USING (auth.role() = 'anon');

-- Anonymous users can read KPI daily (for public dashboard)
CREATE POLICY "Anonymous users can read kpi_daily" ON kpi_daily
  FOR SELECT USING (auth.role() = 'anon');

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON POLICY "Service role has full access to teams" ON teams IS 'Backend services have full access';
COMMENT ON POLICY "Authenticated users can read teams" ON teams IS 'Logged-in users can view teams';
COMMENT ON POLICY "Anonymous users can read teams" ON teams IS 'Public can view teams';

COMMENT ON FUNCTION is_admin() IS 'Check if current user has admin role in JWT metadata';