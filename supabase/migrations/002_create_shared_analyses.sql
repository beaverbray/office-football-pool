-- Create table for shared analyses
CREATE TABLE IF NOT EXISTS shared_analyses (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    share_id TEXT UNIQUE NOT NULL,
    pipeline_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now() + interval '30 days'),
    view_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_shared_analyses_share_id ON shared_analyses(share_id);
CREATE INDEX IF NOT EXISTS idx_shared_analyses_expires_at ON shared_analyses(expires_at);

-- Add RLS (Row Level Security)
ALTER TABLE shared_analyses ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to read shared analyses (including anonymous users)
DROP POLICY IF EXISTS "Allow public read access" ON shared_analyses;
CREATE POLICY "Allow public read access" ON shared_analyses
    FOR SELECT USING (true);

-- Create policy to allow inserts through the API (including anonymous users)
DROP POLICY IF EXISTS "Allow public insert" ON shared_analyses;
CREATE POLICY "Allow public insert" ON shared_analyses
    FOR INSERT WITH CHECK (true);

-- Create policy to allow updates for view count (including anonymous users)
DROP POLICY IF EXISTS "Allow public update" ON shared_analyses;
CREATE POLICY "Allow public update" ON shared_analyses
    FOR UPDATE USING (true) WITH CHECK (true);

-- Optional: Create a function to clean up expired shares
CREATE OR REPLACE FUNCTION cleanup_expired_shares()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM shared_analyses WHERE expires_at < NOW();
END;
$$;

-- Optional: Set up a cron job to run cleanup daily (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-expired-shares', '0 0 * * *', 'SELECT cleanup_expired_shares();');