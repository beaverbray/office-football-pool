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
  // sigma and key weights now live in LEAGUE_MODELS, per league and measured.
  // They were single NFL-only scalars applied to every league.
  isotonic_segments: number   // Segments for isotonic regression
  min_sample_size: number     // Min samples for empirical calibration
  outlier_percentile: number  // For outlier detection
  version: string
  created_at: string
}

export interface CalibratorState {
  fitted: boolean
  calibration_map: Record<string, { mean: number; std: number; count: number }>
  x_knots: number[]  // Isotonic regression knots
  y_knots: number[]
}

export interface ModelData {
  config: MetricConfig
  calibrator_state: CalibratorState
  outlier_threshold: number | null
}

export type ImportanceLevel = 'minimal' | 'low' | 'moderate' | 'high' | 'very-high'

/**
 * NFL margin-of-victory key numbers, ascending. 3 and 7 carry by far the most
 * mass, which is why they get their own weights in computeRawMetric.
 */
const KEY_NUMBERS = [1, 3, 4, 6, 7, 10, 14, 17, 21] as const

// ============================================================================
// ROBUST SPREAD METRIC CLASS
// ============================================================================

export type MetricLeague = 'NFL' | 'NCAAF'

/**
 * Per-league margin model, measured from afbp.historical_games on 2026-09-09.
 *
 * `sigma` is the standard deviation of final margins; `landing` is the share of
 * games whose margin lands exactly on each key number.
 *
 *   NFL    n=1327   sigma 14.30 measured
 *   NCAAF  n=3946   sigma 22.30 measured
 *
 * NFL keeps the reference's 13.45 rather than the measured 14.30: the two agree
 * to 6% on a 1327-game sample, and holding it preserves parity with the Python
 * (analysis/gap_analysis/robust_production_metric.py:34) that every existing
 * NFL number came from. NCAAF gets its own value because 13.45 is not close —
 * college margins are 66% more dispersed, so every college probability computed
 * against the NFL sigma was systematically overstated, and college is 49 of the
 * 65 games on a typical board.
 */
export const LEAGUE_MODELS: Record<MetricLeague, { sigma: number; landing: Record<number, number> }> = {
  NFL: {
    sigma: 13.45,
    landing: { 1: 0.0452, 3: 0.1394, 4: 0.0528, 6: 0.0678, 7: 0.0829, 10: 0.0535, 14: 0.0535, 17: 0.0354, 21: 0.0196 }
  },
  NCAAF: {
    sigma: 22.30,
    landing: { 1: 0.0274, 3: 0.1014, 4: 0.0327, 6: 0.0317, 7: 0.0796, 10: 0.0421, 14: 0.0411, 17: 0.0362, 21: 0.0360 }
  }
}

/** Standard normal density. */
function normalPdf(z: number): number {
  return Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI)
}

/**
 * Extra probability moved by crossing key number `k`, beyond what the smooth
 * normal term already accounts for.
 *
 * Derived rather than hardcoded, which is what finally makes the landing-rate
 * table load-bearing — it was previously assigned in the constructor and never
 * read, so the three key_weight_* constants floated free of the distribution
 * sitting beside them.
 *
 * Excess mass is halved because a half-point move converts pushes, not wins:
 * at -3 a 3-point margin pushes, at -3.5 it loses, at -2.5 it covers. Scoring
 * a push as half a win makes the cover probability shift by half the mass.
 *
 * The derivation reproduces the old `key_weight_other` of 0.005 at NFL keys 1
 * and 21 and NCAAF key 1, which is evidence it matches the original intent.
 * It disagrees sharply at the keys that matter: NFL 3 is 0.055 against a
 * hardcoded 0.02, and NFL 7 is 0.029 against 0.015.
 */
export function keyWeight(k: number, league: MetricLeague): number {
  const model = LEAGUE_MODELS[league]
  const actual = model.landing[k] ?? 0
  const predictedByNormal = normalPdf(k / model.sigma) / model.sigma
  return Math.max(0, actual - predictedByNormal) / 2
}

export class RobustSpreadMetric {
  private static instance: RobustSpreadMetric | null = null

  private config: MetricConfig
  private calibratorState: CalibratorState
  private outlierThreshold: number | null
  private metricsCache: Map<string, number>

