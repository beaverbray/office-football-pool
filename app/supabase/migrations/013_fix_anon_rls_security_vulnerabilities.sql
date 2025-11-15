-- ============================================
-- FIX CRITICAL RLS SECURITY VULNERABILITIES
-- ============================================
-- Migration: 013_fix_anon_rls_security_vulnerabilities.sql
-- Purpose: Remove dangerous anon policies that allow DELETE operations
-- Issue: Migration 003 created overly permissive anon policies (FOR ALL)
--        allowing anonymous users to DELETE all data in job_runs and picks_rows
-- Fix: Drop dangerous policies and replace with read-only policies
-- ============================================

-- ============================================
-- DROP DANGEROUS ANON POLICIES
-- ============================================

-- Drop overly permissive job_runs anon policy
DROP POLICY IF EXISTS "Anon users can create and read job_runs" ON job_runs;

-- Drop overly permissive picks_rows anon policy
DROP POLICY IF EXISTS "Anon users can create and read picks_rows" ON picks_rows;

-- ============================================
-- CREATE SAFE ANON POLICIES (READ-ONLY)
-- ============================================

-- Allow anonymous users to read job_runs (for public status display)
-- This is safe - read-only access, no INSERT/UPDATE/DELETE
CREATE POLICY "Anonymous users can read job_runs" ON job_runs
  FOR SELECT TO anon USING (true);

-- Allow anonymous users to read picks_rows (for public picks display)
-- This is safe - read-only access, no INSERT/UPDATE/DELETE
CREATE POLICY "Anonymous users can read picks_rows" ON picks_rows
  FOR SELECT TO anon USING (true);

-- ============================================
-- SECURITY VERIFICATION
-- ============================================

-- Verify no anon policies allow DELETE or UPDATE
DO $$
DECLARE
  dangerous_policy RECORD;
BEGIN
  -- Check for any anon policies that aren't SELECT-only
  FOR dangerous_policy IN
    SELECT schemaname, tablename, policyname, cmd
    FROM pg_policies
    WHERE roles @> ARRAY['anon']
      AND cmd != 'SELECT'
      AND schemaname = 'public'
  LOOP
    RAISE WARNING 'Found non-SELECT anon policy: %.% - % (%)',
      dangerous_policy.schemaname,
      dangerous_policy.tablename,
      dangerous_policy.policyname,
      dangerous_policy.cmd;
  END LOOP;

  RAISE NOTICE 'Security verification complete. Check warnings above for any remaining issues.';
END $$;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON POLICY "Anonymous users can read job_runs" ON job_runs
  IS 'Public read-only access for status display. No write permissions.';

COMMENT ON POLICY "Anonymous users can read picks_rows" ON picks_rows
  IS 'Public read-only access for picks display. No write permissions.';

-- Success message
SELECT 'Critical RLS security vulnerabilities fixed! Anon users can no longer DELETE data.' as message;
