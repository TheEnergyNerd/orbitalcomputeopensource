// src/sim/selectors/orbitalPhysics.ts

import type { DebugStateEntry } from "../debugState";

export interface PhysicsSeriesPoint {
  year: number;
  [key: string]: number;
}

/**
 * Generic helper: sort by year and map
 */
function sortByYear(years: DebugStateEntry[]): DebugStateEntry[] {
  return [...years].sort((a, b) => a.year - b.year);
}

// 1. Compute density (TFLOPs/kg)
export function buildComputeDensitySeries(years: DebugStateEntry[]): PhysicsSeriesPoint[] {
  return sortByYear(years).map(y => {
    const tflopsPerKg = (y.bus_total_mass_kg ?? 0) > 0
      ? (y.bus_compute_tflops_derated ?? 0) / (y.bus_total_mass_kg ?? 1)
      : 0;

    return {
      year: y.year,
      tflops_per_kg: tflopsPerKg,
    };
  });
}

// 2. Mass budget breakdown per satellite
export function buildMassFractionsSeries(years: DebugStateEntry[]): PhysicsSeriesPoint[] {
  return sortByYear(years).map(y => {
    const total = y.bus_total_mass_kg ?? 1;
    return {
      year: y.year,
      silicon: (y.bus_silicon_mass_kg ?? 0) / total,
      radiator: (y.bus_radiator_mass_kg ?? 0) / total,
      solar: (y.bus_solar_mass_kg ?? 0) / total,
      structure: (y.bus_structure_mass_kg ?? 0) / total,
      shielding: (y.bus_shielding_mass_kg ?? 0) / total,
      power_electronics: 0, // Not in debug state yet, can add later
    };
  });
}

// 3. Radiator area required vs feasible max
export function buildRadiatorAreaSeries(
  years: DebugStateEntry[],
  maxRadiatorPerBusM2 = 1000,
): PhysicsSeriesPoint[] {
  return sortByYear(years).map(y => {
    const requiredFleet = y.radiatorArea ?? 0; // already fleet-level
    const feasibleFleet = maxRadiatorPerBusM2 * (y.satellitesTotal ?? 0);

    return {
      year: y.year,
      required_m2: requiredFleet,
      feasible_m2: feasibleFleet,
    };
  });
}

// 4. Solar array area vs power
export function buildSolarAreaSeries(years: DebugStateEntry[]): PhysicsSeriesPoint[] {
  return sortByYear(years).map(y => {
    // Calculate solar area from mass (approximate: 6 kg/m²) or use bus power to estimate
    const solarAreaFleetM2 = y.bus_solar_mass_kg
      ? (y.bus_solar_mass_kg / 6) * (y.satellitesTotal ?? 0) // Approximate: 6 kg/m²
      : (y.bus_power_kw ?? 0) * (y.satellitesTotal ?? 0) * 2.5; // Rough estimate: 2.5 m² per kW
    const powerKwFleet = (y.bus_power_kw ?? 0) * (y.satellitesTotal ?? 0);

    return {
      year: y.year,
      solar_area_m2: solarAreaFleetM2,
      power_kw: powerKwFleet,
    };
  });
}

// 5. Radiation derating curve
export function buildRadiationDeratingSeries(years: DebugStateEntry[]): PhysicsSeriesPoint[] {
  return sortByYear(years).map(y => ({
    year: y.year,
    tflops_nominal: y.bus_compute_tflops_nominal ?? 0,
    tflops_derated: y.bus_compute_tflops_derated ?? 0,
    availability: y.bus_availability ?? 0,
  }));
}

