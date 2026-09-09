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
   * Pass comparisons through unchanged.
   *
   * `openingSpread` is now attached server-side in /api/refresh-all from
   * afbp.odds_snapshots, so there is nothing to enrich here. This previously
   * fabricated the field from `comp.marketSpread` as a "placeholder", which put
   * the current line on screen labelled as the opening one.
   */
  static enrichGames(comparisons: any[]): EnrichedGameComparison[] {
    return comparisons as EnrichedGameComparison[]
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
