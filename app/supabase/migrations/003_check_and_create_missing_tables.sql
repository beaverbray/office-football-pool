-- ============================================
-- CHECK AND CREATE MISSING TABLES
-- This script checks for existing tables and only creates missing ones
-- ============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CREATE JOB_RUNS TABLE IF NOT EXISTS
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'job_runs') THEN
        CREATE TABLE job_runs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          job_type VARCHAR(50) NOT NULL,
          source_file_name VARCHAR(255),
          started_at TIMESTAMPTZ DEFAULT NOW(),
          ended_at TIMESTAMPTZ,
          status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
          counts JSONB DEFAULT '{}'::jsonb,
          errors JSONB DEFAULT '[]'::jsonb,
          metadata JSONB DEFAULT '{}'::jsonb
        );
        
        CREATE INDEX idx_job_runs_status ON job_runs(status);
        CREATE INDEX idx_job_runs_started ON job_runs(started_at DESC);
        
        RAISE NOTICE 'Created job_runs table';
    ELSE
        RAISE NOTICE 'job_runs table already exists';
    END IF;
END $$;

-- ============================================
-- CREATE PICKS_ROWS TABLE IF NOT EXISTS
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'picks_rows') THEN
        CREATE TABLE picks_rows (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          source_run_id UUID REFERENCES job_runs(id) ON DELETE CASCADE,
          league VARCHAR(10) CHECK (league IN ('NFL', 'NCAAF')),
          event_date_local DATE,
          event_time_local TIME,
          home_name_raw VARCHAR(200) NOT NULL,
          away_name_raw VARCHAR(200) NOT NULL,
          home_spread_raw DECIMAL(4,1),
          away_spread_raw DECIMAL(4,1),
          total_raw DECIMAL(5,1),
          market VARCHAR(20) DEFAULT 'spread',
          raw_text TEXT,
          parsed_at TIMESTAMPTZ DEFAULT NOW(),
          metadata JSONB DEFAULT '{}'::jsonb
        );
        
        CREATE INDEX idx_picks_rows_run ON picks_rows(source_run_id);
        CREATE INDEX idx_picks_rows_date ON picks_rows(event_date_local);
        CREATE INDEX idx_picks_rows_league ON picks_rows(league);
        
        RAISE NOTICE 'Created picks_rows table';
    ELSE
        RAISE NOTICE 'picks_rows table already exists';
    END IF;
END $$;

-- ============================================
-- ENABLE RLS IF NOT ALREADY ENABLED
-- ============================================
ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks_rows ENABLE ROW LEVEL SECURITY;

-- ============================================
-- CREATE RLS POLICIES FOR JOB_RUNS
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'job_runs' 
        AND policyname = 'Service role has full access to job_runs'
    ) THEN
        CREATE POLICY "Service role has full access to job_runs" ON job_runs
          FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
        RAISE NOTICE 'Created service role policy for job_runs';
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'job_runs' 
        AND policyname = 'Authenticated users can read job_runs'
    ) THEN
        CREATE POLICY "Authenticated users can read job_runs" ON job_runs
          FOR SELECT USING (auth.role() = 'authenticated');
        RAISE NOTICE 'Created authenticated read policy for job_runs';
    END IF;
    
    -- Also allow anon users to create and read job_runs for testing
    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'job_runs' 
        AND policyname = 'Anon users can create and read job_runs'
    ) THEN
        CREATE POLICY "Anon users can create and read job_runs" ON job_runs
          FOR ALL USING (true);
        RAISE NOTICE 'Created anon policy for job_runs (for testing)';
    END IF;
END $$;

-- ============================================
-- CREATE RLS POLICIES FOR PICKS_ROWS
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'picks_rows' 
        AND policyname = 'Service role has full access to picks_rows'
    ) THEN
        CREATE POLICY "Service role has full access to picks_rows" ON picks_rows
          FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
        RAISE NOTICE 'Created service role policy for picks_rows';
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'picks_rows' 
        AND policyname = 'Authenticated users can read all picks_rows'
    ) THEN
        CREATE POLICY "Authenticated users can read all picks_rows" ON picks_rows
          FOR SELECT USING (auth.role() = 'authenticated');
        RAISE NOTICE 'Created authenticated read policy for picks_rows';
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'picks_rows' 
        AND policyname = 'Authenticated users can insert picks_rows'
    ) THEN
        CREATE POLICY "Authenticated users can insert picks_rows" ON picks_rows
          FOR INSERT WITH CHECK (auth.role() = 'authenticated');
        RAISE NOTICE 'Created authenticated insert policy for picks_rows';
    END IF;
    
    -- Also allow anon users for testing
    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'picks_rows' 
        AND policyname = 'Anon users can create and read picks_rows'
    ) THEN
        CREATE POLICY "Anon users can create and read picks_rows" ON picks_rows
          FOR ALL USING (true);
        RAISE NOTICE 'Created anon policy for picks_rows (for testing)';
    END IF;
END $$;

-- ============================================
-- LIST ALL TABLES
-- ============================================
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Success message
SELECT 'Missing tables created successfully!' as message;