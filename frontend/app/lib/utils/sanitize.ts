/**
 * Numeric Sanitization Utilities
 * 
 * Ensures all numeric values are finite and handles null/NaN/undefined gracefully.
 * Used throughout chart data builders and debug exports.
 */

/**
 * Sanitize a single numeric value
 * @param x Value to sanitize
 * @param fallback Fallback value if x is invalid (default: 0)
 * @param options Optional min/max bounds
 * @returns Finite number or fallback
 */
export function sanitizeFinite(
  x: number | null | undefined, 
  options?: { min?: number; max?: number; fallback?: number | null }
): number | null {
  const fallback = options?.fallback ?? null;
  const min = options?.min;
  const max = options?.max;
  
  if (x === null || x === undefined || !isFinite(x)) {
    return fallback;
  }
  
  // Apply bounds if specified
  if (min !== undefined && x < min) {
    return fallback;
  }
  if (max !== undefined && x > max) {
    return fallback;
  }
  
  return x;
}

/**
 * Sanitize a series of numeric values
 * @param arr Array of values to sanitize
 * @param fallbackStrategy Strategy for handling invalid values
 * @returns Array of finite numbers
 */
export function sanitizeSeries(
  arr: (number | null | undefined)[],
  fallbackStrategy: 'previous' | 'zero' | 'interpolate' = 'previous'
): number[] {
  const result: number[] = [];
  let lastValid: number | null = null;

  for (let i = 0; i < arr.length; i++) {
    const value = arr[i];
    
    if (value !== null && value !== undefined && isFinite(value)) {
      result.push(value);
      lastValid = value;
    } else {
      // Handle invalid value based on strategy
      switch (fallbackStrategy) {
        case 'previous':
          if (lastValid !== null) {
            result.push(lastValid);
          } else {
            result.push(0);
          }
          break;
        case 'zero':
          result.push(0);
          break;
        case 'interpolate':
          // Find next valid value for interpolation
          let nextValid: number | null = null;
          for (let j = i + 1; j < arr.length; j++) {
            const next = arr[j];
            if (next !== null && next !== undefined && isFinite(next)) {
              nextValid = next;
              break;
            }
          }
          
          if (lastValid !== null && nextValid !== null) {
            // Linear interpolation
            const distance = nextValid - lastValid;
            const steps = (nextValid !== null ? 1 : 0) + 1;
            result.push(lastValid + distance / steps);
          } else if (lastValid !== null) {
            result.push(lastValid);
          } else if (nextValid !== null) {
            result.push(nextValid);
          } else {
            result.push(0);
          }
          break;
      }
    }
  }

  return result;
}

/**
 * Assert that a value is within a valid range (dev mode only)
 * @param name Name of the variable for error messages
 * @param x Value to check
 * @param lo Lower bound (inclusive)
 * @param hi Upper bound (inclusive)
 * @returns x if valid, otherwise logs warning and returns x (doesn't throw in production)
 */
export function assertRange(name: string, x: number, lo: number, hi: number): number {
  if (process.env.NODE_ENV === 'development') {
    if (x < lo || x > hi) {
      console.warn(
        `[SANITIZE] ${name}=${x} is outside expected range [${lo}, ${hi}]. ` +
        `This may indicate a units error or calculation bug.`
      );
    }
  }
  return x;
}

/**
 * Create a boolean mask indicating which values were imputed
 * @param arr Original array
 * @returns Boolean array where true means value was imputed
 */
export function createImputationMask(arr: (number | null | undefined)[]): boolean[] {
  return arr.map(value => value === null || value === undefined || !isFinite(value));
}


