# Scripts Directory

TypeScript scripts for data loading, analysis, and performance metrics computation.

## Available Scripts

### 1. Historical Data Loading (`load-historical-data.ts`)

Load historical NFL and NCAAF game data from CSV files into the `historical_games` table.

**Purpose**: Populate the database with 5+ years of historical game outcomes and market spreads (2019-2023).

**Usage**:
```bash
# Load all historical data
npx tsx scripts/load-historical-data.ts

# Load only NFL games
npx tsx scripts/load-historical-data.ts --league=nfl

# Load only NCAAF games
npx tsx scripts/load-historical-data.ts --league=ncaaf

# Dry run (preview without inserting)
npx tsx scripts/load-historical-data.ts --dry-run
```

**Input Files**:
- `gap_analysis/nfl_games_historical.csv` - NFL games (1,327 games)
- `gap_analysis/ncaaf_games_historical.csv` - NCAAF games (3,946 games)

**Features**:
- Team name normalization and fuzzy matching
- Batch insertion (500 games per batch)
- Upsert with conflict resolution
- Handles nullable team_id fields
- Automatically generates spread bucket statistics

**Output**:
- Inserts into `afbp.historical_games`
- Generates `afbp.historical_spread_buckets`

---

### 2. Picksheet Processing (`load-picksheets.ts`)

Parse and load pool betting lines from picksheet text files.

**Purpose**: Extract pool spreads from weekly picksheets and store in `pool_picks` table.

**Usage**:
```bash
# Load all picksheets in picksheets/ directory
npx tsx scripts/load-picksheets.ts

# Load specific week
npx tsx scripts/load-picksheets.ts --week=1

# Dry run
npx tsx scripts/load-picksheets.ts --dry-run
```

**Input Files**: `picksheets/{season}/week-{number}.txt`

**Output**: Inserts into `afbp.pool_picks`

---

### 3. Performance Metrics Computation (`compute-performance-metrics.ts`)

Compare pool picks vs market spreads and outcomes to compute performance metrics.

**Purpose**: Analyze how pool picks performed compared to market spreads for completed games.

**Usage**:
```bash
# Compute performance metrics
npx tsx scripts/compute-performance-metrics.ts

# Dry run (preview without inserting)
npx tsx scripts/compute-performance-metrics.ts --dry-run
```

**How It Works**:

1. **Fetch Data**:
   - Pool picks with spreads from `pool_picks`
   - Historical games with outcomes from `historical_games`

2. **Match Games**:
   - Joins on: league, season, week, home_team, away_team
   - Uses normalized team name matching

3. **Compute Metrics**:
   - **Spread Difference**: `pool_spread - market_spread`
   - **Cover Outcomes**: Whether each pick covered the spread
   - **Pool Edge**: Whether pool had better spread
   - **Key Numbers Crossed**: Important margins (NFL: 3,7,10,14,4,6 | NCAAF: 3,7,14,10,4,21)
   - **Winner Determination**: Which pick(s) won
   - **Result Classification**: both_win, pool_only, market_only, both_lose

4. **Insert Results**:
   - Batch inserts into `afbp.pool_performance_analysis` (500 per batch)
   - Upserts on `pool_pick_id` conflict

**Current Status**: ⚠️ No matches found (expected)

Pool picks are from 2025 season (future games) while historical games are from 2019-2023 (past outcomes). The script will find matches when:
- Current 2025 season games complete and are added to `historical_games`
- Historical picksheets from 2019-2023 are loaded into `pool_picks`

**Example Output**:
```
📊 Performance Summary:
═══════════════════════════════════════════════════════════
Total Games Analyzed: 150

Win Rates:
  Pool Picks: 82/150 (54.7%)
  Market Picks: 78/150 (52.0%)

Result Distribution:
  Both Win: 45 (30.0%)
  Pool Only: 37 (24.7%)
  Market Only: 33 (22.0%)
  Both Lose: 35 (23.3%)

Spread Analysis:
  Avg Spread Difference: 1.2 points
  Games Crossing Key Numbers: 18 (12.0%)
═══════════════════════════════════════════════════════════
```

**Metrics Computed**:

