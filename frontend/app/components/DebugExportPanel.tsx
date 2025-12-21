"use client";

import { useSimulationStore } from "../store/simulationStore";
import { useOrbitSim } from "../state/orbitStore";
import { useSimStore } from "../store/simStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { calculateComputeFromPower } from "../lib/orbitSim/computeEfficiency";
import { getOrbitalCostPerTFLOP } from "../lib/orbitSim/orbitalCostModel";
import { getDebugState, getDebugStateEntry, scenarioModeToKey, type DebugStateEntry } from "../lib/orbitSim/debugState";
import {
  buildComputeDensitySeries,
  buildMassFractionsSeries,
  buildRadiatorAreaSeries,
  buildSolarAreaSeries,
  buildRadiationDeratingSeries,
  buildFleetComputeSeries,
  buildLaunchSeries,
  buildCostDecompositionSeries,
  buildThermalCeilingSeries,
  buildNetworkingSeries,
  buildBottleneckSeries,
  buildPhysicsVsGroundSeries,
} from "../lib/orbitSim/selectors/orbitalPhysics";
import { buildRadiatorComputeSeries } from "../lib/orbitSim/selectors/physics";
import {
  buildThermalConstraintSeries,
  buildRadiationDegradationSeries,
  buildCostRealityWaterfallSeries,
} from "../lib/orbitSim/selectors/newCharts";
import { SCENARIOS } from "../lib/orbitSim/scenarioParams";
import { getEfficiencyCurveData } from "../lib/orbitSim/computeEfficiency";

