# Odds Fetcher Service

The Odds Fetcher Service integrates with [The Odds API](https://the-odds-api.com/) to fetch live market odds for NFL and NCAAF games and store them in the database.

## Overview

The service consists of three main components:

1. **OddsAPIService** (`src/services/odds-api.ts`) - Low-level API client
2. **OddsFetcherService** (`src/services/odds-fetcher.ts`) - Database persistence layer
3. **Cron Script** (`scripts/fetch-odds-cron.ts`) - Periodic polling script

## Features

- ✅ Fetches odds for NFL and NCAAF
- ✅ Supports multiple markets (spreads, totals, moneylines)
- ✅ Rate limiting (1 second between requests)
- ✅ In-memory caching (30 minutes)
- ✅ Database persistence to `odds_snapshots` table
- ✅ Error handling and logging
- ✅ API usage monitoring
- ✅ Batch inserts for performance

## Configuration

### Required Environment Variables

```bash
# The Odds API key (get from https://the-odds-api.com/)
THE_ODDS_API_KEY=your-api-key-here

# Supabase configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Optional Configuration

In `src/services/odds-api.ts`, you can configure:

- `CACHE_DURATION` - How long to cache API responses (default: 30 minutes)
- `MIN_REQUEST_INTERVAL` - Minimum time between API requests (default: 1 second)

## Usage

### Manual Fetching via API

Trigger a manual odds fetch via HTTP:

```bash
# Fetch all odds (NFL + NCAAF)
curl -X POST http://localhost:3000/api/odds/fetch

# Fetch only NFL odds
curl -X POST http://localhost:3000/api/odds/fetch?sport=nfl

# Fetch only NCAAF odds
curl -X POST http://localhost:3000/api/odds/fetch?sport=ncaaf
```

### Programmatic Usage

```typescript
import { oddsFetcher } from '@/services/odds-fetcher'

// Fetch and store all odds
const result = await oddsFetcher.fetchAndStoreAllOdds()

// Fetch only NFL
const nflResult = await oddsFetcher.fetchAndStoreOdds('NFL')

// Get latest odds for an event
const odds = await oddsFetcher.getLatestOddsForEvent(eventId)

// Get odds history
const history = await oddsFetcher.getOddsHistory(
  'event-provider-key',
  'fanduel',
  'spread'
)
```

### Scheduled Polling with Cron

Run the cron script periodically using a task scheduler:

```bash
# Run manually
tsx scripts/fetch-odds-cron.ts

# Run for specific sport
tsx scripts/fetch-odds-cron.ts nfl
tsx scripts/fetch-odds-cron.ts ncaaf
```

#### Crontab Examples

```bash
# Fetch all odds every 30 minutes
*/30 * * * * cd /path/to/project && tsx scripts/fetch-odds-cron.ts >> logs/odds-fetch.log 2>&1

# Fetch NFL odds every hour during season (Sept-Feb)
0 * * 9-12,1-2 * cd /path/to/project && tsx scripts/fetch-odds-cron.ts nfl >> logs/nfl-odds.log 2>&1

# Fetch NCAAF odds every 2 hours during season (Aug-Jan)
0 */2 * 8-12,1 * cd /path/to/project && tsx scripts/fetch-odds-cron.ts ncaaf >> logs/ncaaf-odds.log 2>&1
```

## Database Schema

Odds are stored in the `odds_snapshots` table:

```sql
CREATE TABLE odds_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id),
  event_provider_key VARCHAR(100),
  book VARCHAR(50) NOT NULL,
  market VARCHAR(20) NOT NULL DEFAULT 'spread',
  home_spread DECIMAL(4,1),
  away_spread DECIMAL(4,1),
  home_ml INTEGER,
  away_ml INTEGER,
  total DECIMAL(5,1),
  over_price INTEGER,
  under_price INTEGER,
  prices JSONB DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Markets Supported

1. **Spreads** (`spreads`) - Point spreads for both teams
2. **Totals** (`totals`) - Over/under totals
3. **Moneylines** (`h2h`) - Head-to-head money lines

## Rate Limiting

The Odds API has rate limits based on your subscription tier:

- **Free tier**: 500 requests/month
- **Starter**: 10,000 requests/month
- **Pro**: 100,000 requests/month

The service:
- Enforces 1 second minimum between requests
- Monitors remaining requests via API headers
- Warns when < 100 requests remain
- Caches responses for 30 minutes to reduce API calls

## Error Handling

The service handles common errors:

- **401 Unauthorized**: Invalid API key
- **429 Rate Limit**: Too many requests
- **Network errors**: Logged and retried
- **Database errors**: Batch inserts continue on partial failures

## Monitoring

Check logs for:

```
✅ [ODDS-API] Fetched nfl odds in 1234ms
   • Total games: 16
   • Upcoming: 14
   • Filtered (live): 2
   • Cached for 30 minutes

API Usage - Used: 450, Remaining: 50

💾 [ODDS-FETCHER] Stored 168 snapshots, 0 errors
```

## Best Practices

### Polling Frequency

Recommended polling intervals based on game timing:

- **During games**: Every 5-10 minutes (lines move frequently)
- **Day before games**: Every 30-60 minutes
- **Days before games**: Every 2-4 hours
- **Off-season**: Disable or reduce to daily

### Cost Optimization

To minimize API requests:

1. Use longer cache durations during off-season
2. Poll less frequently for games far in the future
3. Only fetch markets you actually use
4. Filter to specific bookmakers if possible

### Data Cleanup

Consider periodic cleanup of old odds snapshots:

```sql
-- Delete odds older than 30 days
DELETE FROM odds_snapshots
WHERE fetched_at < NOW() - INTERVAL '30 days';

-- Or keep only the last N snapshots per event
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY event_provider_key, book, market
      ORDER BY fetched_at DESC
    ) as rn
  FROM odds_snapshots
)
DELETE FROM odds_snapshots
WHERE id IN (SELECT id FROM ranked WHERE rn > 10);
```

## Troubleshooting

### "Invalid API key" error

1. Check that `THE_ODDS_API_KEY` is set in `.env`
2. Verify the key at https://the-odds-api.com/
3. Ensure no extra spaces in the key

### "Rate limit exceeded" error

1. Check remaining requests: visit https://the-odds-api.com/account
2. Increase cache duration to reduce requests
3. Reduce polling frequency
4. Consider upgrading your API tier

### No odds being stored

1. Check database permissions (need service role key)
2. Verify `odds_snapshots` table exists
3. Check logs for SQL errors
4. Ensure event_provider_key format is correct

### Old odds being returned

1. Clear the cache: `OddsAPIService.clearCache()`
2. Force refresh: `GET /api/odds?refresh=true`
3. Check `fetched_at` timestamps in database

## Future Enhancements

- [ ] Automatic event linking by provider_event_id
- [ ] Smart polling (increase frequency near game time)
- [ ] Odds movement alerts
- [ ] Best line tracking across books
- [ ] Historical odds analysis
- [ ] Line shopping recommendations
