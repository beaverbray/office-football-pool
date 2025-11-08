-- ============================================================================
-- Create AFBP Schema from Scratch
-- ============================================================================
-- Since tables were deleted, we create them fresh in afbp schema
-- ============================================================================

BEGIN;

-- Create AFBP Schema
CREATE SCHEMA IF NOT EXISTS afbp;
COMMENT ON SCHEMA afbp IS 'American Football Betting Pool - Analysis tool schema';

-- ============================================================================
-- Create Tables
-- ============================================================================

-- 1. Core Schedule Table
CREATE TABLE IF NOT EXISTS afbp.core_schedule (
    league TEXT NOT NULL,
    match_number INTEGER PRIMARY KEY,
    week INTEGER NOT NULL,
    date TEXT NOT NULL,
    location TEXT,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL
);

COMMENT ON TABLE afbp.core_schedule IS 'NFL/NCAAF game schedule reference data';

-- 2. Pipeline Current (Singleton)
CREATE TABLE IF NOT EXISTS afbp.pipeline_current (
    id TEXT PRIMARY KEY DEFAULT 'current',
    pipeline_data JSONB NOT NULL,
    picksheet_text TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT pipeline_current_singleton CHECK (id = 'current')
);

COMMENT ON TABLE afbp.pipeline_current IS 'Current pipeline state (singleton: id=current)';

-- 3. Analysis Predictions
CREATE TABLE IF NOT EXISTS afbp.analysis_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    game_time TEXT,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    predicted_winner TEXT,
    win_probability NUMERIC,
    confidence TEXT CHECK (confidence IN ('H', 'M', 'L')),
    spread NUMERIC,
    over_under NUMERIC,
    game_date TEXT,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE afbp.analysis_predictions IS 'External predictions from Warren Nolan, NFELO, and other sources';

-- 4. Shared Analyses
CREATE TABLE IF NOT EXISTS afbp.shared_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id TEXT UNIQUE NOT NULL,
    pipeline_data JSONB NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    view_count INTEGER DEFAULT 0
);

COMMENT ON TABLE afbp.shared_analyses IS 'Shareable analysis snapshots with 30-day expiration';

-- 5. Pipeline Job Runs (for future use)
CREATE TABLE IF NOT EXISTS afbp.pipeline_job_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE afbp.pipeline_job_runs IS 'Pipeline execution history and status tracking';

-- 6. Pipeline Picks Rows (for future use)
CREATE TABLE IF NOT EXISTS afbp.pipeline_picks_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_run_id UUID REFERENCES afbp.pipeline_job_runs(id) ON DELETE CASCADE,
    home_name_raw TEXT,
    away_name_raw TEXT,
    home_spread_raw NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE afbp.pipeline_picks_rows IS 'Raw parsed picksheet data linked to pipeline jobs';

-- ============================================================================
-- Create Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_predictions_source ON afbp.analysis_predictions(source);
CREATE INDEX IF NOT EXISTS idx_predictions_scraped_at ON afbp.analysis_predictions(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_analyses_share_id ON afbp.shared_analyses(share_id);
CREATE INDEX IF NOT EXISTS idx_shared_analyses_expires_at ON afbp.shared_analyses(expires_at);

-- ============================================================================
-- Enable RLS
-- ============================================================================

ALTER TABLE afbp.core_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE afbp.pipeline_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE afbp.analysis_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE afbp.shared_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE afbp.pipeline_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE afbp.pipeline_picks_rows ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Create RLS Policies
-- ============================================================================

-- Core Schedule: Public read access
CREATE POLICY "Allow public read access core_schedule"
  ON afbp.core_schedule FOR SELECT USING (true);

CREATE POLICY "Service role can manage core_schedule"
  ON afbp.core_schedule FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Pipeline Current: Public read and upsert
CREATE POLICY "Allow public read access pipeline_current"
  ON afbp.pipeline_current FOR SELECT USING (true);

CREATE POLICY "Allow public upsert pipeline_current"
  ON afbp.pipeline_current FOR ALL
  WITH CHECK (id = 'current');

-- Analysis Predictions: Public read
CREATE POLICY "Allow anonymous read access analysis_predictions"
  ON afbp.analysis_predictions FOR SELECT TO anon USING (true);

CREATE POLICY "Allow authenticated read access analysis_predictions"
  ON afbp.analysis_predictions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage analysis_predictions"
  ON afbp.analysis_predictions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Shared Analyses: Public read
CREATE POLICY "Allow public read access shared_analyses"
  ON afbp.shared_analyses FOR SELECT USING (true);

CREATE POLICY "Service role can manage shared_analyses"
  ON afbp.shared_analyses FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Job Runs: Authenticated read
CREATE POLICY "Allow authenticated read pipeline_job_runs"
  ON afbp.pipeline_job_runs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage pipeline_job_runs"
  ON afbp.pipeline_job_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Picks Rows: Authenticated read
CREATE POLICY "Allow authenticated read pipeline_picks_rows"
  ON afbp.pipeline_picks_rows FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage pipeline_picks_rows"
  ON afbp.pipeline_picks_rows FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- Grant Permissions
-- ============================================================================

GRANT USAGE ON SCHEMA afbp TO anon;
GRANT USAGE ON SCHEMA afbp TO authenticated;
GRANT USAGE ON SCHEMA afbp TO service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA afbp TO authenticated;
GRANT SELECT ON afbp.core_schedule TO anon;
GRANT SELECT ON afbp.analysis_predictions TO anon;
GRANT SELECT ON afbp.shared_analyses TO anon;
GRANT SELECT ON afbp.pipeline_current TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA afbp GRANT SELECT ON TABLES TO authenticated;

COMMIT;

-- ============================================================================
-- Verify Schema
-- ============================================================================

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'afbp'
ORDER BY table_name;
