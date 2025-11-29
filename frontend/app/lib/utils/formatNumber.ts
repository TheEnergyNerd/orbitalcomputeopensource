/**
 * Format a number to at most 4 significant figures
 */
export function formatSigFigs(value: number, maxSigFigs: number = 4): string {
  if (value === 0) return "0";
  if (!isFinite(value)) return "0";
  
  // Ensure maxSigFigs is at least 1
  const sigFigs = Math.max(1, maxSigFigs);
  
  // Handle very small numbers
  if (Math.abs(value) < 0.0001) {
    return value.toExponential(3); // Use scientific notation for very small numbers
  }
  
  // Use toPrecision to get significant figures
  const formatted = value.toPrecision(sigFigs);
  
  // Remove trailing zeros and decimal point if not needed
  return formatted.replace(/\.?0+$/, "");
}

/**
 * Format a number with a specific number of decimal places (for percentages, etc.)
 */
export function formatDecimal(value: number, decimals: number = 1): string {
  return value.toFixed(decimals);
}