export default function DebugExportPanel() {
  // Always show the export button (removed pathname restriction)
  const { timeline, config } = useSimulationStore();
  const { satellites, routes } = useOrbitSim();
  const simState = useSimStore((s) => s.state);
  const { getDeployedUnits } = useOrbitalUnitsStore();

  const handleExport = () => {
    // Get debug state (single source of truth)
    const debugState = getDebugState();
    
    // CRITICAL FIX: Get current year from timeline (most recent), not debug state
    // Timeline is the source of truth for what year the simulation is currently at
    const currentYear = timeline.length > 0 
      ? timeline[timeline.length - 1]?.year || config.startYear
      : config.startYear;
    
    // Get all years from debug state for time-series
    const debugYears = Object.keys(debugState)
      .filter(key => key !== 'errors' && !isNaN(Number(key)))
      .map(Number)
      .sort((a, b) => a - b);

    // Count satellites per shell
    const satellitesPerShell: Record<string, number> = {
      "VLEO": 0,
      "MID-LEO": 0,
      "SSO": 0,
      "MEO": 0,
    };

    satellites.forEach(sat => {
      const altKm = (Math.sqrt(sat.x ** 2 + sat.y ** 2 + sat.z ** 2) - 1.0) * 6371;
      if (altKm >= 5000) {
        satellitesPerShell["MEO"]++;
      } else if (altKm >= 900) {
        satellitesPerShell["SSO"]++;
      } else if (altKm >= 500) {
        satellitesPerShell["MID-LEO"]++;
      } else {
        satellitesPerShell["VLEO"]++;
      }
    });

    // Get debug entry for current year (single source of truth - same as KPI strip)
    const scenarioKey = scenarioModeToKey(config.scenarioMode);
    const currentDebugEntry = getDebugStateEntry(currentYear, config.scenarioMode);
    
    // Calculate total orbital power from debug state (same method as KPI strip)
    let totalOrbitalPowerMW = 0;
    let totalOrbitalComputePFLOPs = 0;
    
    if (currentDebugEntry && currentDebugEntry.power_total_kw !== undefined && currentDebugEntry.power_total_kw > 0) {
      // Use power from debug state (most accurate - uses power progression curve)
      totalOrbitalPowerMW = currentDebugEntry.power_total_kw / 1000;
      
      // FIX: Use compute_raw_flops (physics-constrained capacity) for snapshot export
      // This matches the physics.radiatorCompute[year].computePFlops value
      // compute_raw_flops is the actual capacity after thermal/backhaul constraints, not exportable
      if (currentDebugEntry.compute_raw_flops !== undefined && currentDebugEntry.compute_raw_flops > 0) {
        totalOrbitalComputePFLOPs = currentDebugEntry.compute_raw_flops / 1e15;
      } else if (currentDebugEntry.compute_effective_flops !== undefined) {
        totalOrbitalComputePFLOPs = currentDebugEntry.compute_effective_flops / 1e15;
      } else if (currentDebugEntry.compute_exportable_flops !== undefined) {
        totalOrbitalComputePFLOPs = currentDebugEntry.compute_exportable_flops / 1e15;
      }
    } else {
      // Fallback: Use satellite counts (shouldn't happen if debug state is populated)
      totalOrbitalPowerMW = satellites.length * 0.1;
      const powerWatts = totalOrbitalPowerMW * 1e6;
      totalOrbitalComputePFLOPs = calculateComputeFromPower(powerWatts, currentYear);
    }

    // FIX: Calculate effective compute from debug state utilization
    // Use backhaul_utilization_percent if available, otherwise default to 0.82
    const utilizationMultiplier = currentDebugEntry?.backhaul_utilization_percent !== undefined
      ? Math.max(0, 1 - (currentDebugEntry.backhaul_utilization_percent / 100)) // Convert % to multiplier
      : 0.82; // Default fallback
    const effectiveComputeAfterUtilization = totalOrbitalComputePFLOPs * utilizationMultiplier;

    // FIX: Ground compute should come from time_series.ground_compute[year], not compute_effective_flops
    // compute_effective_flops is orbital compute, not ground
    const totalGroundComputePFLOPs = timeline.length > 0 && timeline[timeline.length - 1]?.netGroundComputeTwh
      ? timeline[timeline.length - 1].netGroundComputeTwh * 1e3 // Convert TWh to PFLOPs (1 TWh = 1000 PFLOPs)
      : 0;

    // Costs from debug state (single source of truth)
    const orbitTotalCost = currentDebugEntry?.annual_opex_orbit || 0;
    const groundTotalCost = currentDebugEntry?.annual_opex_ground_all_ground || 
                           currentDebugEntry?.annual_opex_ground || 
                           (timeline.length > 0 ? timeline[timeline.length - 1]?.opexGround : 0) || 0;

    // Carbon from debug state (single source of truth)
    const carbonOrbit = currentDebugEntry?.carbon_orbit 
      ? (currentDebugEntry.carbon_orbit / 1000) // Convert kg to tons
      : (satellites.length * 1.19); // Fallback: amortized launch carbon
    const carbonGround = currentDebugEntry?.carbon_ground 
      ? (currentDebugEntry.carbon_ground / 1000) // Convert kg to tons
      : (timeline.length > 0 ? timeline[timeline.length - 1]?.carbonGround : 0) || 0;

    // Latency (calculate average from satellites or use default)
    const avgOrbitLatency = satellites.length > 0 
      ? satellites.reduce((sum, sat) => sum + (sat.congestion || 0.5) * 65, 0) / satellites.length 
      : 65; // MID-LEO default
    const avgGroundLatency = 5; // Ground default

    // Congestion index
    const congestionIndex = satellites.length > 0 ? routes.length / satellites.length : 0;

    // Routing distribution (calculate from routes)
    let edgeCount = 0, coreCount = 0, orbitCount = 0;
    routes.forEach(route => {
      if (route.type === "edge") edgeCount++;
      else if (route.type === "core") coreCount++;
      else orbitCount++;
    });
    const totalRoutes = routes.length || 1;
    const routingDistribution = {
      edge_pct: edgeCount / totalRoutes,
      core_pct: coreCount / totalRoutes,
      orbit_pct: orbitCount / totalRoutes,
    };

    // Scenario diagnostics from debug state (already retrieved above)
    const scenarioDiagnostics = currentDebugEntry ? {
      scenario_mode: currentDebugEntry.scenario_mode,
      launch_cost_per_kg: currentDebugEntry.launch_cost_per_kg,
      tech_progress_factor: currentDebugEntry.tech_progress_factor,
      failure_rate_effective: currentDebugEntry.failure_rate_effective,
      maintenance_utilization_percent: currentDebugEntry.maintenance_utilization_percent,
      backhaul_utilization_percent: currentDebugEntry.backhaul_utilization_percent,
      orbit_carbon_intensity: currentDebugEntry.orbit_carbon_intensity,
      orbit_cost_per_compute: currentDebugEntry.orbit_cost_per_compute,
      orbit_compute_share: currentDebugEntry.orbit_compute_share,
      orbit_energy_share_twh: currentDebugEntry.orbit_energy_share_twh,
    } : null;

    // Calculate power per satellite (from debug state) - snapshot value
    const powerPerSatKwSnapshot = currentDebugEntry && currentDebugEntry.satellitesTotal > 0
      ? (currentDebugEntry.power_total_kw || 0) / currentDebugEntry.satellitesTotal
      : 0;
    
    // Get shell utilization and congestion metrics from debug state
    const shellUtilization = currentDebugEntry?.shell_utilization_by_altitude || {};
    const debrisCount = currentDebugEntry?.congestion_debris_count || 0;
    const collisionRisk = currentDebugEntry?.congestion_collision_risk || 0;
    const congestionCost = currentDebugEntry?.congestion_cost_annual || 0;
    const orbitalPowerGWSnapshot = currentDebugEntry?.orbital_power_total_gw || (totalOrbitalPowerMW / 1000);
    
    // Battery metrics from debug state
    const batteryDensity = currentDebugEntry?.battery_density_wh_per_kg || 0;
    const batteryCost = currentDebugEntry?.battery_cost_usd_per_kwh || 0;
    const batteryMassPerSat = currentDebugEntry?.battery_mass_per_sat_kg || 0;
    const batteryCostPerSat = currentDebugEntry?.battery_cost_per_sat_usd || 0;
    const eclipseTolerance = currentDebugEntry?.eclipse_tolerance_minutes || 0;

    // Snapshot data
    // CRITICAL FIX: Use satellitesTotal from debug state (matches UI), not satellites.length (rendered count)
    const totalSatellitesFromDebug = currentDebugEntry?.satellitesTotal ?? satellites.length;
    const snapshot = {
      year: currentYear,
      total_satellites: totalSatellitesFromDebug, // Use debug state, not rendered count
      satellites_per_shell: satellitesPerShell,
      total_orbital_power_MW: totalOrbitalPowerMW,
      total_orbital_power_GW: orbitalPowerGWSnapshot, // Added per CHART_AUDIT_AND_CONGESTION.md
      total_orbital_compute_PFLOPs: totalOrbitalComputePFLOPs,
      effective_compute_after_utilization: effectiveComputeAfterUtilization,
      total_ground_compute_PFLOPs: totalGroundComputePFLOPs,
      orbit_total_cost: orbitTotalCost,
      ground_total_cost: groundTotalCost,
      carbon_orbit: carbonOrbit,
      carbon_ground: carbonGround,
      avg_orbit_latency: avgOrbitLatency,
      avg_ground_latency: avgGroundLatency,
      congestion_index: congestionIndex,
      routing_distribution: routingDistribution,
      scenario_diagnostics: scenarioDiagnostics,
      // CRITICAL FIX: Add explicit compute per dollar calculations to ensure consistency with UI
      // UI calculates: computePerDollar = 1e9 / costPerPFLOP
      // Legacy (Renamed to CALIBRATED_COST_INDEX)
      CALIBRATED_COST_INDEX_GROUND: currentDebugEntry?.CALIBRATED_COST_INDEX_GROUND ?? null,
      CALIBRATED_COST_INDEX_ORBIT: currentDebugEntry?.CALIBRATED_COST_INDEX_ORBIT ?? null,
      CALIBRATED_COST_INDEX_MIX: currentDebugEntry?.CALIBRATED_COST_INDEX_MIX ?? null,
      
      // Physics-Based $/PFLOP (Section 4)
      physics_cost_per_pflop_year_ground: currentDebugEntry?.physics_cost_per_pflop_year_ground ?? null,
      physics_cost_per_pflop_year_orbit: currentDebugEntry?.physics_cost_per_pflop_year_orbit ?? null,
      physics_cost_per_pflop_year_mix: currentDebugEntry?.physics_cost_per_pflop_year_mix ?? null,
      
      physics_waterfall: {
        ground_energy: currentDebugEntry?.physics_ground_energy_cost,
        ground_hardware: currentDebugEntry?.physics_ground_hardware_cost,
        orbit_energy: currentDebugEntry?.physics_orbit_energy_cost,
        orbit_hardware: currentDebugEntry?.physics_orbit_hardware_cost,
        orbit_congestion: currentDebugEntry?.physics_orbit_congestion_cost,
        orbit_radiation_mult: currentDebugEntry?.physics_orbit_radiation_multiplier,
        orbit_thermal_cap: currentDebugEntry?.physics_orbit_thermal_cap_factor,
      },
      // Added per CHART_AUDIT_AND_CONGESTION.md
      power_per_sat_kw: powerPerSatKwSnapshot,
      shell_utilization: shellUtilization,
      debris_count: debrisCount,
      collision_risk_annual: collisionRisk,
      congestion_cost_usd: congestionCost,
      battery_density_wh_per_kg: batteryDensity,
      battery_cost_usd_per_kwh: batteryCost,
      battery_mass_per_sat_kg: batteryMassPerSat,
      battery_cost_per_sat_usd: batteryCostPerSat,
      eclipse_tolerance_minutes: eclipseTolerance,
    };

    // Time-series data
    const years: number[] = [];
    const orbitalCompute: number[] = [];
    const groundCompute: number[] = [];
    const orbitalPower: number[] = [];
    const orbitCost: number[] = [];
    const groundCost: number[] = [];
    const orbitLatency: number[] = [];
    const groundLatency: number[] = [];
    const orbitCarbon: number[] = [];
    const groundCarbon: number[] = [];
    const satelliteCounts: number[] = [];
    const physicsCostGround: number[] = [];
    const physicsCostOrbit: number[] = [];
    const physicsCostMix: number[] = [];
    // Scenario diagnostics time-series
    const scenarioModes: string[] = [];
    const launchCostsPerKg: (number | null)[] = [];
    const techProgressFactors: (number | null)[] = [];
    const failureRates: (number | null)[] = [];
    const maintenanceUtils: (number | null)[] = [];
    const backhaulUtils: (number | null)[] = [];
    const orbitCarbonIntensities: (number | null)[] = [];
    const orbitCostsPerCompute: (number | null)[] = [];
    const orbitComputeShares: (number | null)[] = [];
    const orbitEnergyShares: (number | null)[] = [];
    // Added per CHART_AUDIT_AND_CONGESTION.md
    const powerPerSatKw: number[] = [];
    const orbitalPowerGW: number[] = [];
    const shellUtilizationLEO340: number[] = [];
    const shellUtilizationLEO550: number[] = [];
    const shellUtilizationLEO1100: number[] = [];
    const shellUtilizationMEO: number[] = [];
    const debrisByYear: number[] = [];
    const congestionCostByYear: number[] = [];
    const batteryDensityByYear: number[] = [];
    const batteryCostByYear: number[] = [];
    const costPerKgToLeo: number[] = [];
    const costPerSatUsd: number[] = [];
    const launchMassPerYearKg: number[] = [];

    // Build time-series from debug state (single source of truth)
    // CRITICAL FIX: Use timeline years as primary source, fallback to debug state
    // Timeline is the source of truth for what years have been simulated
    const yearsToProcess = timeline.length > 0 
      ? timeline.map(s => s.year)
      : (debugYears.length > 0 ? debugYears : [currentYear]);
    
    yearsToProcess.forEach((year) => {
      // CRITICAL FIX: Get debug entry using scenario mode to ensure correct data
      // This ensures we get the right scenario's data, not stale data
      const debugEntry = getDebugStateEntry(year, config.scenarioMode);
      const timelineStep = timeline.find(s => s.year === year);
      
      years.push(year);
      
      // Prefer debug state, fallback to timeline
      if (debugEntry) {
        // Compute from debug state (convert FLOPS to PFLOPs)
        orbitalCompute.push((debugEntry.compute_exportable_flops || 0) / 1e15);
        groundCompute.push((debugEntry.compute_effective_flops || 0) / 1e15); // Use effective as ground proxy
        // Power from debug state (convert kW to MW)
        orbitalPower.push((debugEntry.power_total_kw || 0) / 1000);
        // Costs from debug state
        orbitCost.push(debugEntry.annual_opex_orbit || 0);
        groundCost.push(debugEntry.annual_opex_ground_all_ground || debugEntry.annual_opex_ground || 0);
        // Latency from debug state
        orbitLatency.push(debugEntry.latency_orbit_ms || 65);
        groundLatency.push(debugEntry.latency_ground_ms || 5);
        // Carbon from debug state (convert kg to tons)
        orbitCarbon.push((debugEntry.carbon_orbit || 0) / 1000);
        groundCarbon.push((debugEntry.carbon_ground || 0) / 1000);
        // Satellite counts from debug state
        satelliteCounts.push(debugEntry.satellitesTotal || 0);
        
        // Physics costs from debug state
        physicsCostGround.push(debugEntry.physics_cost_per_pflop_year_ground ?? 0);
        physicsCostOrbit.push(debugEntry.physics_cost_per_pflop_year_orbit ?? 0);
        physicsCostMix.push(debugEntry.physics_cost_per_pflop_year_mix ?? 0);
        
        // Scenario diagnostics from debug state
        scenarioModes.push(debugEntry.scenario_mode || config.scenarioMode || "BASELINE");
        launchCostsPerKg.push(debugEntry.launch_cost_per_kg ?? null);
        techProgressFactors.push(debugEntry.tech_progress_factor ?? null);
        failureRates.push(debugEntry.failure_rate_effective ?? null);
        maintenanceUtils.push(debugEntry.maintenance_utilization_percent ?? null);
        backhaulUtils.push(debugEntry.backhaul_utilization_percent ?? null);
        orbitCarbonIntensities.push(debugEntry.orbit_carbon_intensity ?? null);
        orbitCostsPerCompute.push(debugEntry.orbit_cost_per_compute ?? null);
        orbitComputeShares.push(debugEntry.orbit_compute_share ?? null);
        orbitEnergyShares.push(debugEntry.orbit_energy_share_twh ?? null);
        
        // Added per CHART_AUDIT_AND_CONGESTION.md
        const satCount = debugEntry.satellitesTotal || 0;
        powerPerSatKw.push(satCount > 0 ? (debugEntry.power_total_kw || 0) / satCount : 0);
        orbitalPowerGW.push(debugEntry.orbital_power_total_gw || (debugEntry.power_total_kw || 0) / 1000000);
        shellUtilizationLEO340.push(debugEntry.shell_utilization_by_altitude?.LEO_340 || 0);
        shellUtilizationLEO550.push(debugEntry.shell_utilization_by_altitude?.LEO_550 || 0);
        shellUtilizationLEO1100.push(debugEntry.shell_utilization_by_altitude?.LEO_1100 || 0);
        shellUtilizationMEO.push((debugEntry.shell_utilization_by_altitude?.MEO_8000 || 0) + (debugEntry.shell_utilization_by_altitude?.MEO_20000 || 0));
        debrisByYear.push(debugEntry.congestion_debris_count || 0);
        congestionCostByYear.push(debugEntry.congestion_cost_annual || 0);
        batteryDensityByYear.push(debugEntry.battery_density_wh_per_kg || 0);
        batteryCostByYear.push(debugEntry.battery_cost_usd_per_kwh || 0);
        costPerKgToLeo.push(debugEntry.cost_per_kg_to_leo || 0);
        costPerSatUsd.push(debugEntry.costPerSatellite || 0);
        launchMassPerYearKg.push(debugEntry.launchMassThisYearKg || 0);
      } else if (timelineStep) {
        // Fallback to timeline data
        orbitalCompute.push((timelineStep.orbitalComputeTwh || 0) * 1e3);
        groundCompute.push((timelineStep.netGroundComputeTwh || 0) * 1e3);
        // FIX: Use orbitalPowerGW from timeline if available, otherwise estimate from podsTotal
        // podsTotal * 0.1 gives MW, but we need to use actual power progression
        // Try to get power from timeline step if available, otherwise use a better estimate
        const timelinePowerMW = (timelineStep as any).orbitalPowerMW 
          || (timelineStep as any).power_total_kw / 1000
          || ((timelineStep.podsTotal || 0) * 0.15); // Better estimate: 150 kW per pod average
        orbitalPower.push(timelinePowerMW);
        orbitCost.push((timelineStep.opexMix || 0) - (timelineStep.opexGround || 0));
        groundCost.push(timelineStep.opexGround || 0);
        orbitLatency.push(timelineStep.latencyMixMs || 65);
        groundLatency.push(timelineStep.latencyGroundMs || 5);
        orbitCarbon.push((timelineStep.podsTotal || 0) * 1.19);
        groundCarbon.push(timelineStep.carbonGround || 0);
        satelliteCounts.push(timelineStep.podsTotal || 0);
        physicsCostGround.push(timelineStep.physics_cost_per_pflop_year_ground || 340);
        physicsCostOrbit.push(timelineStep.physics_cost_per_pflop_year_orbit || 1e7);
        physicsCostMix.push(timelineStep.physics_cost_per_pflop_year_mix || 340);
        
        // Scenario diagnostics from timeline
        const stepAny = timelineStep as any;
        scenarioModes.push(stepAny.scenario_mode || config.scenarioMode || "BASELINE");
        launchCostsPerKg.push(stepAny.launch_cost_per_kg ?? null);
        techProgressFactors.push(stepAny.tech_progress_factor ?? null);
        failureRates.push(stepAny.failure_rate_effective ?? null);
        maintenanceUtils.push(stepAny.maintenance_utilization_percent ?? null);
        backhaulUtils.push(stepAny.backhaul_utilization_percent ?? null);
        orbitCarbonIntensities.push(stepAny.orbit_carbon_intensity ?? null);
        orbitCostsPerCompute.push(stepAny.orbit_cost_per_compute ?? null);
        orbitComputeShares.push(stepAny.orbit_compute_share ?? null);
        orbitEnergyShares.push(stepAny.orbit_energy_share_twh ?? null);
      } else {
        // No data available for this year
        orbitalCompute.push(0);
        groundCompute.push(0);
        orbitalPower.push(0);
        orbitCost.push(0);
        groundCost.push(0);
        orbitLatency.push(65);
        groundLatency.push(5);
        orbitCarbon.push(0);
        groundCarbon.push(0);
        satelliteCounts.push(0);
        scenarioModes.push(config.scenarioMode || "BASELINE");
        launchCostsPerKg.push(null);
        techProgressFactors.push(null);
        failureRates.push(null);
        maintenanceUtils.push(null);
        backhaulUtils.push(null);
        orbitCarbonIntensities.push(null);
        orbitCostsPerCompute.push(null);
        orbitComputeShares.push(null);
        orbitEnergyShares.push(null);
        
        // Added per CHART_AUDIT_AND_CONGESTION.md - push nulls for missing data
        powerPerSatKw.push(0);
        orbitalPowerGW.push(0);
        shellUtilizationLEO340.push(0);
        shellUtilizationLEO550.push(0);
        shellUtilizationLEO1100.push(0);
        shellUtilizationMEO.push(0);
        debrisByYear.push(0);
        congestionCostByYear.push(0);
        batteryDensityByYear.push(0);
        batteryCostByYear.push(0);
        costPerKgToLeo.push(0);
        costPerSatUsd.push(0);
        launchMassPerYearKg.push(0);
      }
    });

    const timeSeries = {
      years,
      orbital_compute: orbitalCompute,
      ground_compute: groundCompute,
      orbital_power: orbitalPower,
      orbit_cost: orbitCost,
      ground_cost: groundCost,
      orbit_latency: orbitLatency,
      ground_latency: groundLatency,
      orbit_carbon: orbitCarbon,
      ground_carbon: groundCarbon,
      satellite_counts: satelliteCounts,
      physics_cost_ground: physicsCostGround,
      physics_cost_orbit: physicsCostOrbit,
      physics_cost_mix: physicsCostMix,
      // Scenario diagnostics time-series
      scenario_diagnostics: {
        scenario_mode: scenarioModes,
        launch_cost_per_kg: launchCostsPerKg,
        tech_progress_factor: techProgressFactors,
        failure_rate_effective: failureRates,
        maintenance_utilization_percent: maintenanceUtils,
        backhaul_utilization_percent: backhaulUtils,
        orbit_carbon_intensity: orbitCarbonIntensities,
        orbit_cost_per_compute: orbitCostsPerCompute,
        orbit_compute_share: orbitComputeShares,
        orbit_energy_share_twh: orbitEnergyShares,
      },
      // Added per CHART_AUDIT_AND_CONGESTION.md
      power_per_sat_kw: powerPerSatKw,
      orbital_power_gw: orbitalPowerGW,
      shell_utilization_by_year: {
        LEO_340: shellUtilizationLEO340,
        LEO_550: shellUtilizationLEO550,
        LEO_1100: shellUtilizationLEO1100,
        MEO: shellUtilizationMEO,
      },
      debris_by_year: debrisByYear,
      congestion_cost_by_year: congestionCostByYear,
      battery_density: batteryDensityByYear,
      battery_cost: batteryCostByYear,
      cost_per_kg_to_leo: costPerKgToLeo,
      cost_per_sat_usd: costPerSatUsd,
      launch_mass_per_year_kg: launchMassPerYearKg,
    };

    // Build physics series from debug state
    const physicsDebugYears = Object.keys(debugState)
      .filter(key => key !== 'errors' && !isNaN(Number(key)))
      .map(Number)
      .sort((a, b) => a - b)
      .map(year => debugState[year] as DebugStateEntry)
      .filter((entry): entry is DebugStateEntry => entry !== undefined);

    const physicsSeries = {
      computeDensity: buildComputeDensitySeries(physicsDebugYears),
      massFractions: buildMassFractionsSeries(physicsDebugYears),
      radiatorArea: buildRadiatorAreaSeries(physicsDebugYears),
      radiatorCompute: buildRadiatorComputeSeries(), // Add radiator vs compute series
      solarArea: buildSolarAreaSeries(physicsDebugYears),
      radiationDerating: buildRadiationDeratingSeries(physicsDebugYears),
      fleetCompute: buildFleetComputeSeries(physicsDebugYears),
      launch: buildLaunchSeries(physicsDebugYears),
      costDecomposition: buildCostDecompositionSeries(physicsDebugYears),
      thermalCeiling: buildThermalCeilingSeries(physicsDebugYears, 500),
      networking: buildNetworkingSeries(physicsDebugYears),
      bottlenecks: buildBottleneckSeries(physicsDebugYears),
      physicsVsGround: buildPhysicsVsGroundSeries(physicsDebugYears),
      // NEW: Add new chart series
      thermalConstraint: buildThermalConstraintSeries(config.scenarioMode),
      radiationDegradation: buildRadiationDegradationSeries(config.scenarioMode),
      costRealityWaterfall: buildCostRealityWaterfallSeries(config.scenarioMode),
    };

    // Add algorithms and configuration
    // CRITICAL: All algorithms are physics-based and derived from actual simulation calculations
    const algorithms = {
      scenarioParams: SCENARIOS,
      computeEfficiencyCurve: getEfficiencyCurveData(config.startYear, config.startYear + config.totalDeployments),
      physicsConstants: {
        TARGET_TEMP_C: 70,
        MAX_TEMP_C: 100,
        BASE_POD_POWER_KW: 100,
        FLOPS_PER_TBPS: 1000, // PFLOPs per TBps
        BACKHAUL_PER_SATELLITE_TBPS: 0.5,
        RADIATOR_KW_PER_M2: 0.5,
        ELECTRICAL_EFFICIENCY: 0.85,
        EMISSIVITY: 0.9,
      },
      costModel: {
        groundCostPerTwh: config.groundCostPerTwh,
        groundCarbonPerTwh: config.groundCarbonPerTwh,
        baseOrbitalCostPerTwh: config.baseOrbitalCostPerTwh,
        baseOrbitalCarbonPerTwh: config.baseOrbitalCarbonPerTwh,
      },
      // CRITICAL: Cost/Compute algorithms (physics-based)
      physicsCostPerPflopYear: {
        ground: {
          formula: "(electricityPricePerMwh * pue * 8760 * cf / gflopsPerW) * multipliers + hardwareCapex",
          description: "Truth source for compute economics"
        },
        orbit: {
          formula: "(orbitLcoe * pue * 8760 * cf / gflopsPerW) * radiationMultiplier + congestionCost",
          description: "Truth source for compute economics"
        }
      },
      CALIBRATED_COST_INDEX: {
        description: "Cost per compute unit ($/PFLOP) derived from physics-based satellite costs",
        ground: {
          formula: "baseGroundCostPerCompute * (1 - groundLearningRate)^yearIndex",
          baseGroundCostPerCompute: 340, // $/unit in 2025
          groundLearningRate: "scenario-dependent (0.02-0.05)",
          notes: "Ground cost declines with tech progress, scenario-dependent learning rate",
        },
        orbit: {
          formula: "cumulativeOrbitalCostUSD / cumulativeExportedPFLOPs * orbitScale * (1 - orbitLearningRate)^yearIndex",
          cumulativeOrbitalCostUSD: "sum of (launchCost + replacementCost) * radiatorCostMultiplier per year",
          cumulativeExportedPFLOPs: "sum of fleetTotalComputePFLOPsDerated per year",
          orbitScale: "calibration factor to match initialOrbitCostMultiple × ground cost in first year",
          orbitLearningRate: "scenario-dependent (0.03-0.08)",
          notes: "Orbit cost = cumulative capex amortized over cumulative compute exported, with learning curve",
        },
        mix: {
          formula: "groundComputeShare * cost_per_compute_ground + orbitComputeShare * cost_per_compute_orbit",
          notes: "Weighted average based on compute share",
        },
      },
      // CRITICAL: Latency algorithms (physics-based)
      latency: {
        description: "Latency (ms) based on physical distance and network topology",
        ground: {
          value: 120, // ms baseline
          formula: "BASE_GROUND_LATENCY * (1 + groundEnergyStress * 0.2)",
          notes: "Ground latency increases with energy stress (congestion)",
        },
        orbit: {
          value: 90, // ms baseline
          formula: "BASE_GROUND_LATENCY - 40 * orbitComputeShare + 5 * backlogFactor",
          notes: "Orbit latency improves with share (better routing), degrades with backlog",
        },
        mix: {
          formula: "groundComputeShare * latency_ground_ms + orbitComputeShare * latency_orbit_ms",
          notes: "Weighted average based on compute share",
        },
      },
      // CRITICAL: Annual OPEX algorithms (physics-based)
      annualOpex: {
        description: "Annual operational expenditure derived from physics-based power and costs",
        ground: {
          formula: "groundComputeShare * baseDemandTWh * groundCostPerTwh",
          baseDemandTWh: "baseDemandTWh0 * demandGrowthFactor",
          baseDemandTWh0: 10000, // TWh baseline
          groundCostPerTwh: 340, // $/TWh
          notes: "Ground OPEX = ground compute share × demand × cost per TWh",
        },
        orbit: {
          formula: "totalOrbitalCostThisYearUSD",
          totalOrbitalCostThisYearUSD: "(launchCostThisYearUSD + replacementCostUSD) * radiatorCostMultiplier",
          launchCostThisYearUSD: "launchMassThisYearKg * cost_per_kg_to_leo",
          replacementCostUSD: "replacementCadence * avgCostPerSatelliteUSD",
          radiatorCostMultiplier: "1.0 + totalRadiatorMassKg / 1_000_000",
          notes: "Orbit OPEX = launch costs + replacement costs, scaled by radiator mass",
        },
        mix: {
          formula: "annual_opex_ground + annual_opex_orbit",
          notes: "Sum of ground and orbital OPEX",
        },
      },
      // CRITICAL: Carbon algorithms (physics-based)
      carbon: {
        description: "Carbon emissions (kg CO2) derived from physics-based mass and energy",
        ground: {
          formula: "groundCarbonPerTwh",
          groundCarbonPerTwh: 400, // kg CO2 per TWh
          notes: "Ground carbon intensity (grid electricity)",
        },
        orbit: {
          formula: "totalOrbitalCarbonKgThisYear = launchCarbonKgThisYear + replacementCarbonKgThisYear",
          launchCarbonKgThisYear: "launchMassThisYearKg * launch_carbon_per_kg",
          replacementCarbonKgThisYear: "replacementCadence * avgMassPerSatelliteKg * launch_carbon_per_kg",
          launch_carbon_per_kg: "scenario-dependent (150-600 kg CO2/kg)",
          notes: "Orbit carbon = launch carbon (new + replacement), scenario-dependent intensity",
        },
        carbonIntensity: {
          formula: "cumulativeOrbitalCarbonKg * 1000 / cumulativeOrbitEnergyTwh",
          cumulativeOrbitalCarbonKg: "sum of totalOrbitalCarbonKgThisYear",
          cumulativeOrbitEnergyTwh: "sum of orbitEnergyServedTwhThisYear",
          orbitEnergyServedTwhThisYear: "(power_total_kw * 8760 hours) / 10^9",
          notes: "Carbon intensity = total carbon / total energy served (kg CO2/kWh)",
        },
        mix: {
          formula: "groundComputeShare * carbon_ground + orbitComputeShare * carbon_orbit",
          notes: "Weighted average based on compute share",
        },
      },
      config: {
        startYear: config.startYear,
        totalDeployments: config.totalDeployments,
        groundBaseTwh: config.groundBaseTwh,
        groundDemandGrowthRate: config.groundDemandGrowthRate,
        groundEfficiencyGainRate: config.groundEfficiencyGainRate,
        maxOffloadShare: config.maxOffloadShare,
        scenarioMode: config.scenarioMode,
      },
    };

    // Combine snapshot, time-series, physics series, and algorithms
    const exportData = {
      snapshot,
      time_series: timeSeries,
      physics: physicsSeries,
      algorithms,
    };

    // Export as JSON
    const jsonBlob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement("a");
    jsonLink.href = jsonUrl;
    jsonLink.download = `orbital-sim-export-${currentYear}.json`;
    jsonLink.click();
    URL.revokeObjectURL(jsonUrl);

    // Export as CSV
    const csvRows: string[] = [];
    
    // Snapshot CSV
    csvRows.push("Type,Field,Value");
    csvRows.push(`Snapshot,year,${snapshot.year}`);
    csvRows.push(`Snapshot,total_satellites,${snapshot.total_satellites}`);
    csvRows.push(`Snapshot,total_orbital_power_MW,${snapshot.total_orbital_power_MW}`);
    csvRows.push(`Snapshot,total_orbital_compute_PFLOPs,${snapshot.total_orbital_compute_PFLOPs}`);
    csvRows.push(`Snapshot,effective_compute_after_utilization,${snapshot.effective_compute_after_utilization}`);
    csvRows.push(`Snapshot,total_ground_compute_PFLOPs,${snapshot.total_ground_compute_PFLOPs}`);
    csvRows.push(`Snapshot,orbit_total_cost,${snapshot.orbit_total_cost}`);
    csvRows.push(`Snapshot,ground_total_cost,${snapshot.ground_total_cost}`);
    csvRows.push(`Snapshot,carbon_orbit,${snapshot.carbon_orbit}`);
    csvRows.push(`Snapshot,carbon_ground,${snapshot.carbon_ground}`);
    csvRows.push(`Snapshot,avg_orbit_latency,${snapshot.avg_orbit_latency}`);
    csvRows.push(`Snapshot,avg_ground_latency,${snapshot.avg_ground_latency}`);
    csvRows.push(`Snapshot,congestion_index,${snapshot.congestion_index}`);
    csvRows.push(`Snapshot,routing_distribution_edge_pct,${snapshot.routing_distribution.edge_pct}`);
    csvRows.push(`Snapshot,routing_distribution_core_pct,${snapshot.routing_distribution.core_pct}`);
    csvRows.push(`Snapshot,routing_distribution_orbit_pct,${snapshot.routing_distribution.orbit_pct}`);
    csvRows.push(`Snapshot,satellites_per_shell_VLEO,${snapshot.satellites_per_shell.VLEO}`);
    csvRows.push(`Snapshot,satellites_per_shell_MID-LEO,${snapshot.satellites_per_shell["MID-LEO"]}`);
    csvRows.push(`Snapshot,satellites_per_shell_SSO,${snapshot.satellites_per_shell.SSO}`);
    csvRows.push(`Snapshot,satellites_per_shell_MEO,${snapshot.satellites_per_shell.MEO}`);
    
    // Time-series CSV
    csvRows.push("");
    csvRows.push("TimeSeries,year,orbital_compute,ground_compute,orbital_power,orbit_cost,ground_cost,orbit_latency,ground_latency,orbit_carbon,ground_carbon,satellite_counts,scenario_mode,launch_cost_per_kg,tech_progress_factor,failure_rate_effective,maintenance_utilization_percent,backhaul_utilization_percent,orbit_carbon_intensity,orbit_cost_per_compute,orbit_compute_share,orbit_energy_share_twh");
    for (let i = 0; i < years.length; i++) {
      csvRows.push(
        `TimeSeries,${years[i]},${orbitalCompute[i]},${groundCompute[i]},${orbitalPower[i]},${orbitCost[i]},${groundCost[i]},${orbitLatency[i]},${groundLatency[i]},${orbitCarbon[i]},${groundCarbon[i]},${satelliteCounts[i]},${scenarioModes[i] || ""},${launchCostsPerKg[i] ?? ""},${techProgressFactors[i] ?? ""},${failureRates[i] ?? ""},${maintenanceUtils[i] ?? ""},${backhaulUtils[i] ?? ""},${orbitCarbonIntensities[i] ?? ""},${orbitCostsPerCompute[i] ?? ""},${orbitComputeShares[i] ?? ""},${orbitEnergyShares[i] ?? ""}`
      );
    }
    
    // Add scenario diagnostics to snapshot CSV
    if (scenarioDiagnostics) {
      csvRows.push("");
      csvRows.push("ScenarioDiagnostics,field,value");
      csvRows.push(`ScenarioDiagnostics,scenario_mode,${scenarioDiagnostics.scenario_mode || ""}`);
      csvRows.push(`ScenarioDiagnostics,launch_cost_per_kg,${scenarioDiagnostics.launch_cost_per_kg ?? ""}`);
      csvRows.push(`ScenarioDiagnostics,tech_progress_factor,${scenarioDiagnostics.tech_progress_factor ?? ""}`);
      csvRows.push(`ScenarioDiagnostics,failure_rate_effective,${scenarioDiagnostics.failure_rate_effective ?? ""}`);
      csvRows.push(`ScenarioDiagnostics,maintenance_utilization_percent,${scenarioDiagnostics.maintenance_utilization_percent ?? ""}`);
      csvRows.push(`ScenarioDiagnostics,backhaul_utilization_percent,${scenarioDiagnostics.backhaul_utilization_percent ?? ""}`);
      csvRows.push(`ScenarioDiagnostics,orbit_carbon_intensity,${scenarioDiagnostics.orbit_carbon_intensity ?? ""}`);
      csvRows.push(`ScenarioDiagnostics,orbit_cost_per_compute,${scenarioDiagnostics.orbit_cost_per_compute ?? ""}`);
      csvRows.push(`ScenarioDiagnostics,orbit_compute_share,${scenarioDiagnostics.orbit_compute_share ?? ""}`);
      csvRows.push(`ScenarioDiagnostics,orbit_energy_share_twh,${scenarioDiagnostics.orbit_energy_share_twh ?? ""}`);
    }

    const csvBlob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const csvUrl = URL.createObjectURL(csvBlob);
    const csvLink = document.createElement("a");
    csvLink.href = csvUrl;
    csvLink.download = `orbital-sim-export-${currentYear}.csv`;
    csvLink.click();
    URL.revokeObjectURL(csvUrl);
  };

  return (
      <button
        onClick={handleExport}
        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition shadow-lg"
        title="Export debug snapshot as JSON and CSV"
      >
        📥 Export Debug Data
      </button>
  );
}

