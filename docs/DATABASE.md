# Database Documentation

## Overview

The application uses Supabase (PostgreSQL) for data storage, organized into multiple schemas for different functional areas.

## Schemas

### Core Application (`public`)
- **teams**: NFL and NCAAF team information with abbreviations and aliases
- **schedule**: Game schedule with matchups and timing
- **picks**: User picks and selections
- **pipeline_current**: Current pipeline execution state (singleton pattern)
- **odds_snapshots**: Historical odds data snapshots

### Historical Data (`afbp`)
- **historical_games**: Archive of past games
- **historical_picks**: Archive of past picks
- **historical_odds**: Archive of historical betting odds

## Key Tables

### teams
Stores team information including:
- Team names (official, abbreviations, aliases)
- League affiliation (NFL/NCAAF)
- Used for entity resolution and matching

### schedule
Game schedule with:
- Home and away teams
- Game timing and week number
- Match identifiers for cross-referencing

### pipeline_current
Singleton table (single row) containing:
- Current pipeline state
- Latest odds snapshots
- Cached game matching results
- Uses RLS policies for security

### odds_snapshots
Historical odds tracking:
- Timestamp of odds capture
- Game identifiers
- Spread and odds values
- Used for trend analysis

## Migrations

Database migrations are managed through Supabase and stored in `supabase/migrations/`.

### Recent Migrations
- `013_fix_anon_rls_security_vulnerabilities.sql` - RLS policy fixes
- `014_add_teams_abbreviation.sql` - Team abbreviation support
- `015_create_odds_snapshots_table.sql` - Odds history tracking
- `20251115_create_afbp_historical_tables.sql` - Historical data schema
- `20251115_grant_service_role_permissions.sql` - Service role permissions

## Seed Data

Seed data is stored in `supabase/seed_data/`:
- `001_core_teams.sql` - Team data for NFL and NCAAF
- Future: Game schedules and test data

## Security

### Row Level Security (RLS)
All tables have RLS policies configured to:
- Allow anonymous read access for public data
- Restrict write access to authenticated users
- Grant full access to service role for backend operations

### Service Role
The service role has elevated permissions for:
- Pipeline operations
- Data migrations
- Batch updates

## Connection

### Development
Use the Supabase transaction pooler connection string:
```
postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### MCP Integration
Claude Code connects via MCP server configuration in `.mcp.json`:
- Read access to all tables
- Execute SQL queries
- Manage migrations

## Maintenance

### Running Migrations
```bash
npx supabase migration up
```

### Viewing Tables
Use MCP tools in Claude Code:
```
mcp__supabase__list_tables
```

### Querying Data
Use MCP tools in Claude Code:
```
mcp__supabase__execute_sql
```

## Best Practices

1. **Always use migrations** for schema changes
2. **Test RLS policies** before deploying
3. **Use service role** for backend operations
4. **Document schema changes** in migration files
5. **Maintain seed data** for consistent testing

## Troubleshooting

### Connection Issues
See [SETUP.md](./SETUP.md) for connection troubleshooting.

### Migration Failures
- Check migration syntax
- Verify permissions
- Review error logs in Supabase dashboard

### RLS Policy Issues
- Use service role for admin operations
- Test policies with anonymous role
- Review security advisors in Supabase
