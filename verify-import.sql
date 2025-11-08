-- Verify the import
SELECT COUNT(*) as total FROM afbp.core_schedule;

-- Sample a few rows
SELECT * FROM afbp.core_schedule LIMIT 5;

-- Check league column specifically
SELECT league, COUNT(*) FROM afbp.core_schedule GROUP BY league;

-- Check if any data is actually there
SELECT
  match_number,
  week,
  home_team,
  away_team,
  league
FROM afbp.core_schedule
WHERE match_number IN (1, 2, 3, 4, 5)
ORDER BY match_number;
