-- ============================================
-- INITIAL SCHEMA FOR OFFICE FOOTBALL POOL
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TEAMS TABLE
-- ============================================
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league VARCHAR(10) NOT NULL CHECK (league IN ('NFL', 'NCAAF')),
  name_canonical VARCHAR(100) NOT NULL,
  aliases JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league, name_canonical)
);

CREATE INDEX idx_teams_league ON teams(league);
CREATE INDEX idx_teams_aliases ON teams USING gin(aliases);

-- ============================================
-- EVENTS TABLE
-- ============================================
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_event_id VARCHAR(100) UNIQUE,
  league VARCHAR(10) NOT NULL CHECK (league IN ('NFL', 'NCAAF')),
  home_team UUID REFERENCES teams(id),
  away_team UUID REFERENCES teams(id),
  start_time_utc TIMESTAMPTZ NOT NULL,
  week_number INTEGER,
  season_year INTEGER,
  status VARCHAR(20) DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_league ON events(league);
CREATE INDEX idx_events_start_time ON events(start_time_utc);
CREATE INDEX idx_events_week ON events(week_number, season_year);

-- ============================================
-- JOB RUNS TABLE
-- ============================================
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

-- ============================================
-- PICKS ROWS TABLE (parsed picksheet data)
-- ============================================
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

-- ============================================
-- ODDS SNAPSHOTS TABLE
-- ============================================
CREATE TABLE odds_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  event_provider_key VARCHAR(100),
  book VARCHAR(50) NOT NULL,
  market VARCHAR(20) NOT NULL DEFAULT 'spread',
  home_spread DECIMAL(4,1),
  away_spread DECIMAL(4,1),
  home_ml INTEGER,
  away_ml INTEGER,
  total DECIMAL(5,1),
  over_price INTEGER,
  under_price INTEGER,
  prices JSONB DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_odds_event ON odds_snapshots(event_id);
CREATE INDEX idx_odds_book ON odds_snapshots(book);
CREATE INDEX idx_odds_fetched ON odds_snapshots(fetched_at DESC);
CREATE INDEX idx_odds_market ON odds_snapshots(market);

-- ============================================
-- MATCHES TABLE (links picks to events)
-- ============================================
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  picks_row_id UUID REFERENCES picks_rows(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  method VARCHAR(50),
  matched_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  is_manual_override BOOLEAN DEFAULT FALSE,
  override_by VARCHAR(100),
  UNIQUE(picks_row_id)
);

CREATE INDEX idx_matches_picks ON matches(picks_row_id);
CREATE INDEX idx_matches_event ON matches(event_id);
CREATE INDEX idx_matches_confidence ON matches(confidence);

-- ============================================
-- COMPARISONS TABLE
-- ============================================
CREATE TABLE comparisons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  odds_snapshot_id UUID REFERENCES odds_snapshots(id) ON DELETE CASCADE,
  spread_delta_home DECIMAL(4,1),
  spread_delta_away DECIMAL(4,1),
  total_delta DECIMAL(5,1),
  key_numbers_crossed JSONB DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comparisons_match ON comparisons(match_id);
CREATE INDEX idx_comparisons_snapshot ON comparisons(odds_snapshot_id);
CREATE INDEX idx_comparisons_computed ON comparisons(computed_at DESC);

-- ============================================
-- KPI DAILY TABLE
-- ============================================
CREATE TABLE kpi_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  league VARCHAR(10) CHECK (league IN ('NFL', 'NCAAF', 'ALL')),
  book VARCHAR(50),
  coverage_rate DECIMAL(5,2),
  avg_abs_delta DECIMAL(4,2),
  median_abs_delta DECIMAL(4,2),
  p95_abs_delta DECIMAL(4,2),
  unmatched_count INTEGER,
  total_picks_count INTEGER,
  key_crossings_count INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, league, book)
);

CREATE INDEX idx_kpi_date ON kpi_daily(date DESC);
CREATE INDEX idx_kpi_league ON kpi_daily(league);
CREATE INDEX idx_kpi_book ON kpi_daily(book);

-- ============================================
-- ALIAS OVERRIDES TABLE
-- ============================================
CREATE TABLE alias_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league VARCHAR(10) NOT NULL CHECK (league IN ('NFL', 'NCAAF')),
  raw_name VARCHAR(200) NOT NULL,
  canonical_team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(league, raw_name)
);

CREATE INDEX idx_alias_overrides_league ON alias_overrides(league);
CREATE INDEX idx_alias_overrides_raw ON alias_overrides(raw_name);
CREATE INDEX idx_alias_overrides_active ON alias_overrides(is_active);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update trigger to tables with updated_at
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE teams IS 'Canonical team information with aliases';
COMMENT ON TABLE events IS 'Game events from odds providers';
COMMENT ON TABLE picks_rows IS 'Parsed picksheet data';
COMMENT ON TABLE odds_snapshots IS 'Point-in-time odds from various books';
COMMENT ON TABLE matches IS 'Links between picks and events with confidence scores';
COMMENT ON TABLE comparisons IS 'Computed deltas between picks and odds';
COMMENT ON TABLE kpi_daily IS 'Daily aggregated KPI metrics';
COMMENT ON TABLE alias_overrides IS 'Manual team name mappings';
COMMENT ON TABLE job_runs IS 'Track pipeline execution history';