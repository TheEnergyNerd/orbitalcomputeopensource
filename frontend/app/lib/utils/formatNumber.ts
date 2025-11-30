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
    // Very small numbers - use decimal notation (no scientific notation)
    return value.toFixed(4);
  }
  
  // For numbers in the normal range, use toPrecision but ensure no scientific notation
  // toPrecision can produce scientific notation, so we need to handle it
  let formatted = value.toPrecision(sigFigs);
  
  // If toPrecision produced scientific notation (contains 'e' or 'E'), convert it
  if (formatted.includes('e') || formatted.includes('E')) {
    // Parse the scientific notation and convert to regular number
    const num = parseFloat(formatted);
    // Use toFixed with appropriate decimals instead
    const decimals = Math.max(0, sigFigs - Math.floor(Math.log10(Math.abs(num))) - 1);
    formatted = num.toFixed(Math.min(decimals, 4));
  }
  
  // Remove trailing zeros and decimal point if not needed
  return formatted.replace(/\.?0+$/, "");
}

function formatWithSigFigs(value: number, sigFigs: number): string {
  let formatted = value.toPrecision(sigFigs);
  
  // If toPrecision produced scientific notation, convert it
  if (formatted.includes('e') || formatted.includes('E')) {
    const num = parseFloat(formatted);
    const decimals = Math.max(0, sigFigs - Math.floor(Math.log10(Math.abs(num))) - 1);
    formatted = num.toFixed(Math.min(decimals, 4));
  }
  
  return formatted.replace(/\.?0+$/, "");
}

/**
 * Format a number with a specific number of decimal places (for percentages, etc.)
 */
export function formatDecimal(value: number, decimals: number = 1): string {
  return value.toFixed(decimals);
}

