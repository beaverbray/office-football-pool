-- ============================================================================
-- AFBP Core Teams Seed Data
-- ============================================================================
-- Purpose: Populate core_teams table with canonical team names and aliases
-- This enables name normalization across different data sources
-- ============================================================================

BEGIN;

-- ============================================================================
-- NFL TEAMS (32 teams)
-- ============================================================================

INSERT INTO afbp.core_teams (league, name_canonical, name_short, abbreviation, conference, division, aliases) VALUES
-- AFC East
('NFL', 'Buffalo Bills', 'Bills', 'BUF', 'AFC', 'East', '["Buffalo", "BUF"]'),
('NFL', 'Miami Dolphins', 'Dolphins', 'MIA', 'AFC', 'East', '["Miami", "MIA"]'),
('NFL', 'New England Patriots', 'Patriots', 'NE', 'AFC', 'East', '["New England", "NE", "Patriots"]'),
('NFL', 'New York Jets', 'Jets', 'NYJ', 'AFC', 'East', '["New York Jets", "NY Jets", "NYJ"]'),

-- AFC North
('NFL', 'Baltimore Ravens', 'Ravens', 'BAL', 'AFC', 'North', '["Baltimore", "BAL"]'),
('NFL', 'Cincinnati Bengals', 'Bengals', 'CIN', 'AFC', 'North', '["Cincinnati", "CIN"]'),
('NFL', 'Cleveland Browns', 'Browns', 'CLE', 'AFC', 'North', '["Cleveland", "CLE"]'),
('NFL', 'Pittsburgh Steelers', 'Steelers', 'PIT', 'AFC', 'North', '["Pittsburgh", "PIT"]'),

-- AFC South
('NFL', 'Houston Texans', 'Texans', 'HOU', 'AFC', 'South', '["Houston", "HOU"]'),
('NFL', 'Indianapolis Colts', 'Colts', 'IND', 'AFC', 'South', '["Indianapolis", "IND"]'),
('NFL', 'Jacksonville Jaguars', 'Jaguars', 'JAX', 'AFC', 'South', '["Jacksonville", "JAX"]'),
('NFL', 'Tennessee Titans', 'Titans', 'TEN', 'AFC', 'South', '["Tennessee", "TEN"]'),

-- AFC West
('NFL', 'Denver Broncos', 'Broncos', 'DEN', 'AFC', 'West', '["Denver", "DEN"]'),
('NFL', 'Kansas City Chiefs', 'Chiefs', 'KC', 'AFC', 'West', '["Kansas City", "KC", "KC Chiefs"]'),
('NFL', 'Las Vegas Raiders', 'Raiders', 'LV', 'AFC', 'West', '["Las Vegas", "LV", "Oakland", "OAK", "Raiders"]'),
('NFL', 'Los Angeles Chargers', 'Chargers', 'LAC', 'AFC', 'West', '["Los Angeles Chargers", "LA Chargers", "LAC", "San Diego", "SD"]'),

-- NFC East
('NFL', 'Dallas Cowboys', 'Cowboys', 'DAL', 'NFC', 'East', '["Dallas", "DAL"]'),
('NFL', 'New York Giants', 'Giants', 'NYG', 'NFC', 'East', '["New York Giants", "NY Giants", "NYG"]'),
('NFL', 'Philadelphia Eagles', 'Eagles', 'PHI', 'NFC', 'East', '["Philadelphia", "PHI"]'),
('NFL', 'Washington Commanders', 'Commanders', 'WAS', 'NFC', 'East', '["Washington", "WAS", "Washington Football Team", "Redskins"]'),

-- NFC North
('NFL', 'Chicago Bears', 'Bears', 'CHI', 'NFC', 'North', '["Chicago", "CHI"]'),
('NFL', 'Detroit Lions', 'Lions', 'DET', 'NFC', 'North', '["Detroit", "DET"]'),
('NFL', 'Green Bay Packers', 'Packers', 'GB', 'NFC', 'North', '["Green Bay", "GB"]'),
('NFL', 'Minnesota Vikings', 'Vikings', 'MIN', 'NFC', 'North', '["Minnesota", "MIN"]'),

-- NFC South
('NFL', 'Atlanta Falcons', 'Falcons', 'ATL', 'NFC', 'South', '["Atlanta", "ATL"]'),
('NFL', 'Carolina Panthers', 'Panthers', 'CAR', 'NFC', 'South', '["Carolina", "CAR"]'),
('NFL', 'New Orleans Saints', 'Saints', 'NO', 'NFC', 'South', '["New Orleans", "NO"]'),
('NFL', 'Tampa Bay Buccaneers', 'Buccaneers', 'TB', 'NFC', 'South', '["Tampa Bay", "TB", "Tampa"]'),

-- NFC West
('NFL', 'Arizona Cardinals', 'Cardinals', 'ARI', 'NFC', 'West', '["Arizona", "ARI"]'),
('NFL', 'Los Angeles Rams', 'Rams', 'LA', 'NFC', 'West', '["Los Angeles Rams", "LA Rams", "LA", "St. Louis", "STL"]'),
('NFL', 'San Francisco 49ers', '49ers', 'SF', 'NFC', 'West', '["San Francisco", "SF", "49ers"]'),
('NFL', 'Seattle Seahawks', 'Seahawks', 'SEA', 'NFC', 'West', '["Seattle", "SEA"]')

ON CONFLICT (league, name_canonical) DO NOTHING;

-- ============================================================================
-- NCAAF TEAMS (Top FBS teams commonly in picksheets)
-- ============================================================================

