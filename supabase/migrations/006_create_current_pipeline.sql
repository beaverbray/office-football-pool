-- Drop existing table if it exists (to start fresh)
DROP TABLE IF EXISTS current_pipeline CASCADE;

-- Create current_pipeline table for storing the active pipeline data
-- This allows sharing of pipeline results via URL and persistence across sessions

CREATE TABLE current_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Pipeline data (entire result from /api/pipeline/run)
  pipeline_data JSONB NOT NULL,

  -- Original picksheet text for reference
  picksheet_text TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Only keep one current pipeline (we'll enforce this in application code)
  is_current BOOLEAN DEFAULT TRUE
);

-- Create index on is_current for faster lookups
CREATE INDEX idx_current_pipeline_is_current ON current_pipeline(is_current) WHERE is_current = true;

-- Create index on updated_at for sorting
CREATE INDEX idx_current_pipeline_updated_at ON current_pipeline(updated_at DESC);

-- Enable Row Level Security
ALTER TABLE current_pipeline ENABLE ROW LEVEL SECURITY;

-- Allow public read access (anyone can view the current pipeline)
CREATE POLICY "Public read access for current pipeline"
  ON current_pipeline
  FOR SELECT
  USING (true);

-- For now, no write policies (will be handled server-side with service role)
-- In the future, you could add policies for authenticated users to update

-- Add comments
COMMENT ON TABLE current_pipeline IS 'Stores the current active pipeline analysis for sharing and persistence';
COMMENT ON COLUMN current_pipeline.pipeline_data IS 'Complete pipeline result including parsing, odds, matching, and comparison data';
COMMENT ON COLUMN current_pipeline.picksheet_text IS 'Original picksheet text that was analyzed';
COMMENT ON COLUMN current_pipeline.is_current IS 'Flag to identify the current active pipeline (only one should be true)';
