import { describe, it, expect } from 'vitest'
import { RobustSpreadMetric } from './robust-spread-metric'

// The singleton's default model is uncalibrated (calibrator_state.fitted === false),
// so marketDeltaProb reduces to clip(computeRawMetric(s1, s2), 0, 1) with no isotonic
// remapping. Expected values below were derived by hand-evaluating the same
// Abramowitz-Stegun erf approximation, normalCDF, and key-crossing logic that the
// module implements (sigma_base=13.45, key_weight_3=0.02, key_weight_7=0.015,
// key_weight_other=0.005, outlier_threshold=0.05).
describe('RobustSpreadMetric', () => {
  const metric = RobustSpreadMetric.getInstance()

  describe('marketDeltaProb', () => {
    it('returns 0 for identical spreads (no key crossed, no base delta)', () => {
      expect(metric.marketDeltaProb(0, 0)).toBeCloseTo(0, 6)
    })

    it('returns 0 for equal-magnitude opposite-sign spreads', () => {
      // The metric works on |spread|, so -3 and 3 describe lines of the same
      // steepness. A favourite change is reported separately as favoriteFlipped.
      expect(metric.marketDeltaProb(-3, 3)).toBeCloseTo(0, 6)
    })

    it('scores the two half-point moves off a key number equally', () => {
      // The half-point either side of 3 moves the same ~10% of games that land
      // exactly on 3: push becomes cover going down, push becomes loss going up.
      // A half-open interval used to score these 5.45% vs 1.44% — a 4x gap
      // between equivalent moves, observed live on the Week 1 board (Bears/
      // Panthers 3 -> 2.5 flagged "high", Patriots/Seahawks 3 -> 3.5 "low").
      const down = metric.marketDeltaProb(3, 2.5)
      const up = metric.marketDeltaProb(3, 3.5)
      expect(Math.abs(down - up)).toBeLessThan(0.002)
    })

    it('scores a move fully across a key above either half of it', () => {
      const across = metric.marketDeltaProb(2.5, 3.5)
      expect(across).toBeGreaterThan(metric.marketDeltaProb(3, 2.5))
      expect(across).toBeGreaterThan(metric.marketDeltaProb(3, 3.5))
    })

    it('counts each key number once, not twice', () => {
      // explain() de-duplicates keys_crossed before reporting, so the key list
      // alone would not have caught the double push. total_adjustment is summed
      // from the raw list, so it does: spanning 3 (0.02) and 4 (other, 0.005)
      // is 0.025, where the doubled version produced 0.05.
      const { key_adjustments } = metric.explain(2, 4)
      expect(key_adjustments.total_adjustment).toBeCloseTo(0.025, 10)
      expect([...key_adjustments.keys_crossed].sort((a, b) => a - b)).toEqual([3, 4])
      expect(key_adjustments.keys_crossed.every(k => k > 0)).toBe(true)
    })

    it('is bounded within [0, 1]', () => {
      const result = metric.marketDeltaProb(-50, 50)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(1)
    })

    it('is symmetric in argument order', () => {
      expect(metric.marketDeltaProb(2, 4)).toBeCloseTo(metric.marketDeltaProb(4, 2), 10)
    })
  })

  describe('outlierScore', () => {
    it('returns 0 for spreads with no raw metric (identical spreads)', () => {
      expect(metric.outlierScore(0, 0)).toBeCloseTo(0, 6)
    })

    it('divides the raw metric by the configured outlier threshold (0.05)', () => {
      // Asserted as a ratio rather than a magic constant: the previous literal
      // (2.156) baked in the doubled key adjustment and had to be edited when
      // the double-count was fixed, which is exactly what a pinned constant
      // cannot tell you.
      // Against raw_metric, not marketDeltaProb. outlierScore divides the RAW
      // value while marketDeltaProb returns calibrate(raw) clipped; the two
      // coincide only while the calibrator is identity, which it is today
      // because robust-metric-model.json is never loaded. Asserting the
      // coincidence would break the day calibration is wired in, for the
      // wrong reason.
      expect(metric.outlierScore(2, 4)).toBeCloseTo(metric.explain(2, 4).final_metrics.raw_metric / 0.05, 10)
    })
  })

  describe('getImportanceLevel', () => {
    it('classifies below 0.01 as minimal', () => {
      expect(metric.getImportanceLevel(0.005)).toBe('minimal')
    })

    it('classifies the 0.01 boundary as low (boundary is exclusive of minimal)', () => {
      expect(metric.getImportanceLevel(0.01)).toBe('low')
    })

    it('classifies the 0.02 boundary as moderate', () => {
      expect(metric.getImportanceLevel(0.02)).toBe('moderate')
    })

    it('classifies the 0.04 boundary as high', () => {
      expect(metric.getImportanceLevel(0.04)).toBe('high')
    })

    it('classifies the 0.08 boundary and above as very-high', () => {
      expect(metric.getImportanceLevel(0.08)).toBe('very-high')
      expect(metric.getImportanceLevel(0.5)).toBe('very-high')
    })
  })

  describe('explain', () => {
    it('returns a breakdown consistent with marketDeltaProb and outlierScore', () => {
      const result = metric.explain(2, 4)
      expect(result.spreads).toEqual({ s1: 2, s2: 4, gap: 2 })
      expect(result.final_metrics.calibrated_delta).toBeCloseTo(metric.marketDeltaProb(2, 4), 10)
      expect(result.final_metrics.outlier_score).toBeCloseTo(metric.outlierScore(2, 4), 10)
      // Each key once, no phantom negatives: two `if` blocks with identical
      // conditions used to yield [-4, -3, 3, 4] and double every adjustment.
      expect(result.key_adjustments.keys_crossed.sort((a, b) => a - b)).toEqual([3, 4])
    })
  })
})
