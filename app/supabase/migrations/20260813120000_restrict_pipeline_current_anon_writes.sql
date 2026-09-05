-- Restrict afbp.pipeline_current writes to service_role
--
-- Context (verified live against the production project 2026-08-13):
--   012_fix_pipeline_current_permissions.sql granted `GRANT ALL ON afbp.pipeline_current TO anon`
--   and created a `FOR ALL TO anon, authenticated, service_role USING (id = 'current')` policy.
--   That means anyone holding the public NEXT_PUBLIC_SUPABASE_ANON_KEY (shipped in the browser
--   bundle) can INSERT/UPDATE/DELETE the singleton pipeline row directly via the PostgREST API,
--   bypassing the Next.js app entirely. Confirmed live: an UPDATE against a non-matching id
--   returned 204 (permitted), and `GRANT ALL ... TO anon` is present in migration 012.
--
--   afbp.shared_analyses is NOT affected by this issue -- 009_afbp_schema_migration.sql already
--   restricts its writes to `service_role` only (`GRANT SELECT ON afbp.shared_analyses TO anon`),
--   confirmed live (anon INSERT attempt returns 42501 "new row violates row-level security policy").
--
-- Fix: keep public SELECT (the dashboard reads this via the anon-key client), but require
-- service_role for INSERT/UPDATE/DELETE. The app's own write paths
-- (app/src/app/api/pipeline/save, pipeline/refresh, refresh-all) are updated in the same change
-- to use the service-role client (supabaseAdmin) instead of the anon client for these writes.

BEGIN;

-- Revoke the blanket anon/authenticated grant from 012
REVOKE ALL ON afbp.pipeline_current FROM anon;
REVOKE ALL ON afbp.pipeline_current FROM authenticated;
GRANT SELECT ON afbp.pipeline_current TO anon;
GRANT SELECT ON afbp.pipeline_current TO authenticated;

-- Drop the overly broad policy from 012
DROP POLICY IF EXISTS "Enable all access for singleton row" ON afbp.pipeline_current;

-- Public read-only access (dashboard reads the singleton via the anon-key client)
CREATE POLICY "pipeline_current_public_read"
  ON afbp.pipeline_current
  FOR SELECT
  USING (true);

-- Only the service role (server-side, never shipped to the browser) may write
CREATE POLICY "pipeline_current_service_role_write"
  ON afbp.pipeline_current
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;

-- Verify: no anon/authenticated policy should permit INSERT/UPDATE/DELETE afterward
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'afbp' AND tablename = 'pipeline_current';
