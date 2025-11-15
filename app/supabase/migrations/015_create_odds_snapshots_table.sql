-- ============================================
-- CREATE ODDS SNAPSHOTS TABLE
-- ============================================
-- This migration creates the odds_snapshots table in the afbp schema
-- for storing live market odds from The Odds API

-- Create odds_snapshots table
CREATE TABLE IF NOT EXISTS afbp.odds_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID,
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_event_id ON afbp.odds_snapshots(event_id);
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_event_provider_key ON afbp.odds_snapshots(event_provider_key);
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_book ON afbp.odds_snapshots(book);
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_market ON afbp.odds_snapshots(market);
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_fetched ON afbp.odds_snapshots(fetched_at DESC);

-- Create composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_event_book_market
  ON afbp.odds_snapshots(event_provider_key, book, market, fetched_at DESC);

-- Add comment
COMMENT ON TABLE afbp.odds_snapshots IS 'Point-in-time odds snapshots from various bookmakers via The Odds API';

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS
ALTER TABLE afbp.odds_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to read odds (public data)
CREATE POLICY "Allow anonymous read access to odds_snapshots"
  ON afbp.odds_snapshots
  FOR SELECT
  TO anon
  USING (true);

-- Allow authenticated users to read odds
CREATE POLICY "Allow authenticated read access to odds_snapshots"
  ON afbp.odds_snapshots
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can insert/update/delete odds
CREATE POLICY "Allow service role full access to odds_snapshots"
  ON afbp.odds_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
