# Pattern Detection Analysis

This document describes the pattern detection analysis system that identifies systematic patterns in pool vs market betting.

## Overview

The pattern analysis system analyzes:
- **Spread bias detection**: Identifies if pool consistently offers better/worse spreads than market
- **League-specific patterns**: Compares betting patterns between NFL and NCAAF
- **Key number behaviors**: Analyzes how key numbers (3, 7, 10, 14) influence betting outcomes
- **Historical spread bucket analysis**: Shows cover rates and margin distributions for different spread ranges

## Components

### 1. Analysis Script (`scripts/analyze-patterns.ts`)

Command-line tool for running comprehensive pattern analysis.

```bash
# Analyze all patterns
npm run analyze-patterns

# Analyze NFL only
npm run analyze-patterns:nfl

# Analyze NCAAF only
npm run analyze-patterns:ncaaf

# Save report to file
npx tsx scripts/analyze-patterns.ts --output=reports/patterns.json
```

### 2. API Endpoint (`/api/analysis/patterns`)

REST API for accessing pattern analysis programmatically.

```bash
# Get all patterns
GET /api/analysis/patterns

# Get NFL patterns only
GET /api/analysis/patterns?league=NFL

# Get specific analysis type
GET /api/analysis/patterns?type=spread_bias
GET /api/analysis/patterns?type=key_numbers
GET /api/analysis/patterns?type=historical
```

### 3. Pattern Analysis Service (`src/services/pattern-analysis.ts`)

TypeScript service with reusable analysis functions.

## Analysis Types

### Spread Bias Detection

Identifies systematic biases in pool vs market spreads.

**Metrics:**
- `bias_direction`: 'pool_favors_home' | 'pool_favors_away' | 'neutral'
- `avg_spread_difference`: Average difference between pool and market spreads
- `pool_win_rate`: Percentage of times pool pick covered
- `market_win_rate`: Percentage of times market pick covered
- `edge_rate`: Percentage of times pool had better spread

**Example Output:**
```json
{
  "overall": {
    "bias_direction": "neutral",
    "avg_spread_difference": 0.12,
    "sample_size": 450,
    "pool_win_rate": 0.48,
    "market_win_rate": 0.52,
    "edge_rate": 0.15
  },
  "by_league": {
    "NFL": { ... },
    "NCAAF": { ... }
  }
}
```

### League-Specific Patterns

Compares betting patterns between leagues.

**Metrics:**
- `total_games`: Number of games analyzed
- `avg_spread_diff`: Average spread difference
- `pool_cover_rate`: Pool pick cover rate
- `market_cover_rate`: Market pick cover rate
- `pool_edge_games`: Games where pool had edge
- `key_number_crossings`: Times key numbers were crossed

### Key Number Analysis

Analyzes how key numbers influence outcomes.

**NFL Key Numbers:** 3, 7, 10, 14, 4, 6
**NCAAF Key Numbers:** 3, 7, 14, 10, 4, 21

**Metrics:**
- `key_number`: The specific key number
- `occurrences`: How many times this number was crossed
- `pool_advantage_rate`: % of times pool had advantage when crossing this number
- `avg_edge_when_crossed`: Average edge in points when crossing

### Historical Spread Bucket Analysis

Analyzes cover rates and margins for different spread ranges.

**Spread Buckets:**
- Field Goal (±3)
- Small (3.5-7)
- Touchdown (7.5-10)
- Medium (10.5-14)
- Large (14.5+)

**Metrics:**
- `n_games`: Number of games in bucket
- `cover_rate`: Percentage of favorites that covered
- `mean_margin`: Average victory margin
- `std_margin`: Standard deviation of margin
- `median_margin`: Median victory margin

**Example Output:**
```
NFL - 3
  Games: 107
  Cover Rate: 37.4%
  Mean Margin: 3.4 ± 13.5
  Median Margin: 2.0
```

## Sample Script Output

```bash
$ npm run analyze-patterns:nfl

================================================================================
🔍 Pattern Detection Analysis Report
================================================================================

📊 Checking data availability...

Pool Picks: 598
Historical Games: 5273
Performance Analysis: 0

⚠️  No performance analysis data available yet.
   Run compute-performance-metrics.ts first to populate data.

📈 Analyzing historical spread buckets...

Spread Bucket Analysis:
================================================================================

NFL - 3
  Games: 107
  Cover Rate: 37.4%
  Mean Margin: 3.4 ± 13.5
  Median Margin: 2.0

📊 Analyzing pool pick spread distribution...

Pool Pick Spread Distribution:
============================================================
Field Goal (±3)        47 (33.6%)
Small (3.5-7)          61 (43.6%)
Touchdown (7.5-10)     22 (15.7%)
Medium (10.5-14)        7 (5.0%)
Large (14.5+)           3 (2.1%)

🔢 Analyzing key number frequency for NFL...

NFL Key Number Frequency:
==================================================
  3:   0 times (0.0%)
  7:   0 times (0.0%)
 10:   0 times (0.0%)
```

## Data Requirements

### Current Available Data

- ✅ **pool_picks** (598 records from 2025 season)
- ✅ **historical_games** (5,273 records from 2019-2023)
- ✅ **historical_spread_buckets** (382 pre-computed buckets)

### Required for Full Analysis

- ⏳ **pool_performance_analysis** (0 records currently)

The pool_performance_analysis table is populated by running:
```bash
npm run compute-performance-metrics
```

However, this requires temporal overlap between pool picks and historical games (currently pool picks are from 2025, historical games from 2019-2023).

## Performance Considerations

All queries are designed to execute in < 500ms:

- ✅ Historical spread bucket analysis: ~200ms
- ✅ Pool pick distribution: ~150ms
- ✅ Key number frequency: ~100ms
- ⏳ Spread bias analysis: < 500ms (when data available)
- ⏳ League pattern analysis: < 500ms (when data available)

## Insights & Use Cases

### 1. Identifying Pool Advantages

Find where pool consistently offers better spreads:
```bash
npm run analyze-patterns --output=reports/advantages.json
```

Look for:
- High edge_rate (> 20%)
- Positive avg_spread_difference in pool's favor
- Key number crossings that benefit pool

### 2. League Comparison

Compare NFL vs NCAAF patterns:
```bash
npm run analyze-patterns
```

Insights:
- Which league has tighter spreads?
- Which league shows more key number crossings?
- Which league has better pool edge?

### 3. Historical Benchmarking

Use historical spread buckets to benchmark pool picks:
```bash
npm run analyze-patterns:nfl
```

Compare pool pick distribution against historical cover rates to identify potential value.

### 4. Key Number Strategy

Identify which key numbers provide the most value:
```bash
npm run analyze-patterns --type=key_numbers
```

Use this to prioritize picks that cross valuable key numbers.

## Future Enhancements

- [ ] Real-time pattern detection as games complete
- [ ] Machine learning models to predict pattern changes
- [ ] Confidence intervals for all metrics
- [ ] Trend analysis (patterns over time)
- [ ] Automated alerts for significant pattern shifts
- [ ] Integration with odds fetcher for live pattern detection
- [ ] Correlation analysis between patterns and outcomes
- [ ] Visualization dashboards for pattern exploration
