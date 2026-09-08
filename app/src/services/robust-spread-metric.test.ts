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

    it('returns 0 for equal-magnitude opposite-sign spreads (no key strictly crossed)', () => {
      // abs(-3) === abs(3) === 3, so lo === hi === 3 and no key number is
      // strictly crossed (the loop requires lo < k <= hi).
      expect(metric.marketDeltaProb(-3, 3)).toBeCloseTo(0, 6)
    })

    it('computes base delta plus doubled key adjustments when crossing key numbers', () => {
      // keysCrossed(2, 4) crosses key 3 and key 4, each pushed twice (once
      // positive, once negative) due to the duplicated condition in keysCrossed,
      // so key 3 contributes 2*0.02=0.04 and key 4 (other) contributes 2*0.005=0.01.
      // baseDelta = |P(cover 4) - P(cover 2)| under the normal approximation.
      expect(metric.marketDeltaProb(2, 4)).toBeCloseTo(0.10781411106346356, 6)
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
      expect(metric.outlierScore(2, 4)).toBeCloseTo(2.156282221269271, 4)
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
      expect(result.key_adjustments.keys_crossed.sort((a, b) => a - b)).toEqual([-4, -3, 3, 4])
    })
  })
})
