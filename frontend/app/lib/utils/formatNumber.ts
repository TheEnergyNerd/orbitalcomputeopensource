/**
 * Format a number to at most 4 significant figures, using M/B/T suffixes instead of scientific notation
 */
export function formatSigFigs(value: number, maxSigFigs: number = 4): string {
  if (value === 0) return "0";
  if (!isFinite(value)) return "0";
  
  // Ensure maxSigFigs is at least 1
  const sigFigs = Math.max(1, maxSigFigs);
  
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  // Use suffixes for large numbers
  if (absValue >= 1_000_000_000_000) {
    // Trillions
    const trillions = absValue / 1_000_000_000_000;
    return sign + formatWithSigFigs(trillions, sigFigs) + 'T';
  } else if (absValue >= 1_000_000_000) {
    // Billions
    const billions = absValue / 1_000_000_000;
    return sign + formatWithSigFigs(billions, sigFigs) + 'B';
  } else if (absValue >= 1_000_000) {
    // Millions
    const millions = absValue / 1_000_000;
    return sign + formatWithSigFigs(millions, sigFigs) + 'M';
  } else if (absValue >= 1_000) {
    // Thousands
    const thousands = absValue / 1_000;
    return sign + formatWithSigFigs(thousands, sigFigs) + 'k';
  } else if (absValue < 0.0001) {
    // Very small numbers - use decimal notation
    return value.toFixed(4);
  }
  
  // Use toPrecision to get significant figures
  const formatted = value.toPrecision(sigFigs);
  
  // Remove trailing zeros and decimal point if not needed
  return formatted.replace(/\.?0+$/, "");
}

function formatWithSigFigs(value: number, sigFigs: number): string {
  const formatted = value.toPrecision(sigFigs);
  return formatted.replace(/\.?0+$/, "");
}

/**
 * Format a number with a specific number of decimal places (for percentages, etc.)
 */
export function formatDecimal(value: number, decimals: number = 1): string {
  return value.toFixed(decimals);
}

