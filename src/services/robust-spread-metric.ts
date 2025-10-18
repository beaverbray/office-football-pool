/**
 * Robust NFL Spread Gap Metric
 *
 * Market-calibrated, smooth, monotone metric for measuring spread disagreement importance.
 * Based on empirical calibration with theoretical foundations and key number awareness.
 *
 * Ported from Python implementation in gap_analysis/robust_production_metric.py
 */

import { normalCDF, interp, clip } from '@/utils/math-helpers'

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface MetricConfig {
  sigma_base: number          // NFL historical standard deviation
  key_weight_3: number        // Additive weight for crossing 3
  key_weight_7: number        // Additive weight for crossing 7
  key_weight_other: number    // Weight for other keys
  isotonic_segments: number   // Segments for isotonic regression
  min_sample_size: number     // Min samples for empirical calibration
  outlier_percentile: number  // For outlier detection
  version: string
  created_at: string
}

export interface LandingRateTable {
  rates: Record<string, number>  // Key number -> landing probability
  season: string
  version: string
  n_games: number
  checksum: string
}

export interface CalibratorState {
  fitted: boolean
  calibration_map: Record<string, { mean: number; std: number; count: number }>
  x_knots: number[]  // Isotonic regression knots
  y_knots: number[]
}

export interface ModelData {
  config: MetricConfig
  landing_rates: LandingRateTable
  calibrator_state: CalibratorState
  outlier_threshold: number | null
}

export type ImportanceLevel = 'minimal' | 'low' | 'moderate' | 'high' | 'very-high'

// ============================================================================
// ROBUST SPREAD METRIC CLASS
// ============================================================================

export class RobustSpreadMetric {
  private static instance: RobustSpreadMetric | null = null

  private config: MetricConfig
  private landingRates: LandingRateTable
  private calibratorState: CalibratorState
  private outlierThreshold: number | null
  private metricsCache: Map<string, number>

  /**
   * Private constructor - use getInstance() to get singleton
   */
  private constructor(modelData: ModelData) {
    this.config = modelData.config
    this.landingRates = modelData.landing_rates
    this.calibratorState = modelData.calibrator_state
    this.outlierThreshold = modelData.outlier_threshold
    this.metricsCache = new Map()
  }

  /**
   * Get singleton instance (loads calibrated model or creates default)
   */
  static getInstance(): RobustSpreadMetric {
    if (!this.instance) {
      // Create default configuration (matches Python defaults)
      const defaultModel: ModelData = {
        config: {
          sigma_base: 13.45,
          key_weight_3: 0.02,
          key_weight_7: 0.015,
          key_weight_other: 0.005,
          isotonic_segments: 20,
          min_sample_size: 30,
          outlier_percentile: 99.5,
          version: '1.0.0',
          created_at: new Date().toISOString()
        },
        landing_rates: {
          rates: {
            '0': 0.008,
            '1': 0.052,
            '2': 0.038,
            '3': 0.154,
            '4': 0.065,
            '5': 0.035,
            '6': 0.068,
            '7': 0.109,
            '8': 0.048,
            '9': 0.032,
            '10': 0.074,
            '11': 0.045,
            '12': 0.028,
            '13': 0.041,
            '14': 0.058,
            '15': 0.022,
            '16': 0.018,
            '17': 0.035,
            '18': 0.015,
            '19': 0.012,
            '20': 0.020,
            '21': 0.025
          },
          season: 'historical',
          version: '1.0.0',
          n_games: 5000,
          checksum: 'default'
        },
        calibrator_state: {
          fitted: false,
          calibration_map: {},
          x_knots: [],
          y_knots: []
        },
        outlier_threshold: 0.05 // 5% is a reasonable outlier threshold
      }

      this.instance = new RobustSpreadMetric(defaultModel)
    }
    return this.instance
  }

  /**
   * Determine which key numbers are crossed between two spreads
   */
  private keysCrossed(s1: number, s2: number): number[] {
    const a = Math.abs(s1)
    const b = Math.abs(s2)
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)

    const keys: number[] = []
    const keyNumbers = [1, 3, 4, 6, 7, 10, 14, 17, 21]

    for (const k of keyNumbers) {
      // Check if key is crossed
      if (lo < k && k <= hi) {
        keys.push(k)
      }
      // Also check negative key
      if (lo < k && k <= hi) {
        keys.push(-k)
      }
    }

