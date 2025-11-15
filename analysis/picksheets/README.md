# Picksheet Files Directory

This directory stores weekly picksheet .txt files organized by season.

## Directory Structure

```
picksheets/
└── 2025/
    ├── week-01.txt
    ├── week-02.txt
    ├── week-18.txt
    └── ...
```

**Note**: Create additional year directories (2026, 2027, etc.) as needed.

## File Naming Convention

**Format**: `week-{number}.txt`

**Examples**:
- `week-01.txt` - Week 1 picksheet
- `week-02.txt` - Week 2 picksheet
- `week-18.txt` - Week 18 picksheet (final regular season)
- `wildcard.txt` - Wild Card playoff round
- `divisional.txt` - Divisional playoff round
- `conference.txt` - Conference championship games
- `superbowl.txt` - Super Bowl

## File Format

Each picksheet should contain:
- Week header (e.g., "NFL Week 1")
- Date information
- Game listings with:
  - Away team @ Home team
  - Spreads (with + or - signs)
  - Over/Under totals (optional)
  - Game times (optional)

### Example File Content

```
NFL Week 18
Sunday, January 5, 2025

Buffalo Bills @ New England Patriots -3.5 O/U 42.5
Dallas Cowboys vs Washington Commanders +7
Green Bay Packers @ Chicago Bears PK
Kansas City Chiefs vs Denver Broncos -10.5 O/U 48

Monday, January 6, 2025
Detroit Lions vs Minnesota Vikings -2.5 O/U 56.5

NCAAF Bowl Games
#11 Alabama (10-2) vs Michigan State (7-5) -14.5
#5 Georgia @ #12 Florida State (9-3) +21 O/U 55.5
```

## Usage

### Adding New Picksheet
1. Determine the season (e.g., 2025)
2. Determine the week number
3. Save file as `picksheets/{season}/week-{number}.txt`

Example:
```bash
# Save Week 1 of 2025 season
vim picksheets/2025/week-01.txt
```

### Processing Picksheets

The picksheet files can be processed using:
- `src/services/llm-picksheet-parser.ts` - AI-powered parser
- `src/services/picksheet-parser.ts` - Rule-based parser
- `scripts/extract-picksheet-spreads.ts` - Batch extraction tool

### Integration with Historical Data

Picksheet files serve two purposes:

1. **Current Season**: Parse and load picks for the active season
2. **Historical Validation**: Compare picksheet spreads against official API data
   - Identify discrepancies
   - Validate spread accuracy
   - Build multi-source spread database

## Data Sources

Picksheets complement official data sources:
- **NFL**: nfl_data_py library (authoritative spreads/scores)
- **NCAAF**: CFBD API (authoritative spreads/scores)
- **Picksheets**: Office pool source (may differ from closing lines)

## Notes

- Picksheet spreads may differ from closing lines
- Use picksheets for office pool, not necessarily betting decisions
- Official data sources are primary for historical analysis
- Discrepancies > 0.5 points should be flagged for review

## See Also

- `/HISTORICAL_DATA_RECONSTRUCTION_PLAN.md` - Overall data strategy
- `/gap_analysis/README.md` - Spread gap metrics analysis
- `/test-picksheet.txt` - Example picksheet format
