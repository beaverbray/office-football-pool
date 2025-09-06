import { z } from 'zod'

// Key numbers in football betting
const KEY_NUMBERS = [3, 7, 10, 14] // Most common margins of victory

// Types for comparison data
export interface GameComparison {
  gameId: string
  homeTeam: string
  awayTeam: string
  gameTime: string
  league?: 'NFL' | 'NCAAF'
  picksheetSpread: number
  marketSpread: number
  spreadDelta: number // picksheet - market
  crossesKeyNumber: boolean
  keyNumbersCrossed: number[]
  favoriteFlipped: boolean // If favorite switched between picksheet and market
  confidence: number
  matched: boolean
}

export interface ComparisonKPIs {
  totalGames: number
  matchedGames: number
  unmatchedGames: number
  matchRate: number
  avgSpreadDelta: number
  medianSpreadDelta: number
  p95SpreadDelta: number // 95th percentile
  stdDevSpreadDelta: number
  keyNumberCrossings: number
  keyNumberCrossingRate: number
  favoriteFlips: number
  favoriteFlipRate: number
  largestDelta: {
    gameId: string
    teams: string
    delta: number
  } | null
  timestamp: string
}

export interface UnmatchedGame {
  source: 'picksheet' | 'market'
  gameInfo: string
  reason: string
  gameTime?: string // Added to track game time for filtering
}

export class ComparisonEngine {
  /**
   * Calculate spread delta between picksheet and market
   */
  private calculateSpreadDelta(picksheetSpread: number, marketSpread: number): number {
    return picksheetSpread - marketSpread
  }

  /**
   * Check if spread difference crosses key numbers
   */
  private checkKeyNumberCrossing(
    picksheetSpread: number, 
    marketSpread: number
  ): { crosses: boolean; numbers: number[] } {
    const crossedNumbers: number[] = []
    
    // Check each key number
    for (const keyNum of KEY_NUMBERS) {
      // Check positive key number
      if ((picksheetSpread > keyNum && marketSpread < keyNum) ||
          (picksheetSpread < keyNum && marketSpread > keyNum)) {
        crossedNumbers.push(keyNum)
      }
      
      // Check negative key number
      if ((picksheetSpread > -keyNum && marketSpread < -keyNum) ||
          (picksheetSpread < -keyNum && marketSpread > -keyNum)) {
        crossedNumbers.push(-keyNum)
      }
    }
    
    return {
      crosses: crossedNumbers.length > 0,
      numbers: crossedNumbers
    }
  }

  /**
   * Check if the favorite has flipped between picksheet and market
   */
  private checkFavoriteFlip(picksheetSpread: number, marketSpread: number): boolean {
    // If signs are different, favorite has flipped
    return (picksheetSpread > 0 && marketSpread < 0) || 
           (picksheetSpread < 0 && marketSpread > 0)
  }

  /**
   * Detect if teams are NFL or NCAAF based on names
   */
  private detectLeague(homeTeam: string, awayTeam: string): 'NFL' | 'NCAAF' | undefined {
    // List of known NFL teams
    const nflTeams = [
      'Cardinals', 'Falcons', 'Ravens', 'Bills', 'Panthers', 'Bears', 'Bengals', 
      'Browns', 'Cowboys', 'Broncos', 'Lions', 'Packers', 'Texans', 'Colts', 
      'Jaguars', 'Chiefs', 'Raiders', 'Chargers', 'Rams', 'Dolphins', 'Vikings', 
      'Patriots', 'Saints', 'Giants', 'Jets', 'Eagles', 'Steelers', '49ers', 
      'Seahawks', 'Buccaneers', 'Titans', 'Commanders', 'Washington'
    ]
    
    // Check if either team is an NFL team
    for (const nflTeam of nflTeams) {
      if (homeTeam.includes(nflTeam) || awayTeam.includes(nflTeam)) {
        return 'NFL'
      }
    }
    
    // Common NCAAF indicators - expanded list
    const ncaafIndicators = [
      'State', 'University', 'College', 'Tech', 'A&M', 
      'Central', 'Eastern', 'Western', 'Northern', 'Southern',
      'Carolina', 'Florida', 'Georgia', 'Alabama', 'Auburn',
      'Tennessee', 'Kentucky', 'Virginia', 'Michigan', 'Ohio',
      'Penn', 'Texas', 'Oklahoma', 'Kansas', 'Iowa', 'UCLA',
      'USC', 'Stanford', 'California', 'Oregon', 'Washington',
      'Arizona', 'Colorado', 'Utah', 'Nevada', 'Hawaii',
      'Louisiana', 'Mississippi', 'Arkansas', 'Missouri',
      'Illinois', 'Indiana', 'Wisconsin', 'Minnesota',
      'Nebraska', 'Purdue', 'Northwestern', 'Rutgers',
      'Maryland', 'Boston', 'Syracuse', 'Pittsburgh',
      'Duke', 'Wake Forest', 'NC State', 'Clemson',
      'Miami', 'FSU', 'UCF', 'USF', 'Temple', 'Navy',
      'Army', 'Air Force', 'Notre Dame', 'BYU', 'TCU',
      'Baylor', 'SMU', 'Houston', 'Rice', 'Tulane',
      'Memphis', 'Vanderbilt', 'Ole Miss', 'LSU'
    ]
    
    // Check for any NCAAF indicators
    for (const indicator of ncaafIndicators) {
      if (homeTeam.includes(indicator) || awayTeam.includes(indicator)) {
        return 'NCAAF'
      }
    }
    
    // If not identified as NFL and has any text, assume NCAAF
    // (since college has many more teams)
    return 'NCAAF'
  }

