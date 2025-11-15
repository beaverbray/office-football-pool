-- ============================================
-- HISTORICAL GAMES TABLE
-- For storing historical game outcomes and spreads
-- Used for building empirical spread distribution models
-- ============================================

CREATE TABLE historical_games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id VARCHAR(50) NOT NULL,
  league VARCHAR(10) NOT NULL CHECK (league IN ('NFL', 'NCAAF')),
  season INTEGER NOT NULL,
  week INTEGER,
  game_date TIMESTAMPTZ,
  home_team VARCHAR(100),
  away_team VARCHAR(100),
  home_score INTEGER,
  away_score INTEGER,
  actual_margin DECIMAL(5,1),
  spread DECIMAL(4,1),
  favorite_covered BOOLEAN,
  conference_game BOOLEAN,
  neutral_site BOOLEAN,
  attendance INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league, game_id)
);

CREATE INDEX idx_historical_games_league ON historical_games(league);
CREATE INDEX idx_historical_games_season ON historical_games(season);
CREATE INDEX idx_historical_games_spread ON historical_games(spread);
CREATE INDEX idx_historical_games_margin ON historical_games(actual_margin);

COMMENT ON TABLE historical_games IS 'Historical game outcomes with spreads for building empirical probability models';

-- ============================================
-- SPREAD BUCKETS TABLE
-- Pre-computed statistics for spread buckets
-- Used for fast market-based gap metric lookups
-- ============================================

CREATE TABLE spread_buckets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league VARCHAR(10) NOT NULL CHECK (league IN ('NFL', 'NCAAF')),
  spread DECIMAL(4,1) NOT NULL,
  n_games INTEGER NOT NULL,
  cover_rate DECIMAL(5,4),
  mean_margin DECIMAL(5,2),
  std_margin DECIMAL(5,2),
  median_margin DECIMAL(5,2),
  p25_margin DECIMAL(5,2),
  p75_margin DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league, spread)
);

CREATE INDEX idx_spread_buckets_league ON spread_buckets(league);
CREATE INDEX idx_spread_buckets_spread ON spread_buckets(spread);

COMMENT ON TABLE spread_buckets IS 'Pre-computed spread bucket statistics for market-based gap metrics';

-- ============================================
-- AUTO-UPDATE TRIGGER
-- ============================================

CREATE TRIGGER update_spread_buckets_updated_at BEFORE UPDATE ON spread_buckets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
