-- ============================================================================
-- AFBP Historical Tables Migration
-- ============================================================================
-- Purpose: Create tables for historical data analysis and pool performance tracking
--   - Core team normalization
--   - Historical games (2019-2023) with market spreads
--   - Pool picks from picksheets
--   - Performance analysis metrics
--   - Spread gap analysis
--
-- Schema: afbp (American Football Betting Pool)
-- Version: 1.0
-- Date: 2025-11-15
-- ============================================================================

BEGIN;

-- ============================================================================
-- CORE DOMAIN: Team Normalization
-- ============================================================================

-- Table: afbp.core_teams
-- Purpose: Canonical team information with aliases for name matching
CREATE TABLE IF NOT EXISTS afbp.core_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league VARCHAR(10) NOT NULL CHECK (league IN ('NFL', 'NCAAF')),
  name_canonical VARCHAR(100) NOT NULL,
  name_short VARCHAR(50),
  abbreviation VARCHAR(10),
  conference VARCHAR(50),
  division VARCHAR(50),
  aliases JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league, name_canonical)
);

CREATE INDEX idx_core_teams_league ON afbp.core_teams(league);
CREATE INDEX idx_core_teams_abbr ON afbp.core_teams(abbreviation);
CREATE INDEX idx_core_teams_aliases ON afbp.core_teams USING gin(aliases);

COMMENT ON TABLE afbp.core_teams IS 'Canonical team information with name variations and aliases for normalization';

-- ============================================================================
-- HISTORICAL DOMAIN: Market Data & Outcomes
-- ============================================================================

-- Table: afbp.historical_games
-- Purpose: Historical game outcomes and market spreads (2019-2023+)
CREATE TABLE IF NOT EXISTS afbp.historical_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id VARCHAR(50) NOT NULL,
  league VARCHAR(10) NOT NULL CHECK (league IN ('NFL', 'NCAAF')),
  season INTEGER NOT NULL,
  week INTEGER,
  game_date TIMESTAMPTZ NOT NULL,

  -- Teams
  home_team VARCHAR(100) NOT NULL,
  away_team VARCHAR(100) NOT NULL,
  home_team_id UUID REFERENCES afbp.core_teams(id),
  away_team_id UUID REFERENCES afbp.core_teams(id),

  -- Scores
  home_score INTEGER,
  away_score INTEGER,
  actual_margin DECIMAL(5,1),

  -- Betting Lines
  spread DECIMAL(4,1),
  total DECIMAL(5,1),
  favorite_covered BOOLEAN,

  -- Game Context
  conference_game BOOLEAN DEFAULT FALSE,
  neutral_site BOOLEAN DEFAULT FALSE,
  attendance INTEGER,
  venue VARCHAR(200),
  weather_conditions VARCHAR(100),

  -- Data Source
  source VARCHAR(50) NOT NULL,
  source_confidence DECIMAL(3,2) DEFAULT 1.0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(league, game_id)
);

CREATE INDEX idx_historical_games_league ON afbp.historical_games(league);
CREATE INDEX idx_historical_games_season ON afbp.historical_games(season);
CREATE INDEX idx_historical_games_week ON afbp.historical_games(season, week);
CREATE INDEX idx_historical_games_date ON afbp.historical_games(game_date);
CREATE INDEX idx_historical_games_spread ON afbp.historical_games(spread);
CREATE INDEX idx_historical_games_margin ON afbp.historical_games(actual_margin);
CREATE INDEX idx_historical_games_teams ON afbp.historical_games(home_team_id, away_team_id);
CREATE INDEX idx_historical_games_source ON afbp.historical_games(source);

COMMENT ON TABLE afbp.historical_games IS 'Historical game outcomes with market spreads for empirical analysis (2019-2023+)';

