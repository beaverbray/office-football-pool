# AFBP Schema Migration Instructions

## Current Status
- **Old tables** in `public` schema still have all your data (1,151 schedule rows, 495 predictions, etc.)
- **New tables** in `afbp` schema exist but are EMPTY
- **Code** has been updated to use new `afbp.*` table names

## Migration Steps

### Step 1: Drop the Empty AFBP Schema

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor**
4. Copy and paste the contents of: `supabase/migrations/009_drop_afbp_schema.sql`
5. Click **Run**
6. You should see: "Found 6 tables in public schema (expected: 6)"

### Step 2: Run the Clean Migration

1. In the same SQL Editor
2. Copy and paste the contents of: `supabase/migrations/009_afbp_schema_migration.sql`
3. Click **Run**
4. This will:
   - Create the `afbp` schema
   - **MOVE** (not copy) your 6 tables from `public` to `afbp` and rename them
   - Drop 18 unused tables
   - Recreate all RLS policies
   - Set up permissions

### Step 3: Verify Migration

After running the migration, check the results:

```bash
curl http://localhost:3000/api/check-schema | jq .
```

You should see:
- **afbpSchema**: All tables showing row counts (not null)
- **publicSchema**: All old tables showing "NOT FOUND"
- **migrationStatus**: "COMPLETED - afbp schema exists"

### Step 4: Regenerate TypeScript Types

Once migration is successful:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/database.ts
```

Replace `YOUR_PROJECT_ID` with your actual Supabase project ID.

## What the Migration Does

### Tables Being Moved (6):
1. `public.schedule` → `afbp.core_schedule`
2. `public.current_pipeline` → `afbp.pipeline_current`
3. `public.predictions` → `afbp.analysis_predictions`
4. `public.shared_analyses` → `afbp.shared_analyses`
5. `public.job_runs` → `afbp.pipeline_job_runs`
6. `public.picks_rows` → `afbp.pipeline_picks_rows`

### Tables Being Dropped (18):
- Pool management tables (6): pools, pool_participants, pool_weeks, pool_games, pool_picks, raw_pool_games
- Team/Spread tables (6): teams, team_aliases, game_spreads, spread_history, spread_buckets, historical_games
- Market data tables (3): market_games, raw_market_games, dashboard_games
- Other (3): user_preferences, schema_version, etc.

## Rollback Plan

If something goes wrong, you can rollback by:

1. The old tables remain in `public` schema during migration
2. Only after successful verification are they dropped
3. If needed, you can manually restore from a Supabase backup

## Safety Notes

- ✅ Migration uses `ALTER TABLE ... SET SCHEMA` which **moves** tables (preserves data)
- ✅ All RLS policies are recreated
- ✅ Foreign key constraints are updated
- ✅ Permissions are granted
- ⚠️ **Make a backup** via Supabase Dashboard before running (recommended)

## Post-Migration Checklist

- [ ] Verify all afbp tables have data
- [ ] Verify old public tables are gone
- [ ] Test all API endpoints
- [ ] Regenerate TypeScript types
- [ ] Test frontend loads correctly
- [ ] Test picksheet processing
- [ ] Test predictions scraping
- [ ] Test sharing functionality

## Questions?

If you encounter any issues:
1. Check the SQL Editor error messages
2. Verify the verification queries at the end of the migration
3. Check Supabase logs for more details
