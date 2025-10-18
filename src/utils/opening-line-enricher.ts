/**
 * Opening Line Enricher - Stub implementation
 * Tracks and enriches game comparisons with opening line data
 */

export interface EnrichedGameComparison {
  gameId: string
  homeTeam: string
  awayTeam: string
  gameTime: string
  league: string
  picksheetSpread: number | null
  marketSpread: number | null
  spreadDelta: number | null
  crossesKeyNumber: boolean
  keyNumbersCrossed: number[]
  favoriteFlipped: boolean
  confidence: number
  openingSpread?: number | null
  lineMovement?: {
    marketSpread: number
    openingSpread: number
    movement: number
    direction: 'toward' | 'away' | 'none'
  }
  // Robust spread metric fields
  marketDeltaProb?: number
  importanceLevel?: 'minimal' | 'low' | 'moderate' | 'high' | 'very-high'
  outlierScore?: number
}

export class OpeningLineEnricher {
  /**
   * Enrich game comparisons with opening line data
   */
  static enrichGames(comparisons: any[]): EnrichedGameComparison[] {
    // Return comparisons as-is for now (stub implementation)
    return comparisons.map(comp => ({
      ...comp,
      openingSpread: comp.marketSpread, // Use market spread as placeholder
      lineMovement: undefined
    }))
  }

  /**
   * Record opening lines from comparisons
   */
  static recordOpeningLinesFromComparisons(comparisons: any[]): { recorded: number; skipped: number } {
    // Stub implementation - return counts
    return {
      recorded: 0,
      skipped: comparisons.length
    }
  }

  /**
   * Get color class for line movement
   */
  static getLineMovementColor(lineMovement: any): string {
    if (!lineMovement) return 'text-gray-500'

    if (lineMovement.direction === 'toward') {
      return 'text-green-400'
    } else if (lineMovement.direction === 'away') {
      return 'text-red-400'
    }

    return 'text-gray-500'
  }

  /**
   * Format line movement for display
   */
  static formatLineMovement(lineMovement: any): string {
    if (!lineMovement) return 'No data'

    const { movement, direction } = lineMovement
    if (direction === 'none') return 'No movement'

    const arrow = direction === 'toward' ? '→' : '←'
    return `${arrow} ${Math.abs(movement).toFixed(1)}`
  }
}
