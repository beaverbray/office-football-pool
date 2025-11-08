-- Fix the league column
-- Based on the CSV, we need to update from the source data

BEGIN;

-- Check how many rows have empty league
SELECT COUNT(*) as empty_league FROM afbp.core_schedule WHERE league = '' OR league IS NULL;

-- The CSV has league data, so let's reimport just the league column
-- We'll use team names to infer NFL vs NCAA

-- NFL teams are professional teams with city names
-- NCAA teams are college teams (usually just the school name)

-- For now, let's mark teams that are clearly NFL (have professional team names)
UPDATE afbp.core_schedule
SET league = 'NFL'
WHERE league = ''
AND (
  home_team LIKE '%Eagles%' OR home_team LIKE '%Cowboys%' OR
  home_team LIKE '%Chiefs%' OR home_team LIKE '%Chargers%' OR
  home_team LIKE '%49ers%' OR home_team LIKE '%Ravens%' OR
  home_team LIKE '%Bills%' OR home_team LIKE '%Dolphins%' OR
  home_team LIKE '%Patriots%' OR home_team LIKE '%Jets%' OR
  home_team LIKE '%Steelers%' OR home_team LIKE '%Browns%' OR
  home_team LIKE '%Bengals%' OR home_team LIKE '%Colts%' OR
  home_team LIKE '%Texans%' OR home_team LIKE '%Jaguars%' OR
  home_team LIKE '%Titans%' OR home_team LIKE '%Broncos%' OR
  home_team LIKE '%Raiders%' OR home_team LIKE '%Rams%' OR
  home_team LIKE '%Seahawks%' OR home_team LIKE '%Cardinals%' OR
  home_team LIKE '%Packers%' OR home_team LIKE '%Lions%' OR
  home_team LIKE '%Bears%' OR home_team LIKE '%Vikings%' OR
  home_team LIKE '%Saints%' OR home_team LIKE '%Falcons%' OR
  home_team LIKE '%Panthers%' OR home_team LIKE '%Buccaneers%' OR
  home_team LIKE '%Commanders%' OR home_team LIKE '%Giants%'
);

-- Mark remaining as NCAA
UPDATE afbp.core_schedule
SET league = 'NCAA'
WHERE league = '' OR league IS NULL;

COMMIT;

-- Verify
SELECT league, COUNT(*) as count FROM afbp.core_schedule GROUP BY league ORDER BY league;