-- Table: afbp.historical_spread_buckets
-- Purpose: Pre-computed statistics for spread ranges
CREATE TABLE IF NOT EXISTS afbp.historical_spread_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league VARCHAR(10) NOT NULL CHECK (league IN ('NFL', 'NCAAF')),
  spread DECIMAL(4,1) NOT NULL,

  -- Sample Size
  n_games INTEGER NOT NULL,

  -- Cover Statistics
  cover_rate DECIMAL(5,4),
  favorite_wins INTEGER,
  underdog_wins INTEGER,
  pushes INTEGER,

  -- Margin Statistics
  mean_margin DECIMAL(5,2),
  std_margin DECIMAL(5,2),
  median_margin DECIMAL(5,2),
  p25_margin DECIMAL(5,2),
  p75_margin DECIMAL(5,2),
  min_margin DECIMAL(5,2),
  max_margin DECIMAL(5,2),

  -- Data Quality
  data_quality JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(league, spread)
);

CREATE INDEX idx_spread_buckets_league ON afbp.historical_spread_buckets(league);
CREATE INDEX idx_spread_buckets_spread ON afbp.historical_spread_buckets(spread);
CREATE INDEX idx_spread_buckets_n_games ON afbp.historical_spread_buckets(n_games);

COMMENT ON TABLE afbp.historical_spread_buckets IS 'Pre-computed spread bucket statistics for fast market-based gap metric lookups';

-- Table: afbp.historical_spread_discrepancies
-- Purpose: Track differences between data sources (picksheet vs market)
CREATE TABLE IF NOT EXISTS afbp.historical_spread_discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id VARCHAR(50) NOT NULL,
  league VARCHAR(10) NOT NULL CHECK (league IN ('NFL', 'NCAAF')),
  season INTEGER NOT NULL,
  week INTEGER,

  -- Teams
  home_team VARCHAR(100),
  away_team VARCHAR(100),

  -- Spread Comparison
  primary_spread DECIMAL(4,1),
  primary_source VARCHAR(50),
  secondary_spread DECIMAL(4,1),
  secondary_source VARCHAR(50),
  spread_difference DECIMAL(4,1),

  -- Analysis
  discrepancy_type VARCHAR(50),
  crossed_key_numbers JSONB DEFAULT '[]'::jsonb,

  -- Resolution
  resolution_status VARCHAR(20) DEFAULT 'unresolved',
  resolution_notes TEXT,
  reviewed_by VARCHAR(100),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_spread_disc_league ON afbp.historical_spread_discrepancies(league);
CREATE INDEX idx_spread_disc_season ON afbp.historical_spread_discrepancies(season);
CREATE INDEX idx_spread_disc_type ON afbp.historical_spread_discrepancies(discrepancy_type);
CREATE INDEX idx_spread_disc_status ON afbp.historical_spread_discrepancies(resolution_status);

COMMENT ON TABLE afbp.historical_spread_discrepancies IS 'Track and resolve spread differences between data sources';

-- ============================================================================
-- POOL DOMAIN: Pool Picks & Performance
-- ============================================================================

-- Table: afbp.pool_picks
-- Purpose: Store parsed pool betting lines from picksheet files
CREATE TABLE IF NOT EXISTS afbp.pool_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  league VARCHAR(10) CHECK (league IN ('NFL', 'NCAAF')),

  -- Game identification
  game_date DATE,
  home_team VARCHAR(100) NOT NULL,
  away_team VARCHAR(100) NOT NULL,
  home_team_id UUID REFERENCES afbp.core_teams(id),
  away_team_id UUID REFERENCES afbp.core_teams(id),

  -- Pool betting line
  pool_spread DECIMAL(4,1),
  pool_total DECIMAL(5,1),

  -- Link to historical game (for outcome comparison)
  historical_game_id UUID REFERENCES afbp.historical_games(id),

  -- Source tracking
  source_file VARCHAR(100),
  raw_text TEXT,
  parsed_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pool_picks_season ON afbp.pool_picks(season);
CREATE INDEX idx_pool_picks_week ON afbp.pool_picks(season, week);
CREATE INDEX idx_pool_picks_league ON afbp.pool_picks(league);
CREATE INDEX idx_pool_picks_historical ON afbp.pool_picks(historical_game_id);
CREATE INDEX idx_pool_picks_teams ON afbp.pool_picks(home_team_id, away_team_id);

COMMENT ON TABLE afbp.pool_picks IS 'Pool betting lines parsed from picksheet files';

