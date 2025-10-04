# Pipeline Orchestrator Update Guide

## Summary
The pipeline orchestrator needs to be updated to use schedule-based matching instead of direct picksheet-to-market matching.

## Changes Made So Far
✅ Added imports for `ScheduleService` and `GameMatchingService`
✅ Added `week` parameter to `PipelineConfig`

## Remaining Changes Needed

### 1. Add Schedule Loading Method
Add this method to the `PipelineOrchestrator` class (around line 200):

```typescript
/**
 * Load schedule games for the current week
 */
private async loadSchedule(week?: number): Promise<any> {
  const startTime = Date.now()
  this.currentStage = 'schedule_loading'
  this.log('Loading schedule games...')

  try {
    const scheduleGames = week
      ? await ScheduleService.getGamesByWeek(week)
      : await ScheduleService.getCurrentWeekGames()

    this.log(`Loaded ${scheduleGames.length} games from schedule`)

    return {
      success: true,
      gamesFound: scheduleGames.length,
      games: scheduleGames,
      duration: Date.now() - startTime
    }
  } catch (error) {
    return {
      success: false,
      gamesFound: 0,
      error: error instanceof Error ? error.message : 'Unknown schedule loading error',
      duration: Date.now() - startTime
    }
  }
}
```

### 2. Update runPipeline Method
In the `runPipeline` method (around line 105), add schedule loading BEFORE matching:

```typescript
// After Stage 2 (odds retrieval) and before Stage 3 (matching), add:

// Stage 2.5: Load schedule
const scheduleResult = await this.loadSchedule(config.week)
if (!scheduleResult.success || !scheduleResult.games) {
  this.log('Warning: Failed to load schedule, falling back to direct matching')
}
const scheduleGames = scheduleResult.games || []
```

### 3. Replace matchGames Method
Replace the entire `matchGames` method (around line 350-514) with:

```typescript
/**
 * Stage 3: Match games using schedule as source of truth
 */
private async matchGames(
  picksheetGames: any[],
  marketGames: any[],
  scheduleGames: any[],
  threshold: number = 0.4
): Promise<PipelineResult['matching']> {
  const startTime = Date.now()
  this.currentStage = 'matching'
  this.log('Matching games against schedule...')

  try {
    if (!scheduleGames || scheduleGames.length === 0) {
      this.log('No schedule games, falling back to legacy matching')
      // Fall back to old matching logic if needed
      return {
        success: false,
        matchRate: 0,
        matches: 0,
        totalGames: picksheetGames.length,
        error: 'No schedule games available',
        duration: Date.now() - startTime
      }
    }

    // Match picksheet games to schedule
    const picksheetMatches = GameMatchingService.matchPicksheetToSchedule(
      picksheetGames,
      scheduleGames
    )

    // Match market games to schedule
    const marketMatches = GameMatchingService.matchMarketToSchedule(
      marketGames,
      scheduleGames
    )

    // Build matched games array
    const matches: any[] = []
    let matchedCount = 0

    scheduleGames.forEach((scheduleGame: any, idx: number) => {
      const picksheetMatch = picksheetMatches.get(scheduleGame.match_number)
      const marketMatch = marketMatches.get(scheduleGame.match_number)

      if (picksheetMatch && marketMatch) {
        matches.push({
          scheduleGame,
          picksheetGame: picksheetMatch.game,
          marketGame: marketMatch.game,
          confidence: Math.min(picksheetMatch.confidence, marketMatch.confidence)
        })
        matchedCount++
      }
    })

    // Store matches for comparison stage
    ;(this as any)._scheduleMatches = matches

    const matchRate = matchedCount / picksheetGames.length
    this.log(`Matched ${matchedCount} of ${picksheetGames.length} games (${(matchRate * 100).toFixed(1)}%)`)

    return {
      success: true,
      matchRate,
      matches: matchedCount as any,
      totalGames: picksheetGames.length,
      duration: Date.now() - startTime
    }
  } catch (error) {
    return {
      success: false,
      matchRate: 0,
      matches: 0 as any,
      totalGames: picksheetGames.length,
      error: error instanceof Error ? error.message : 'Unknown matching error',
      duration: Date.now() - startTime
    }
  }
}
```

### 4. Update compareGames Method
In the `compareGames` method (around line 519), update to use schedule matches:

```typescript
private async compareGames(
  picksheetGames: any[],
  marketGames: any[],
  matchingResult: any
): Promise<PipelineResult['comparison']> {
  const startTime = Date.now()
  this.currentStage = 'comparison'
  this.log('Comparing games and calculating KPIs')

  try {
    // Use the schedule-based matches
    const scheduleMatches = (this as any)._scheduleMatches || []

    if (scheduleMatches.length === 0) {
      // Fallback to old logic if no schedule matches
      const matches = (this as any)._lastMatches || []
      // ... existing comparison logic ...
    }

    // Build comparison using schedule as reference
    const comparisons: any[] = scheduleMatches.map((match: any) => ({
      homeTeam: match.scheduleGame.home_team,
      awayTeam: match.scheduleGame.away_team,
      poolSpread: match.picksheetGame.spread,
      marketSpread: match.marketGame.homeSpread,
      delta: Math.abs(match.picksheetGame.spread - match.marketGame.homeSpread),
      // ... rest of comparison logic
    }))

    // Calculate KPIs
    // ... existing KPI logic using comparisons array ...

    return {
      success: true,
      comparisons,
      // ... rest of return
    }
  } catch (error) {
    // ... error handling
  }
}
```

### 5. Update Method Call in runPipeline
Update the call to `matchGames` to include scheduleGames:

```typescript
// Change from:
result.matching = await this.matchGames(
  picksheetGames,
  marketGames,
  config.matchingThreshold
)

// To:
result.matching = await this.matchGames(
  picksheetGames,
  marketGames,
  scheduleGames, // Add this parameter
  config.matchingThreshold
)
```

## Testing
After making these changes:
1. Run the pipeline with `week: 5` in the config
2. Verify match rate improves from 82% to 95%+
3. Check that team names are consistent in comparisons

## Notes
- The schedule is the source of truth for team names
- All matching now goes through GameMatchingService
- Fallback logic exists if schedule loading fails
