/**
 * Shell Capacity Calculator
 * Calculates maximum satellite capacity per orbital shell based on:
 * - Shell area (4πr²)
 * - Lit fraction (~70% sunlit at any time)
 * - Safe spacing requirements
 */

const EARTH_RADIUS_KM = 6371;

export interface ShellCapacityResult {
  altitudeKm: number;
  shellAreaKm2: number;
  litAreaKm2: number;
  spacingKm: number;
  maxSatellites: number;
}

/**
 * Calculate maximum satellite capacity for a given orbital shell
 */
export function calculateShellCapacity(
  altitudeKm: number,
  spacingKm: number = 100
): ShellCapacityResult {
  const shellRadius = EARTH_RADIUS_KM + altitudeKm;
  const totalArea = 4 * Math.PI * Math.pow(shellRadius, 2); // km²
  const litFraction = 0.70; // ~70% sunlit at any time
  const litArea = totalArea * litFraction;
  const areaPerSat = Math.pow(spacingKm, 2);
  const maxSatellites = litArea / areaPerSat;
  
  return {
    altitudeKm,
    shellAreaKm2: totalArea,
    litAreaKm2: litArea,
    spacingKm,
    maxSatellites: Math.floor(maxSatellites),
  };
}

/**
 * Calculate total capacity across multiple shells
 */
export function calculateTotalCapacity(
  shells: Array<{ altitude: number; spacing: number; maxPowerPerSat: number; radiationPenalty?: number }>,
  powerPerSatKw: number
): {
  totalSats: number;
  totalPowerGW: number;
  breakdown: Array<{
    shell: string;
    altitude: number;
    maxSats: number;
    powerPerSat: number;
    totalPowerGW: number;
  }>;
} {
  let totalSats = 0;
  let totalPowerGW = 0;
  const breakdown = [];
  
  for (const shell of shells) {
    const capacity = calculateShellCapacity(shell.altitude, shell.spacing);
    const effectivePower = Math.min(powerPerSatKw, shell.maxPowerPerSat);
    const radiationFactor = 1 - (shell.radiationPenalty || 0);
    const shellPowerGW = (capacity.maxSatellites * effectivePower * radiationFactor) / 1e6;
    
    breakdown.push({
      shell: `LEO_${shell.altitude}`,
      altitude: shell.altitude,
      maxSats: capacity.maxSatellites,
      powerPerSat: effectivePower,
      totalPowerGW: shellPowerGW,
    });
    
    totalSats += capacity.maxSatellites;
    totalPowerGW += shellPowerGW;
  }
  
  return { totalSats, totalPowerGW, breakdown };
}