  /**
   * Private constructor - use getInstance() to get singleton
   */
  private constructor(modelData: ModelData) {
    this.config = modelData.config
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
          isotonic_segments: 20,
          min_sample_size: 30,
          outlier_percentile: 99.5,
          version: '1.0.0',
          created_at: new Date().toISOString()
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
    const lo = Math.min(Math.abs(s1), Math.abs(s2))
    const hi = Math.max(Math.abs(s1), Math.abs(s2))

    // Identical lines move no probability mass.
    if (lo === hi) return []

    // Closed interval on BOTH ends. This DEVIATES from the Python reference
    // (analysis/gap_analysis/robust_production_metric.py:190, `lo < k <= hi`),
    // which has the same flaw: half-open means a line resting exactly on a key
    // counts only when the key is the upper bound. Live, that made two
    // equivalent half-point moves differ ~4x — 3 -> 2.5 scored 5.45% while
    // 3 -> 3.5 scored 1.44% — though both change the outcome for the 15.4% of
    // margins that land on exactly 3 (measured; see LEAGUE_MODELS):
    // push becomes cover going down, push becomes loss going up.
    //
    // Caveat for any future fitted calibrator: it must be fitted against raw
    // values produced by THIS rule. The one that used to ship
    // (src/data/robust-metric-model.json) was fitted against the half-open
    // version — and was in any case a truncated, unparseable 1036-byte file
    // whose calibration_map schema did not match what calibrate() reads, so it
    // could never have loaded. Deleted rather than left looking authoritative.
    //
    // Each key is returned ONCE, matching the reference (which appends once).
    // The double push was a porting error: two `if` blocks with identical
    // conditions, the second labelled "also check
    // negative key" though it computed no negative and operated on absolute
    // values where sign is meaningless. Every key adjustment in
    // computeRawMetric was therefore applied double.
    return KEY_NUMBERS.filter(k => lo <= k && k <= hi)
  }

  /**
   * Compute raw (uncalibrated) metric value for a league's margin distribution.
   */
  private computeRawMetric(s1: number, s2: number, league: MetricLeague): number {
    const sigma = LEAGUE_MODELS[league].sigma

    // Base: normal approximation of the mass between the two lines.
    const p1 = 1 - normalCDF(Math.abs(s1) / sigma)
    const p2 = 1 - normalCDF(Math.abs(s2) / sigma)
    const baseDelta = Math.abs(p2 - p1)

    // Key adjustments (additive), derived from that league's landing rates.
    let keyAdj = 0
    for (const k of this.keysCrossed(s1, s2)) {
      keyAdj += keyWeight(k, league)
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
  marketDeltaProb(s1: number, s2: number, league: MetricLeague = 'NFL'): number {
    // Cache key (round to 0.1 for cache hits). League is part of the key: the
    // same pair of spreads scores differently in each league.
    const cacheKey = `${league},${s1.toFixed(1)},${s2.toFixed(1)}`

    if (this.metricsCache.has(cacheKey)) {
      return this.metricsCache.get(cacheKey)!
    }

    // Compute raw metric
    const raw = this.computeRawMetric(s1, s2, league)

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
  outlierScore(s1: number, s2: number, league: MetricLeague = 'NFL'): number {
    const raw = this.computeRawMetric(s1, s2, league)

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
  explain(s1: number, s2: number, league: MetricLeague = 'NFL') {
    const sigma = LEAGUE_MODELS[league].sigma
    const p1 = 1 - normalCDF(Math.abs(s1) / sigma)
    const p2 = 1 - normalCDF(Math.abs(s2) / sigma)
    const baseDelta = Math.abs(p2 - p1)

    // Key analysis. Weights come from the same derivation computeRawMetric
    // uses, so this breakdown cannot drift from the number it explains.
    const keysCrossedList = this.keysCrossed(s1, s2)
    let keyAdj = 0
    const keyDetails: string[] = []

    for (const k of keysCrossedList) {
      const w = keyWeight(k, league)
      keyAdj += w
      keyDetails.push(`Crossed ${k} (+${w.toFixed(4)}, ${league})`)
    }

    const rawTotal = baseDelta + keyAdj
    const calibrated = this.marketDeltaProb(s1, s2, league)
    const outlier = this.outlierScore(s1, s2, league)

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
