# Pipeline Debugging Guide

## Overview

Comprehensive timing and debugging logs have been added throughout the pipeline to identify performance bottlenecks and track execution flow.

## Log Categories

### 🚀 [PIPELINE] - Pipeline Orchestrator
**Location:** `src/services/pipeline-orchestrator.ts`

**Logs:**
- Pipeline start/end with full timing breakdown
- Stage-by-stage progress tracking
- Final summary with time distribution

**Example Output:**
```
================================================================================
🚀 [PIPELINE] Starting pipeline pipeline_1234567890_abc123
================================================================================
⏱️  [SCHEDULE] Starting schedule load for week 10...
✅ [SCHEDULE] Loaded 82 games in 245ms
⏱️  [PARSING] Starting LLM picksheet parsing (text length: 15234, schedule games: 82)...
✅ [PARSING] Successfully parsed 63 games in 58432ms (avg: 928ms/game)
⏱️  [ODDS] Starting odds retrieval from API...
✅ [ODDS] Retrieved americanfootball_nfl odds in 1234ms
   • Total games: 28
   • Upcoming: 28
   • Filtered (live): 0
   • Cached for 30 minutes
⏱️  [ODDS] Starting odds retrieval from API...
✅ [ODDS] Retrieved americanfootball_ncaaf odds in 2145ms
   • Total games: 54
   • Upcoming: 54
   • Filtered (live): 0
   • Cached for 30 minutes

================================================================================
✅ [PIPELINE] Pipeline pipeline_1234567890_abc123 completed successfully
================================================================================
📊 Timing Breakdown:
   • Parsing:     58432ms
   • Odds:        3379ms
   • Matching:    456ms
   • Comparison:  234ms
   • TOTAL:       62501ms
================================================================================
```

### 🤖 [LLM-PARSER] - OpenAI Integration
**Location:** `src/services/llm-picksheet-parser.ts`

**Logs:**
- Input token estimation
- API call timing (critical bottleneck)
- Token usage breakdown
- Processing time vs API time

**Example Output:**
```
⏱️  [LLM-PARSER] Starting LLM parse
   • Text length: 15234 chars
   • Schedule games: 82
   • Using schedule context for enhanced matching
   • Estimated input tokens: ~3500 (system: ~1200, user: ~2300)
   • Sending request to OpenAI...
✅ [LLM-PARSER] OpenAI API call completed in 56789ms
   • Prompt tokens: 3456
   • Completion tokens: 2345
   • Total tokens: 5801
✅ [LLM-PARSER] Parsing completed successfully in 58432ms
   • Games parsed: 63 (NFL: 28, NCAAF: 35)
   • API call: 56789ms (97.2% of total)
   • Processing: 1643ms
```

### 📊 [ODDS-API] - Odds API Integration
**Location:** `src/services/odds-api.ts`

**Logs:**
- Cache hit/miss tracking
- Fetch timing per league
- Game filtering stats
- Cache duration info

**Example Output:**
```
⏱️  [ODDS-API] Fetching americanfootball_nfl odds...
✅ [ODDS-API] Fetched americanfootball_nfl odds in 1234ms
   • Total games: 28
   • Upcoming: 28
   • Filtered (live): 0
   • Cached for 30 minutes

✅ [ODDS-API] Cache hit for americanfootball_ncaaf (54 games)
```

### 📋 [JOB-QUEUE] - Async Job Management
**Location:** `src/services/job-queue.ts`

**Logs:**
- Job creation
- Job start/complete/fail events
- Total execution duration

**Example Output:**
```
📋 [JOB-QUEUE] Created job job_1234567890_xyz789
▶️  [JOB-QUEUE] Starting job job_1234567890_xyz789
✅ [JOB-QUEUE] Job job_1234567890_xyz789 completed in 62501ms
```

## Understanding the Logs

### Time Distribution Analysis

**Expected Breakdown (63 games):**
- **Parsing**: 50-60s (80-90% of total) - LLM API call is the main bottleneck
- **Odds Retrieval**: 2-4s (initial) or <100ms (cached)
- **Schedule Loading**: <500ms
- **Matching**: <1s
- **Comparison**: <500ms

**Total Expected Time:**
- First run (no cache): 60-80s
- Subsequent runs (with cache): 55-70s

### Identifying Bottlenecks

**1. Slow Parsing (>80s)**
- Check LLM-PARSER logs for API call duration
- Verify prompt token count (~1200-1500 expected)
- Check OpenAI API status