    return keys
  }

  /**
   * Compute raw (uncalibrated) metric value
   */
  private computeRawMetric(s1: number, s2: number): number {
    // Base: Normal approximation
    const z1 = Math.abs(s1) / this.config.sigma_base
    const z2 = Math.abs(s2) / this.config.sigma_base

    const p1 = 1 - normalCDF(z1)
    const p2 = 1 - normalCDF(z2)

    const baseDelta = Math.abs(p2 - p1)

    // Key adjustments (additive)
    let keyAdj = 0.0
    const crossedKeys = this.keysCrossed(s1, s2)

    for (const k of crossedKeys) {
      const absK = Math.abs(k)
      if (absK === 3) {
        keyAdj += this.config.key_weight_3
      } else if (absK === 7) {
        keyAdj += this.config.key_weight_7
      } else {
        keyAdj += this.config.key_weight_other
      }
    }

    return baseDelta + keyAdj
  }

  /**
   * Apply isotonic calibration to raw metric
   */
  private calibrate(rawValue: number): number {
    if (!this.calibratorState.fitted) {
      return rawValue
    }

    // Use isotonic regression via linear interpolation
    const xKnots = this.calibratorState.x_knots
    const yKnots = this.calibratorState.y_knots

    if (!xKnots || !yKnots || xKnots.length === 0) {
      return rawValue
    }

    return interp(rawValue, xKnots, yKnots)
  }

  /**
   * Compute calibrated market delta probability
   *
   * @param s1 First spread (home team perspective)
   * @param s2 Second spread (home team perspective)
   * @returns Calibrated probability change [0, 1]
   */
  marketDeltaProb(s1: number, s2: number): number {
    // Cache key (round to 0.1 for cache hits)
    const cacheKey = `${s1.toFixed(1)},${s2.toFixed(1)}`

    if (this.metricsCache.has(cacheKey)) {
      return this.metricsCache.get(cacheKey)!
    }

    // Compute raw metric
    const raw = this.computeRawMetric(s1, s2)

    // Apply calibration
    const calibrated = this.calibrate(raw)

    // Apply bounds [0, 1]
    const result = clip(calibrated, 0, 1)

    // Cache result
    this.metricsCache.set(cacheKey, result)

    return result
  }

  /**
   * Compute outlier score for unusual disagreements
   *
   * @param s1 First spread
   * @param s2 Second spread
   * @returns Outlier score (0-1 normal, >1 unusual, >2 extreme)
   */
  outlierScore(s1: number, s2: number): number {
    const raw = this.computeRawMetric(s1, s2)

    if (this.outlierThreshold && this.outlierThreshold > 0) {
      return raw / this.outlierThreshold
    } else {
      // Fallback: use gap size
      const gap = Math.abs(s2 - s1)
      return gap / 1.5 // 1.5 points is "normal" max disagreement
    }
  }

  /**
   * Get importance level classification
   *
   * @param deltaProb Market delta probability [0, 1]
   * @returns Importance level string
   */
  getImportanceLevel(deltaProb: number): ImportanceLevel {
    if (deltaProb < 0.01) return 'minimal'
    if (deltaProb < 0.02) return 'low'
    if (deltaProb < 0.04) return 'moderate'
    if (deltaProb < 0.08) return 'high'
    return 'very-high'
  }

  /**
   * Get human-readable interpretation
   */
  private interpretResult(delta: number, outlier: number): string {
    const importance =
      delta < 0.01
        ? 'minimal'
        : delta < 0.02
        ? 'low'
        : delta < 0.04
        ? 'moderate'
        : delta < 0.08
        ? 'high'
        : 'very high'

    const unusual =
      outlier < 1.5
        ? ''
        : outlier < 2.0
        ? ' (somewhat unusual)'
        : outlier < 3.0
        ? ' (very unusual)'
        : ' (extreme outlier)'

    return `${importance} importance${unusual}`
  }

  /**
   * Explain metric calculation with detailed breakdown
   *
   * @param s1 First spread
   * @param s2 Second spread
   * @returns Detailed explanation object
   */
  explain(s1: number, s2: number) {
    // Base calculation
    const z1 = Math.abs(s1) / this.config.sigma_base
    const z2 = Math.abs(s2) / this.config.sigma_base
    const p1 = 1 - normalCDF(z1)
    const p2 = 1 - normalCDF(z2)
    const baseDelta = Math.abs(p2 - p1)

    // Key analysis
    const keysCrossedList = this.keysCrossed(s1, s2)
    let keyAdj = 0.0
    const keyDetails: string[] = []

    for (const k of keysCrossedList) {
      const absK = Math.abs(k)
      if (absK === 3) {
        keyAdj += this.config.key_weight_3
        keyDetails.push(`Crossed 3 (+${this.config.key_weight_3.toFixed(3)})`)
      } else if (absK === 7) {
        keyAdj += this.config.key_weight_7
        keyDetails.push(`Crossed 7 (+${this.config.key_weight_7.toFixed(3)})`)
      } else {
        keyAdj += this.config.key_weight_other
        keyDetails.push(`Crossed ${absK} (+${this.config.key_weight_other.toFixed(3)})`)
      }
    }

    const rawTotal = baseDelta + keyAdj
    const calibrated = this.marketDeltaProb(s1, s2)
    const outlier = this.outlierScore(s1, s2)

    return {
      spreads: { s1, s2, gap: Math.abs(s2 - s1) },
      base_components: {
        p_cover_s1: p1,
        p_cover_s2: p2,
        base_delta: baseDelta,
      },
      key_adjustments: {
        keys_crossed: keysCrossedList.filter((k, i, arr) => arr.indexOf(k) === i), // unique
        total_adjustment: keyAdj,
        details: keyDetails,
      },
      final_metrics: {
        raw_metric: rawTotal,
        calibrated_delta: calibrated,
        outlier_score: outlier,
        is_outlier: outlier > 2.0,
      },
      interpretation: this.interpretResult(calibrated, outlier),
    }
  }

  /**
   * Clear the metrics cache (useful if model is updated)
   */
  clearCache(): void {
    this.metricsCache.clear()
  }
}

// Export singleton instance getter as default
export default RobustSpreadMetric.getInstance
