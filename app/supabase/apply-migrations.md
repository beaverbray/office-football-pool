# How to Apply Database Migrations

The database tables need to be created in your Supabase project. Follow these steps:

## Option 1: Via Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard/project/eoslblqescncxcypkmvj/sql/new
2. Copy the entire contents of `supabase/migrations/001_initial_schema.sql`
3. Paste it into the SQL editor
4. Click "Run" button
5. Wait for success message
6. Copy the entire contents of `supabase/migrations/002_rls_policies.sql`
7. Paste it into the SQL editor
8. Click "Run" button
9. Copy the entire contents of `supabase/migrations/004_create_predictions_table.sql`
10. Paste it into the SQL editor
11. Click "Run" button
12. Copy the entire contents of `supabase/migrations/005_fix_predictions_rls_policy.sql`
13. Paste it into the SQL editor
14. Click "Run" button
15. Verify tables are created by going to Table Editor

## Option 2: Using Supabase CLI

First install the Supabase CLI:
```bash
npm install -g supabase
```

Then run:
```bash
supabase login
supabase link --project-ref eoslblqescncxcypkmvj
supabase db push
```

## Verification

After applying migrations, you should see these tables in your Supabase dashboard:
- teams
- events
- picks_rows
- odds_snapshots
- matches
- comparisons
- kpi_daily
- alias_overrides
- job_runs
- predictions (added in migration 004)

## Testing

Once migrations are applied, return to http://localhost:3001 and test the parser again.