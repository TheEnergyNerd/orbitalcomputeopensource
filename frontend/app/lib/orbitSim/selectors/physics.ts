import { getDebugStateEntries, scenarioModeToKey } from "../debugState";
import type { DebugStateEntry } from "../debugState";

export interface MassBreakdownPoint {
  year: number;
  solar: number;
  radiator: number;
  silicon: number;
  shielding: number;
  structure: number;
}

export interface RadiatorComputePoint {
  year: number;
  radiatorAreaM2: number;
  computePFlops: number;
}

export interface ThermalPoint {
  year: number;
  coreC: number;
  radiatorC: number;
  heatCeiling: number;
}

export interface SolarUptimePoint {
  year: number;
  orbitUptime: number;
  groundSolarPlusStorageUptime: number;
}

export interface OrbitalPowerPoint {
  year: number;
  powerGW: number;
}

export interface PowerPerSatPoint {
  year: number;
  powerKw: number;
}

export interface BatteryTechPoint {
  year: number;
  densityWhPerKg: number;
  costUsdPerKwh: number;
}

/**
 * Build mass breakdown series from debug state
 */
export function buildMassBreakdownSeries(
  scenarioMode?: string
): MassBreakdownPoint[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = getDebugStateEntries(scenarioKey)
    .sort((a, b) => a.year - b.year);

  const result = entries.map(entry => {
    const solar = entry.bus_solar_mass_kg ?? 0;
    const radiator = entry.bus_radiator_mass_kg ?? 0;
    const silicon = entry.bus_silicon_mass_kg ?? 0;
    const shielding = entry.bus_shielding_mass_kg ?? 0;
    const structure = entry.bus_structure_mass_kg ?? 0;
    
    // Debug logging for all entries (not just last)
    const total = solar + radiator + silicon + shielding + structure;
    if (total === 0 || !entry.bus_total_mass_kg) {
      console.warn(`[Mass Breakdown] Missing/zero mass data for year ${entry.year}`, {
        bus_solar_mass_kg: entry.bus_solar_mass_kg,
        bus_radiator_mass_kg: entry.bus_radiator_mass_kg,
        bus_silicon_mass_kg: entry.bus_silicon_mass_kg,
        bus_shielding_mass_kg: entry.bus_shielding_mass_kg,
        bus_structure_mass_kg: entry.bus_structure_mass_kg,
        bus_total_mass_kg: entry.bus_total_mass_kg,
        bus_power_electronics_mass_kg: entry.bus_power_electronics_mass_kg,
        bus_avionics_mass_kg: entry.bus_avionics_mass_kg,
        bus_battery_mass_kg: entry.bus_battery_mass_kg,
        bus_adcs_mass_kg: entry.bus_adcs_mass_kg,
        bus_propulsion_mass_kg: entry.bus_propulsion_mass_kg,
        bus_other_mass_kg: entry.bus_other_mass_kg,
      });
    } else if (entry.year === entries[entries.length - 1]?.year || entry.year % 5 === 0) {
      // Log every 5 years and last year
      // Only log in development mode to reduce console noise
      if (process.env.NODE_ENV === 'development' && entry.year % 5 === 0) {
      console.log(`[Mass Breakdown] Year ${entry.year}:`, {
        solar,
        radiator,
        silicon,
        shielding,
        structure,
        total,
        bus_total_mass_kg: entry.bus_total_mass_kg,
        allComponents: {
          solar: entry.bus_solar_mass_kg,
          radiator: entry.bus_radiator_mass_kg,
          silicon: entry.bus_silicon_mass_kg,
          shielding: entry.bus_shielding_mass_kg,
          structure: entry.bus_structure_mass_kg,
          powerElectronics: entry.bus_power_electronics_mass_kg,
          avionics: entry.bus_avionics_mass_kg,
          battery: entry.bus_battery_mass_kg,
          adcs: entry.bus_adcs_mass_kg,
          propulsion: entry.bus_propulsion_mass_kg,
          other: entry.bus_other_mass_kg,
        },
      });
      }
    }
    
    return {
      year: entry.year,
      solar,
      radiator,
      silicon,
      shielding,
      structure,
    };
  });

  return result;
}

/**
 * Build radiator vs compute series from debug state
 */
export function buildRadiatorComputeSeries(
  scenarioMode?: string
): RadiatorComputePoint[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = getDebugStateEntries(scenarioKey)
    .sort((a, b) => a.year - b.year);

  return entries.map(entry => ({
    year: entry.year,
    radiatorAreaM2: entry.radiatorArea ?? 0, // Use radiatorArea field from debugState
    // FIX: Use compute_raw_flops (total capacity) not compute_effective_flops (exportable)
    // compute_raw_flops is in FLOPS, convert to PFLOPs by dividing by 1e15
    computePFlops: (entry.compute_raw_flops ?? 0) / 1e15,
  }));
}

/**
 * Build thermal series from debug state
 */
export function buildThermalSeries(
  scenarioMode?: string
): ThermalPoint[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = getDebugStateEntries(scenarioKey)
    .sort((a, b) => a.year - b.year);

  return entries.map(entry => ({
    year: entry.year,
    coreC: entry.temp_core_C ?? 0,
    radiatorC: entry.temp_radiator_C ?? 0,
    heatCeiling: entry.heatCeiling ?? 0,
  }));
}

/**
 * Build solar uptime series from debug state
 */
export function buildSolarUptimeSeries(
  scenarioMode?: string
): SolarUptimePoint[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = getDebugStateEntries(scenarioKey)
    .sort((a, b) => a.year - b.year);

  return entries.map(entry => ({
    year: entry.year,
    orbitUptime: entry.space_solar_uptime_percent ?? 0,
    groundSolarPlusStorageUptime: entry.solar_plus_storage_uptime_percent ?? 0,
  }));
}

/**
 * Build orbital power (GW) series from debug state
 */
export function buildOrbitalPowerSeries(
  scenarioMode?: string
): OrbitalPowerPoint[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = getDebugStateEntries(scenarioKey)
    .sort((a, b) => a.year - b.year);

  return entries.map(entry => ({
    year: entry.year,
    powerGW: entry.orbital_power_total_gw ?? (entry.power_total_kw ?? 0) / 1000000,
  }));
}

/**
 * Build power per satellite (kW) series from debug state
 */
export function buildPowerPerSatSeries(
  scenarioMode?: string
): PowerPerSatPoint[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = getDebugStateEntries(scenarioKey)
    .sort((a, b) => a.year - b.year);

  return entries.map(entry => {
    const totalPowerKw = entry.power_total_kw ?? 0;
    const totalSats = entry.satellitesTotal ?? 1;
    return {
      year: entry.year,
      powerKw: totalSats > 0 ? totalPowerKw / totalSats : 0,
    };
  });
}

/**
 * Build battery tech curve series from debug state
 */
export function buildBatteryTechSeries(
  scenarioMode?: string
): BatteryTechPoint[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = getDebugStateEntries(scenarioKey)
    .sort((a, b) => a.year - b.year);

  return entries.map(entry => ({
    year: entry.year,
    densityWhPerKg: entry.battery_density_wh_per_kg ?? 0,
    costUsdPerKwh: entry.battery_cost_usd_per_kwh ?? 0,
  }));
}

