-- Create predictions table for storing scraped prediction data
CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source information
  source TEXT NOT NULL,  -- e.g., 'warren-nolan', 'nfelo', etc.

  -- Game identification
  game_time TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  game_date DATE NOT NULL,

  -- Prediction data
  predicted_winner TEXT NOT NULL CHECK (predicted_winner IN ('home', 'away')),
  win_probability NUMERIC(5,2) NOT NULL CHECK (win_probability >= 0 AND win_probability <= 100),
  confidence TEXT NOT NULL CHECK (confidence IN ('H', 'M', 'L')),
  spread NUMERIC(5,2) NOT NULL,
  over_under NUMERIC(5,2),

  -- Metadata
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_predictions_source ON predictions(source);
CREATE INDEX IF NOT EXISTS idx_predictions_game_date ON predictions(game_date);
CREATE INDEX IF NOT EXISTS idx_predictions_scraped_at ON predictions(scraped_at);
CREATE INDEX IF NOT EXISTS idx_predictions_teams ON predictions(home_team, away_team);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_predictions_updated_at
  BEFORE UPDATE ON predictions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access (predictions are public data)
CREATE POLICY "Allow anonymous read access to predictions"
  ON predictions
  FOR SELECT
  TO anon
  USING (true);

-- Allow authenticated users to read predictions
CREATE POLICY "Allow authenticated read access to predictions"
  ON predictions
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can insert/update/delete predictions
CREATE POLICY "Service role can manage predictions"
  ON predictions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add helpful comment
COMMENT ON TABLE predictions IS 'Stores prediction data from various sources (Warren Nolan, FiveThirtyEight, etc.)';
COMMENT ON COLUMN predictions.source IS 'Source of the prediction (e.g., warren-nolan, fivethirtyeight)';
COMMENT ON COLUMN predictions.confidence IS 'Confidence level: H (High), M (Medium), L (Low)';
COMMENT ON COLUMN predictions.win_probability IS 'Percentage probability of predicted winner (0-100)';