// 7. Fleet effective compute (PFLOPs)
export function buildFleetComputeSeries(years: DebugStateEntry[]): PhysicsSeriesPoint[] {
  return sortByYear(years).map(y => {
    const satellitesTotal = y.satellitesTotal ?? 0;
    const nominalTflops = (y.bus_compute_tflops_nominal ?? 0) * satellitesTotal;
    const deratedTflops = (y.bus_compute_tflops_derated ?? 0) * satellitesTotal;
    const availability = y.bus_availability ?? 0;
    
    const nominalPflops = nominalTflops / 1_000;
    const deratedPflops = deratedTflops / 1_000;
    const effectivePflops = deratedPflops * availability;

    return {
      year: y.year,
      nominal_pflops: nominalPflops,
      derated_pflops: deratedPflops,
      effective_pflops: effectivePflops,
    };
  });
}

// 8. Mass launched per year & launch cost
export function buildLaunchSeries(years: DebugStateEntry[]): PhysicsSeriesPoint[] {
  return sortByYear(years).map(y => ({
    year: y.year,
    mass_launched_tons: (y.launchMassThisYearKg ?? 0) / 1_000,
    launch_cost_musd: (y.launchCostThisYearUSD ?? 0) / 1_000_000,
    launch_carbon_kt: (y.launchCarbonKgThisYear ?? 0) / 1_000_000,
  }));
}

// 9. Cost-per-compute decomposition
export function buildCostDecompositionSeries(years: DebugStateEntry[]): PhysicsSeriesPoint[] {
  return sortByYear(years).map(y => {
    const orbitComputePflops =
      (y.fleet_total_compute_tflops_derated ?? 0) > 0
        ? (y.fleet_total_compute_tflops_derated ?? 0) / 1_000
        : 0.000001;

    const launchCostPerCompute = (y.launchCostThisYearUSD ?? 0) / orbitComputePflops;
    const orbitOpexPerCompute =
      ((y.annual_opex_orbit ?? 0) - (y.launchCostThisYearUSD ?? 0)) / orbitComputePflops;
    const groundOpexPerCompute = (y.annual_opex_ground ?? 0) / orbitComputePflops;

    return {
      year: y.year,
      launch: launchCostPerCompute,
      orbit_opex: orbitOpexPerCompute,
      ground_opex: groundOpexPerCompute,
    };
  });
}

// 10. Thermal ceiling: required vs max heat flux
export function buildThermalCeilingSeries(
  years: DebugStateEntry[],
  maxHeatFluxWm2: number,
): PhysicsSeriesPoint[] {
  return sortByYear(years).map(y => {
    const heatW = (y.heatGen ?? 0) * 1_000;
    const area = Math.max(1, y.radiatorArea ?? 1);
    const requiredFlux = heatW / area;

    return {
      year: y.year,
      required_w_m2: requiredFlux,
      max_w_m2: maxHeatFluxWm2,
    };
  });
}

// 11. Networking bottleneck: compute vs backhaul
export function buildNetworkingSeries(years: DebugStateEntry[]): PhysicsSeriesPoint[] {
  return sortByYear(years).map(y => ({
    year: y.year,
    exportable_pflops: y.compute_exportable_PFLOPs ?? 0,
    backhaul_tbps: y.backhaul_capacity_tbps ?? 0,
  }));
}

// 12. Bottleneck strengths (normalized utilizations)
export function buildBottleneckSeries(years: DebugStateEntry[]): PhysicsSeriesPoint[] {
  return sortByYear(years).map(y => ({
    year: y.year,
    heat: y.utilization_heat ?? 0,
    backhaul: y.utilization_backhaul ?? 0,
    autonomy: y.utilization_autonomy ?? 0,
    manufacturing: ((y.manufacturing_utilization_percent ?? 0) / 100),
    maintenance: ((y.maintenance_utilization_percent ?? 0) / 100),
  }));
}

// 13. Physics-limited orbit vs Texas compute
export function buildPhysicsVsGroundSeries(years: DebugStateEntry[]): PhysicsSeriesPoint[] {
  return sortByYear(years).map(y => ({
    year: y.year,
    cost_ground: y.cost_per_compute_ground ?? 0,
    cost_orbit_physics: y.cost_per_compute_orbit ?? 0,
  }));
}