  /**
   * Compare a single game
   */
  compareGame(
    picksheetGame: {
      homeTeam: string
      awayTeam: string
      spread: number
      gameTime?: string
    },
    marketGame: {
      gameId: string
      homeTeam: string
      awayTeam: string
      homeSpread: number
      gameTime: string
      league?: 'NFL' | 'NCAAF'
    },
    matchConfidence: number = 1.0
  ): GameComparison {
    const spreadDelta = this.calculateSpreadDelta(
      picksheetGame.spread,
      marketGame.homeSpread
    )
    
    const keyNumberCheck = this.checkKeyNumberCrossing(
      picksheetGame.spread,
      marketGame.homeSpread
    )
    
    const favoriteFlipped = this.checkFavoriteFlip(
      picksheetGame.spread,
      marketGame.homeSpread
    )
    
    // Use league from market data if available, otherwise detect
    const league = marketGame.league || this.detectLeague(marketGame.homeTeam, marketGame.awayTeam)
    
    return {
      gameId: marketGame.gameId,
      homeTeam: marketGame.homeTeam,
      awayTeam: marketGame.awayTeam,
      gameTime: marketGame.gameTime,
      league,
      picksheetSpread: picksheetGame.spread,
      marketSpread: marketGame.homeSpread,
      spreadDelta,
      crossesKeyNumber: keyNumberCheck.crosses,
      keyNumbersCrossed: keyNumberCheck.numbers,
      favoriteFlipped,
      confidence: matchConfidence,
      matched: true
    }
  }

  /**
   * Compare multiple games and calculate KPIs
   */
  compareGames(
    picksheetGames: Array<{
      homeTeam: string
      awayTeam: string
      spread: number
      gameTime?: string
    }>,
    marketGames: Array<{
      gameId: string
      homeTeam: string
      awayTeam: string
      homeSpread: number
      gameTime: string
      league?: 'NFL' | 'NCAAF'
    }>,
    matches: Array<{
      picksheetIndex: number
      marketIndex: number
      confidence: number
    }>
  ): {
    comparisons: GameComparison[]
    kpis: ComparisonKPIs
    unmatched: UnmatchedGame[]
  } {
    const comparisons: GameComparison[] = []
    const unmatchedPicksheet = new Set(picksheetGames.map((_, i) => i))
    const unmatchedMarket = new Set(marketGames.map((_, i) => i))
    
    // Process matches
    for (const match of matches) {
      const picksheetGame = picksheetGames[match.picksheetIndex]
      const marketGame = marketGames[match.marketIndex]
      
      if (picksheetGame && marketGame) {
        comparisons.push(
          this.compareGame(picksheetGame, marketGame, match.confidence)
        )
        unmatchedPicksheet.delete(match.picksheetIndex)
        unmatchedMarket.delete(match.marketIndex)
      }
    }
    
    // Build unmatched list
    const unmatched: UnmatchedGame[] = []
    
    for (const idx of Array.from(unmatchedPicksheet)) {
      const game = picksheetGames[idx]
      unmatched.push({
        source: 'picksheet',
        gameInfo: `${game.awayTeam} @ ${game.homeTeam} (${game.spread})`,
        reason: 'No matching market game found',
        gameTime: game.gameTime
      })
    }
    
    for (const idx of Array.from(unmatchedMarket)) {
      const game = marketGames[idx]
      unmatched.push({
        source: 'market',
        gameInfo: `${game.awayTeam} @ ${game.homeTeam} (${game.homeSpread})`,
        reason: 'No matching picksheet game found',
        gameTime: game.gameTime
      })
    }
    
    // Calculate KPIs
    const kpis = this.calculateKPIs(
      comparisons,
      picksheetGames.length,
      unmatched.filter(u => u.source === 'picksheet').length
    )
    
    return { comparisons, kpis, unmatched }
  }

