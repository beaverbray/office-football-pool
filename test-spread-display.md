# Spread Display Logic Test

## Input from picksheet:
```
Marshall (2-2) +1.5    Sat 5:00 PM    UL LAFAYETTE (1-3) -1.5
```

## What this means:
- Marshall is AWAY team with +1.5 spread (underdog)
- UL LAFAYETTE is HOME team with -1.5 spread (favorite)

## In the display:
- Game shows as: "Marshall @ Louisiana Ragin Cajuns"
- POOL spread should show: -1.5 (home team's spread)
- This means Louisiana is favored by 1.5

## Current problem:
- Display is showing POOL: -1.5
- Display is showing MARKET: +1.5
- This suggests the market thinks Louisiana is the underdog, which contradicts the picksheet

## Possible issues:
1. The LLM might be parsing the teams incorrectly
2. The market data might have the teams swapped
3. The comparison logic might be matching the wrong teams
