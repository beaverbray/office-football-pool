/**
 * Mathematical utility functions for robust spread metric
 */

/**
 * Error function (erf) approximation
 * Used for computing normal CDF
 *
 * Abramowitz and Stegun approximation (max error ~1.5e-7)
 */
export function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1
  x = Math.abs(x)

  // Constants for approximation
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const t = 1.0 / (1.0 + p * x)
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)

  return sign * y
}

/**
 * Standard normal cumulative distribution function
 */
export function normalCDF(x: number, mu: number = 0, sigma: number = 1): number {
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.sqrt(2))))
}

/**
 * Linear interpolation between two points
 */
export function linearInterp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  if (x1 === x0) return y0
  const t = (x - x0) / (x1 - x0)
  return y0 + t * (y1 - y0)
}

/**
 * Interpolate value using arrays of x and y coordinates
 * Assumes x_values are sorted in ascending order
 */
export function interp(x: number, x_values: number[], y_values: number[]): number {
  if (x_values.length !== y_values.length) {
    throw new Error('x_values and y_values must have same length')
  }

  if (x_values.length === 0) {
    throw new Error('Cannot interpolate with empty arrays')
  }

  // Handle edge cases
  if (x <= x_values[0]) return y_values[0]
  if (x >= x_values[x_values.length - 1]) return y_values[y_values.length - 1]

  // Find surrounding points
  let i = 0
  while (i < x_values.length - 1 && x_values[i + 1] < x) {
    i++
  }

  // Linear interpolation
  return linearInterp(x, x_values[i], x_values[i + 1], y_values[i], y_values[i + 1])
}

/**
 * Clip value between min and max
 */
export function clip(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
