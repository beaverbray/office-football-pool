import { describe, it, expect } from 'vitest'
import { erf, normalCDF, linearInterp, interp, clip } from './math-helpers'

describe('erf', () => {
  it('is approximately 0 at x=0', () => {
    expect(erf(0)).toBeCloseTo(0, 6)
  })

  it('matches known reference values (Abramowitz-Stegun approximation, error < 1.5e-7)', () => {
    expect(erf(1)).toBeCloseTo(0.8427007929497149, 6)
    expect(erf(0.5)).toBeCloseTo(0.5204998778130465, 6)
    expect(erf(2)).toBeCloseTo(0.9953222650189527, 6)
  })

  it('is odd: erf(-x) === -erf(x)', () => {
    expect(erf(-1)).toBeCloseTo(-erf(1), 10)
    expect(erf(-0.5)).toBeCloseTo(-erf(0.5), 10)
  })

  it('approaches 1 for large positive x', () => {
    expect(erf(5)).toBeCloseTo(1, 6)
  })
})

describe('normalCDF', () => {
  it('is 0.5 at the mean (standard normal, x=0)', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 6)
  })

  it('matches known standard normal CDF reference values', () => {
    expect(normalCDF(1.96)).toBeCloseTo(0.9750021048517795, 4)
    expect(normalCDF(-1.96)).toBeCloseTo(0.024997895148220435, 4)
  })

  it('supports custom mean and sigma', () => {
    // z = (110 - 100) / 15 = 0.6667 -> Phi(0.6667)
    expect(normalCDF(110, 100, 15)).toBeCloseTo(0.7475075278364188, 6)
    // at the mean, CDF is always 0.5 regardless of sigma
    expect(normalCDF(100, 100, 15)).toBeCloseTo(0.5, 6)
  })

  it('is symmetric around the mean', () => {
    const below = normalCDF(90, 100, 15)
    const above = normalCDF(110, 100, 15)
    expect(below + above).toBeCloseTo(1, 6)
  })
})

describe('linearInterp', () => {
  it('interpolates linearly between two points', () => {
    expect(linearInterp(5, 0, 10, 0, 100)).toBe(50)
  })

  it('extrapolates beyond the given range', () => {
    expect(linearInterp(20, 0, 10, 0, 100)).toBe(200)
    expect(linearInterp(-10, 0, 10, 0, 100)).toBe(-100)
  })

  it('returns y0 when x0 === x1 to avoid divide-by-zero', () => {
    expect(linearInterp(5, 5, 5, 20, 80)).toBe(20)
  })
})

describe('interp', () => {
  const xValues = [0, 10, 20]
  const yValues = [0, 100, 50]

  it('interpolates within the first segment', () => {
    expect(interp(5, xValues, yValues)).toBe(50)
  })

  it('interpolates within the second segment', () => {
    expect(interp(15, xValues, yValues)).toBe(75)
  })

  it('returns the exact value at a knot', () => {
    expect(interp(10, xValues, yValues)).toBe(100)
    expect(interp(0, xValues, yValues)).toBe(0)
  })

  it('clamps to the first y value below the range', () => {
    expect(interp(-5, xValues, yValues)).toBe(0)
  })

  it('clamps to the last y value above the range', () => {
    expect(interp(25, xValues, yValues)).toBe(50)
  })

  it('throws when x_values and y_values have different lengths', () => {
    expect(() => interp(5, [0, 10], [0])).toThrow('x_values and y_values must have same length')
  })

  it('throws when given empty arrays', () => {
    expect(() => interp(5, [], [])).toThrow('Cannot interpolate with empty arrays')
  })
})

describe('clip', () => {
  it('returns the value unchanged when within bounds', () => {
    expect(clip(5, 0, 10)).toBe(5)
  })

  it('clamps to min when below range', () => {
    expect(clip(-5, 0, 10)).toBe(0)
  })

  it('clamps to max when above range', () => {
    expect(clip(15, 0, 10)).toBe(10)
  })

  it('is inclusive of boundary values', () => {
    expect(clip(0, 0, 10)).toBe(0)
    expect(clip(10, 0, 10)).toBe(10)
  })
})