**2. Slow Odds Retrieval (>5s per league)**
- Check for cache hits (should be cached after first call)
- Verify Odds API status
- Check network latency

**3. Slow Matching (>3s)**
- Check number of games being matched
- Review entity resolution cache effectiveness

**4. Overall Slow Pipeline (>100s)**
- Review timing breakdown for unexpected delays
- Check for resource constraints
- Verify async job queue is working

## Log Filtering

### View Only Critical Logs
```bash
# In browser console or terminal
grep -E "\[PIPELINE\]|\[LLM-PARSER\]|\[ODDS-API\]" logs.txt
```

### View Timing Summary Only
```bash
grep "Timing Breakdown" logs.txt -A 6
```

### Track Specific Job
```bash
grep "job_1234567890_xyz789" logs.txt
```

## Performance Benchmarks

### Target Metrics
- **Initial API Response**: <500ms (job ID return)
- **LLM Parsing**: <60s for 63 games (~950ms/game)
- **Odds API**: <2s per league (first call), <100ms (cached)
- **Total Pipeline**: <80s (first run), <70s (subsequent)

### Red Flags
- ❌ Parsing >100s - OpenAI API issues or oversized prompt
- ❌ Odds API >10s - API issues or network problems
- ❌ Cache misses on subsequent runs - Cache TTL too short or server restart
- ❌ Job never completes - Check error logs for failures

## Testing Checklist

### 1. Verify Async Job Flow
- [ ] Job ID returned in <500ms
- [ ] Progress updates every second
- [ ] Final result delivered correctly

### 2. Verify Timing Logs
- [ ] All stages report timing
- [ ] LLM parser shows API vs processing time
- [ ] Odds API shows cache hits on second run
- [ ] Final summary shows breakdown

### 3. Verify Performance
- [ ] LLM parsing <60s for 63 games
- [ ] Odds API cached after first call
- [ ] Total pipeline <80s
- [ ] No memory leaks in job queue

### 4. Verify Error Handling
- [ ] Failed jobs show error logs
- [ ] Timing reported even on failure
- [ ] Graceful degradation on API errors

## Troubleshooting Common Issues

### Issue: LLM Parsing Taking >100s
**Check:**
1. System prompt size (should be ~1200-1500 tokens)
2. Schedule context size (should be reasonable)
3. OpenAI API status
4. Network latency

**Solution:**
- Verify prompt optimization was applied
- Check for API rate limiting
- Consider using faster model (gpt-3.5-turbo)

### Issue: Odds API Not Caching
**Check:**
1. Cache duration (should be 30min)
2. Server restarts clearing cache
3. Different request parameters

**Solution:**
- Verify CACHE_DURATION = 30 * 60 * 1000
- Implement persistent cache (Redis) for production

### Issue: Job Queue Memory Leak
**Check:**
1. Job queue size (max 100)
2. Cleanup on completion
3. TTL expiration (1 hour)

**Solution:**
- Verify cleanupOldJobs() is called
- Monitor job count over time
- Implement cleanup interval

## Production Monitoring

### Key Metrics to Track
1. **Average Pipeline Duration** - Should be 60-80s
2. **Cache Hit Rate** - Should be >90% after warmup
3. **Failed Job Rate** - Should be <5%
4. **Queue Size** - Should stay <20 jobs

### Alerting Thresholds
- ⚠️ Pipeline >120s
- ⚠️ Cache hit rate <70%
- ⚠️ Failed job rate >10%
- ⚠️ Queue size >50 jobs

### Dashboard Queries
```javascript
// Average pipeline duration (last 100 jobs)
const avgDuration = jobs
  .filter(j => j.status === 'completed')
  .slice(0, 100)
  .reduce((sum, j) => sum + (new Date(j.completedAt) - new Date(j.startedAt)), 0) / 100

// Cache hit rate
const cacheHits = logs.filter(l => l.includes('Cache hit')).length
const cacheMisses = logs.filter(l => l.includes('Fetching')).length
const hitRate = cacheHits / (cacheHits + cacheMisses)
```

## Next Steps

After collecting timing data:
1. Identify the slowest stage
2. Focus optimization efforts there first
3. Measure improvements
4. Iterate

Expected order of impact:
1. **LLM Parser** - Biggest bottleneck (50-60s)
2. **Odds API** - Second priority (2-4s initial)
3. **Everything else** - Minor optimizations (<2s total)