-- Table: afbp.pool_performance_analysis
-- Purpose: Computed performance metrics comparing pool vs market
CREATE TABLE IF NOT EXISTS afbp.pool_performance_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_pick_id UUID REFERENCES afbp.pool_picks(id),
  historical_game_id UUID REFERENCES afbp.historical_games(id),

  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  league VARCHAR(10),

  -- Teams
  home_team VARCHAR(100),
  away_team VARCHAR(100),

  -- Spread comparison
  pool_spread DECIMAL(4,1),
  market_spread DECIMAL(4,1),
  spread_difference DECIMAL(4,1),

  -- Outcome
  actual_margin DECIMAL(5,1),
  pool_pick_covered BOOLEAN,
  market_pick_covered BOOLEAN,

  -- Performance metrics
  pool_had_edge BOOLEAN,
  pool_edge_points DECIMAL(4,1),
  key_numbers_crossed JSONB DEFAULT '[]'::jsonb,

  -- Winner determination
  pool_winner BOOLEAN,
  market_winner BOOLEAN,
  result_type VARCHAR(20),

  computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pool_perf_season ON afbp.pool_performance_analysis(season);
CREATE INDEX idx_pool_perf_week ON afbp.pool_performance_analysis(season, week);
CREATE INDEX idx_pool_perf_league ON afbp.pool_performance_analysis(league);
CREATE INDEX idx_pool_perf_pool_pick ON afbp.pool_performance_analysis(pool_pick_id);
CREATE INDEX idx_pool_perf_game ON afbp.pool_performance_analysis(historical_game_id);
CREATE INDEX idx_pool_perf_result ON afbp.pool_performance_analysis(result_type);

COMMENT ON TABLE afbp.pool_performance_analysis IS 'Computed performance metrics comparing pool picks vs market spreads and outcomes';

-- ============================================================================
-- ANALYSIS DOMAIN: Gap Metrics
-- ============================================================================

-- Table: afbp.analysis_gap_metrics
-- Purpose: Spread gap importance metrics (from gap_analysis research)
CREATE TABLE IF NOT EXISTS afbp.analysis_gap_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id VARCHAR(50),
  league VARCHAR(10) CHECK (league IN ('NFL', 'NCAAF')),
  season INTEGER,
  week INTEGER,

  -- Teams
  home_team VARCHAR(100),
  away_team VARCHAR(100),

  -- Spread comparison
  spread_a DECIMAL(4,1),
  spread_a_source VARCHAR(50),
  spread_b DECIMAL(4,1),
  spread_b_source VARCHAR(50),

  -- Gap metrics
  gap_points DECIMAL(4,1),
  normal_approx_delta DECIMAL(6,4),
  key_adjusted_impact DECIMAL(6,4),
  half_point_equivalents DECIMAL(6,4),
  composite_score DECIMAL(6,4),

  -- Key number analysis
  key_numbers_crossed JSONB DEFAULT '[]'::jsonb,
  push_probability_change DECIMAL(6,4),

  -- Metadata
  metric_version VARCHAR(20) DEFAULT 'v1.0',

  computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gap_metrics_game ON afbp.analysis_gap_metrics(game_id);
CREATE INDEX idx_gap_metrics_league ON afbp.analysis_gap_metrics(league);
CREATE INDEX idx_gap_metrics_season_week ON afbp.analysis_gap_metrics(season, week);
CREATE INDEX idx_gap_metrics_composite ON afbp.analysis_gap_metrics(composite_score DESC);

COMMENT ON TABLE afbp.analysis_gap_metrics IS 'Computed spread gap importance metrics for multi-source analysis';

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================

-- Apply update_updated_at_column() trigger to tables with updated_at
CREATE TRIGGER update_core_teams_updated_at
  BEFORE UPDATE ON afbp.core_teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_historical_games_updated_at
  BEFORE UPDATE ON afbp.historical_games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_spread_buckets_updated_at
  BEFORE UPDATE ON afbp.historical_spread_buckets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pool_picks_updated_at
  BEFORE UPDATE ON afbp.pool_picks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE afbp.core_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE afbp.historical_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE afbp.historical_spread_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE afbp.historical_spread_discrepancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE afbp.pool_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE afbp.pool_performance_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE afbp.analysis_gap_metrics ENABLE ROW LEVEL SECURITY;

