-- Drop table if it exists to start fresh
DROP TABLE IF EXISTS current_pipeline CASCADE;

-- Create table for current pipeline state
-- This table stores the most recent pipeline analysis
-- Uses a singleton pattern with id = 'current'
CREATE TABLE current_pipeline (
    id TEXT PRIMARY KEY,
    pipeline_data JSONB NOT NULL,
    picksheet_text TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT single_row_check CHECK (id = 'current')
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_current_pipeline_updated_at ON current_pipeline(updated_at);

-- Add RLS (Row Level Security)
ALTER TABLE current_pipeline ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to read the current pipeline
CREATE POLICY "Allow public read access" ON current_pipeline
    FOR SELECT USING (true);

-- Create policy to allow inserts/updates through the API
CREATE POLICY "Allow public upsert" ON current_pipeline
    FOR ALL WITH CHECK (id = 'current');
