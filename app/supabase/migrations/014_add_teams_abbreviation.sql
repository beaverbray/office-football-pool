-- ============================================
-- ADD TEAMS ABBREVIATION COLUMN
-- ============================================
-- Migration: 014_add_teams_abbreviation.sql
-- Purpose: Add dedicated abbreviation column to teams table
-- Requirement: Task 1.2 - "team ID, name, and abbreviation"
-- Issue: Currently using JSONB aliases array, reducing query efficiency
-- ============================================

-- ============================================
-- ADD ABBREVIATION COLUMN
-- ============================================

-- Add abbreviation column (nullable initially for existing data)
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS abbreviation VARCHAR(10);

-- ============================================
-- MIGRATE DATA FROM ALIASES
-- ============================================

-- For teams with aliases, use the first alias as abbreviation
-- This is a safe migration since abbreviations are typically the first alias
DO $$
DECLARE
  team_record RECORD;
  first_alias TEXT;
BEGIN
  FOR team_record IN
    SELECT id, aliases
    FROM teams
    WHERE abbreviation IS NULL
      AND aliases IS NOT NULL
      AND jsonb_array_length(aliases) > 0
  LOOP
    -- Extract first alias from JSONB array
    first_alias := team_record.aliases->0->>0;

    IF first_alias IS NOT NULL THEN
      UPDATE teams
      SET abbreviation = first_alias
      WHERE id = team_record.id;

      RAISE NOTICE 'Migrated abbreviation for team %: %', team_record.id, first_alias;
    END IF;
  END LOOP;

  RAISE NOTICE 'Abbreviation migration complete';
END $$;

-- ============================================
-- CREATE INDEXES
-- ============================================

-- Create unique index for league + abbreviation
-- This ensures no duplicate abbreviations within a league
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_league_abbr
  ON teams(league, abbreviation)
  WHERE abbreviation IS NOT NULL;

-- Create index for fast abbreviation lookups
CREATE INDEX IF NOT EXISTS idx_teams_abbreviation
  ON teams(abbreviation)
  WHERE abbreviation IS NOT NULL;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN teams.abbreviation IS
  'Official team abbreviation (e.g., "NE", "KC", "ALA", "OSU"). Unique per league.';

-- ============================================
-- VERIFICATION
-- ============================================

-- Display teams without abbreviations (should be addressed manually)
DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM teams
  WHERE abbreviation IS NULL;

  IF missing_count > 0 THEN
    RAISE WARNING 'Found % teams without abbreviations. Manual review needed:', missing_count;

    -- Show teams missing abbreviations
    FOR team_record IN
      SELECT league, name_canonical
      FROM teams
      WHERE abbreviation IS NULL
      LIMIT 10
    LOOP
      RAISE WARNING '  % - %', team_record.league, team_record.name_canonical;
    END LOOP;
  ELSE
    RAISE NOTICE 'All teams have abbreviations assigned ✓';
  END IF;
END $$;

-- Success message
SELECT 'Teams abbreviation column added successfully!' as message;