-- Power 5 Conferences + Notable Programs
INSERT INTO afbp.core_teams (league, name_canonical, name_short, abbreviation, conference, aliases) VALUES
-- SEC
('NCAAF', 'Alabama Crimson Tide', 'Alabama', 'ALA', 'SEC', '["Alabama", "Bama", "Crimson Tide", "ALA"]'),
('NCAAF', 'Auburn Tigers', 'Auburn', 'AUB', 'SEC', '["Auburn", "AUB"]'),
('NCAAF', 'Florida Gators', 'Florida', 'FLA', 'SEC', '["Florida", "FLA", "UF"]'),
('NCAAF', 'Georgia Bulldogs', 'Georgia', 'UGA', 'SEC', '["Georgia", "UGA", "Bulldogs"]'),
('NCAAF', 'LSU Tigers', 'LSU', 'LSU', 'SEC', '["LSU", "Louisiana State"]'),
('NCAAF', 'Ole Miss Rebels', 'Ole Miss', 'MISS', 'SEC', '["Ole Miss", "Mississippi", "MISS"]'),
('NCAAF', 'Tennessee Volunteers', 'Tennessee', 'TENN', 'SEC', '["Tennessee", "TENN", "Vols"]'),
('NCAAF', 'Texas A&M Aggies', 'Texas A&M', 'TAMU', 'SEC', '["Texas A&M", "TAMU", "A&M"]'),

-- Big Ten
('NCAAF', 'Michigan Wolverines', 'Michigan', 'MICH', 'Big Ten', '["Michigan", "MICH"]'),
('NCAAF', 'Ohio State Buckeyes', 'Ohio State', 'OSU', 'Big Ten', '["Ohio State", "OSU", "Ohio St.", "Buckeyes"]'),
('NCAAF', 'Penn State Nittany Lions', 'Penn State', 'PSU', 'Big Ten', '["Penn State", "PSU", "Penn St."]'),
('NCAAF', 'Wisconsin Badgers', 'Wisconsin', 'WISC', 'Big Ten', '["Wisconsin", "WISC"]'),
('NCAAF', 'Iowa Hawkeyes', 'Iowa', 'IOWA', 'Big Ten', '["Iowa", "IOWA"]'),
('NCAAF', 'Michigan State Spartans', 'Michigan State', 'MSU', 'Big Ten', '["Michigan State", "MSU", "Michigan St."]'),

-- Big 12
('NCAAF', 'Oklahoma Sooners', 'Oklahoma', 'OU', 'Big 12', '["Oklahoma", "OU", "Sooners"]'),
('NCAAF', 'Texas Longhorns', 'Texas', 'TEX', 'Big 12', '["Texas", "TEX", "Longhorns"]'),
('NCAAF', 'Oklahoma State Cowboys', 'Oklahoma State', 'OKST', 'Big 12', '["Oklahoma State", "OKST", "Oklahoma St."]'),
('NCAAF', 'Baylor Bears', 'Baylor', 'BAY', 'Big 12', '["Baylor", "BAY"]'),

-- ACC
('NCAAF', 'Clemson Tigers', 'Clemson', 'CLEM', 'ACC', '["Clemson", "CLEM"]'),
('NCAAF', 'Florida State Seminoles', 'Florida State', 'FSU', 'ACC', '["Florida State", "FSU", "Florida St."]'),
('NCAAF', 'Miami Hurricanes', 'Miami', 'MIA', 'ACC', '["Miami", "Miami (FL)", "MIA", "The U"]'),
('NCAAF', 'North Carolina Tar Heels', 'North Carolina', 'UNC', 'ACC', '["North Carolina", "UNC", "NC"]'),
('NCAAF', 'Virginia Tech Hokies', 'Virginia Tech', 'VT', 'ACC', '["Virginia Tech", "VT", "Va. Tech"]'),

-- Pac-12
('NCAAF', 'USC Trojans', 'USC', 'USC', 'Pac-12', '["USC", "Southern California"]'),
('NCAAF', 'Oregon Ducks', 'Oregon', 'ORE', 'Pac-12', '["Oregon", "ORE"]'),
('NCAAF', 'Washington Huskies', 'Washington', 'WASH', 'Pac-12', '["Washington", "WASH"]'),
('NCAAF', 'UCLA Bruins', 'UCLA', 'UCLA', 'Pac-12', '["UCLA"]'),
('NCAAF', 'Stanford Cardinal', 'Stanford', 'STAN', 'Pac-12', '["Stanford", "STAN"]'),

-- Other Notable
('NCAAF', 'Notre Dame Fighting Irish', 'Notre Dame', 'ND', 'Independent', '["Notre Dame", "ND"]'),
('NCAAF', 'BYU Cougars', 'BYU', 'BYU', 'Independent', '["BYU", "Brigham Young"]'),
('NCAAF', 'UCF Knights', 'UCF', 'UCF', 'Big 12', '["UCF", "Central Florida"]'),
('NCAAF', 'Cincinnati Bearcats', 'Cincinnati', 'CIN', 'Big 12', '["Cincinnati", "CIN"]'),
('NCAAF', 'Houston Cougars', 'Houston', 'HOU', 'Big 12', '["Houston", "HOU"]')

ON CONFLICT (league, name_canonical) DO NOTHING;

COMMIT;

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify teams were inserted:
-- SELECT league, COUNT(*) as team_count FROM afbp.core_teams GROUP BY league;
-- Expected: NFL = 32, NCAAF = ~35