  /**
   * Calculate KPIs from comparisons
   */
  calculateKPIs(
    comparisons: GameComparison[],
    totalPicksheetGames: number,
    unmatchedPicksheetGames: number
  ): ComparisonKPIs {
    const matchedGames = comparisons.length
    const totalGames = totalPicksheetGames
    
    if (matchedGames === 0) {
      return {
        totalGames,
        matchedGames: 0,
        unmatchedGames: unmatchedPicksheetGames,
        matchRate: 0,
        avgSpreadDelta: 0,
        medianSpreadDelta: 0,
        p95SpreadDelta: 0,
        stdDevSpreadDelta: 0,
        keyNumberCrossings: 0,
        keyNumberCrossingRate: 0,
        favoriteFlips: 0,
        favoriteFlipRate: 0,
        largestDelta: null,
        timestamp: new Date().toISOString()
      }
    }
    
    // Extract deltas
    const deltas = comparisons.map(c => Math.abs(c.spreadDelta))
    
    // Calculate average
    const avgSpreadDelta = deltas.reduce((sum, d) => sum + d, 0) / deltas.length
    
    // Calculate median
    const sortedDeltas = [...deltas].sort((a, b) => a - b)
    const medianSpreadDelta = sortedDeltas[Math.floor(sortedDeltas.length / 2)]
    
    // Calculate 95th percentile
    const p95Index = Math.floor(sortedDeltas.length * 0.95)
    const p95SpreadDelta = sortedDeltas[Math.min(p95Index, sortedDeltas.length - 1)]
    
    // Calculate standard deviation
    const variance = deltas.reduce((sum, d) => sum + Math.pow(d - avgSpreadDelta, 2), 0) / deltas.length
    const stdDevSpreadDelta = Math.sqrt(variance)
    
    // Count key number crossings
    const keyNumberCrossings = comparisons.filter(c => c.crossesKeyNumber).length
    const keyNumberCrossingRate = keyNumberCrossings / matchedGames
    
    // Count favorite flips
    const favoriteFlips = comparisons.filter(c => c.favoriteFlipped).length
    const favoriteFlipRate = favoriteFlips / matchedGames
    
    // Find largest delta
    let largestDelta = null
    if (comparisons.length > 0) {
      const maxComparison = comparisons.reduce((max, c) => 
        Math.abs(c.spreadDelta) > Math.abs(max.spreadDelta) ? c : max
      )
      largestDelta = {
        gameId: maxComparison.gameId,
        teams: `${maxComparison.awayTeam} @ ${maxComparison.homeTeam}`,
        delta: maxComparison.spreadDelta
      }
    }
    
    return {
      totalGames,
      matchedGames,
      unmatchedGames: unmatchedPicksheetGames,
      matchRate: matchedGames / totalGames,
      avgSpreadDelta: Number(avgSpreadDelta.toFixed(2)),
      medianSpreadDelta: Number(medianSpreadDelta.toFixed(2)),
      p95SpreadDelta: Number(p95SpreadDelta.toFixed(2)),
      stdDevSpreadDelta: Number(stdDevSpreadDelta.toFixed(2)),
      keyNumberCrossings,
      keyNumberCrossingRate: Number(keyNumberCrossingRate.toFixed(3)),
      favoriteFlips,
      favoriteFlipRate: Number(favoriteFlipRate.toFixed(3)),
      largestDelta,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Format spread for display (e.g., "DAL -3.5" or "PHI +7")
   */
  static formatSpread(team: string, spread: number): string {
    if (spread === 0) return `${team} PK`
    const sign = spread > 0 ? '+' : ''
    return `${team} ${sign}${spread}`
  }

  /**
   * Get risk level based on spread delta
   */
  static getRiskLevel(delta: number): 'low' | 'medium' | 'high' | 'critical' {
    const absDelta = Math.abs(delta)
    if (absDelta <= 2) return 'low'
    if (absDelta <= 4) return 'medium'
    if (absDelta <= 7) return 'high'
    return 'critical'
  }

  /**
   * Get color class for risk level
   */
  static getRiskColor(riskLevel: string): string {
    switch (riskLevel) {
      case 'low': return 'text-green-600'
      case 'medium': return 'text-yellow-600'
      case 'high': return 'text-orange-600'
      case 'critical': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }
}

// Export singleton instance
export const comparisonEngine = new ComparisonEngine()