| Field | Type | Description |
|-------|------|-------------|
| pool_pick_id | UUID | Reference to pool pick |
| historical_game_id | UUID | Reference to historical game |
| season, week, league | Integer/String | Game identifiers |
| pool_spread | Decimal | Pool betting line |
| market_spread | Decimal | Market closing line |
| spread_difference | Decimal | pool_spread - market_spread |
| actual_margin | Decimal | home_score - away_score |
| pool_pick_covered | Boolean | Did pool pick cover? |
| market_pick_covered | Boolean | Did market pick cover? |
| pool_had_edge | Boolean | Was pool spread better? |
| pool_edge_points | Decimal | Absolute spread difference |
| key_numbers_crossed | JSONB | Array of key numbers between spreads |
| pool_winner | Boolean | Did pool pick win? |
| market_winner | Boolean | Did market pick win? |
| result_type | String | Classification (both_win, pool_only, etc.) |

---

## Prerequisites

All scripts require:

1. **Environment Variables** (add to `.env` file):
   ```bash
   NEXT_PUBLIC_SUPABASE_URL="your_supabase_url"
   SUPABASE_SERVICE_KEY="your_supabase_service_role_key"
   ```

   **Where to find these:**
   - Go to Supabase Dashboard → Project Settings → API
   - `NEXT_PUBLIC_SUPABASE_URL`: Listed as "Project URL"
   - `SUPABASE_SERVICE_KEY`: Listed as "service_role" key under "Project API keys"

2. **Team Seed Data**: Ensure you've loaded the team normalization data:
   ```bash
   # Run this SQL in Supabase SQL Editor
   cat supabase/seed_data/001_core_teams.sql
   ```

3. **Migrations**: Ensure migrations have been applied:
   ```bash
   # Migration: supabase/migrations/20251115_create_afbp_historical_tables.sql
   ```

## Database Schema

Scripts interact with the `afbp` schema:

- `afbp.core_teams` - Team normalization and aliases
- `afbp.historical_games` - Historical outcomes & market spreads
- `afbp.historical_spread_buckets` - Pre-computed spread statistics
- `afbp.pool_picks` - Pool betting lines from picksheets
- `afbp.pool_performance_analysis` - **Performance metrics (output)**

## Team Name Normalization

The scripts use the `afbp.core_teams` table to normalize team names. If you see unmatched teams:

1. Check the team name in the CSV/picksheet
2. Add an alias to the appropriate team in `supabase/seed_data/001_core_teams.sql`
3. Re-run the seed data SQL
4. Re-run the loader

Example:
```sql
-- If "LA" is not matching "Los Angeles Rams"
UPDATE afbp.core_teams
SET aliases = aliases || '["LA"]'::jsonb
WHERE name_canonical = 'Los Angeles Rams';
```

## Workflow

Typical data loading and analysis workflow:

```bash
# 1. Load historical game outcomes (2019-2023)
npx tsx scripts/load-historical-data.ts

# 2. Load current season picksheets (2025)
npx tsx scripts/load-picksheets.ts

# 3. Compute performance metrics (when data overlaps)
npx tsx scripts/compute-performance-metrics.ts
```

## Troubleshooting

### "Missing required environment variables"
- Ensure your `.env` file has both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
- The service key is different from the anon key - it has elevated permissions

### "Unmatched teams" warnings
- Review the list of unmatched team names
- Add aliases to `001_core_teams.sql` for these teams
- Re-run the seed data in Supabase SQL Editor

### "Error inserting batch"
- Check Supabase logs for detailed error messages
- Verify the migration was applied successfully
- Ensure the service key has the correct permissions

### "No matches found" (performance metrics)
- Expected if pool picks are from future seasons (e.g., 2025)
- Expected if no historical picksheets from 2019-2023
- Script will work when data temporal overlap exists

## Development

### Adding New Scripts

1. Create `scripts/your-script-name.ts`
2. Add shebang: `#!/usr/bin/env tsx`
3. Import required dependencies
4. Load environment variables with dotenv
5. Create Supabase client with service role key
6. Document in this README

### Testing Scripts

Always test with `--dry-run` first:

```bash
npx tsx scripts/your-script.ts --dry-run
```

### Error Handling Conventions

All scripts follow:
- ✅ Success messages with emoji indicators
- ❌ Error messages with helpful context
- ⚠️  Warning messages for non-critical issues
- 📊 Summary statistics where applicable
- Exit code 1 on failure

## See Also

- `/HISTORICAL_DATA_RECONSTRUCTION_PLAN.md` - Overall data strategy
- `/gap_analysis/README.md` - Spread gap metrics analysis
- `/supabase/migrations/` - Database schema definitions
- `/picksheets/README.md` - Picksheet file format guide