-- Public read access to historical data
CREATE POLICY "Allow public read access to core_teams"
  ON afbp.core_teams FOR SELECT USING (true);

CREATE POLICY "Allow public read access to historical_games"
  ON afbp.historical_games FOR SELECT USING (true);

CREATE POLICY "Allow public read access to spread_buckets"
  ON afbp.historical_spread_buckets FOR SELECT USING (true);

CREATE POLICY "Allow public read access to pool_picks"
  ON afbp.pool_picks FOR SELECT USING (true);

CREATE POLICY "Allow public read access to pool_performance"
  ON afbp.pool_performance_analysis FOR SELECT USING (true);

CREATE POLICY "Allow public read access to gap_metrics"
  ON afbp.analysis_gap_metrics FOR SELECT USING (true);

-- Authenticated users can read discrepancies
CREATE POLICY "Allow authenticated read to discrepancies"
  ON afbp.historical_spread_discrepancies
  FOR SELECT TO authenticated USING (true);

-- Service role can manage all tables
CREATE POLICY "Service role can manage core_teams"
  ON afbp.core_teams FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage historical_games"
  ON afbp.historical_games FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage spread_buckets"
  ON afbp.historical_spread_buckets FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage discrepancies"
  ON afbp.historical_spread_discrepancies FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage pool_picks"
  ON afbp.pool_picks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage pool_performance"
  ON afbp.pool_performance_analysis FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage gap_metrics"
  ON afbp.analysis_gap_metrics FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant usage on afbp schema (already exists from migration 009)
GRANT USAGE ON SCHEMA afbp TO anon;
GRANT USAGE ON SCHEMA afbp TO authenticated;
GRANT USAGE ON SCHEMA afbp TO service_role;

-- Grant select on all new tables to authenticated users
GRANT SELECT ON afbp.core_teams TO authenticated;
GRANT SELECT ON afbp.historical_games TO authenticated;
GRANT SELECT ON afbp.historical_spread_buckets TO authenticated;
GRANT SELECT ON afbp.historical_spread_discrepancies TO authenticated;
GRANT SELECT ON afbp.pool_picks TO authenticated;
GRANT SELECT ON afbp.pool_performance_analysis TO authenticated;
GRANT SELECT ON afbp.analysis_gap_metrics TO authenticated;

-- Grant select on specific tables to anonymous users
GRANT SELECT ON afbp.core_teams TO anon;
GRANT SELECT ON afbp.historical_games TO anon;
GRANT SELECT ON afbp.historical_spread_buckets TO anon;
GRANT SELECT ON afbp.pool_picks TO anon;
GRANT SELECT ON afbp.pool_performance_analysis TO anon;
GRANT SELECT ON afbp.analysis_gap_metrics TO anon;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Count tables in afbp schema
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'afbp';

    RAISE NOTICE 'AFBP schema contains % tables (expected: 13 = 6 existing + 7 new)', table_count;
END $$;

-- List all tables in afbp schema
DO $$
DECLARE
    table_rec RECORD;
BEGIN
    RAISE NOTICE 'Tables in afbp schema:';
    FOR table_rec IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'afbp'
        ORDER BY table_name
    LOOP
        RAISE NOTICE '  - afbp.%', table_rec.table_name;
    END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- Migration Complete!
-- ============================================================================
-- Created 7 new tables in afbp schema:
--   1. core_teams - Team normalization
--   2. historical_games - Historical outcomes & market spreads
--   3. historical_spread_buckets - Spread statistics
--   4. historical_spread_discrepancies - Source comparison
--   5. pool_picks - Pool betting lines
--   6. pool_performance_analysis - Performance metrics
--   7. analysis_gap_metrics - Gap importance metrics
--
-- Next steps:
--   1. Run this migration: npx supabase db push
--   2. Load team normalization data
--   3. Load historical games (5,275 records)
--   4. Parse and load picksheets
--   5. Compute performance metrics
-- ============================================================================
