"use client";

import { useSimulationStore } from "../store/simulationStore";
import { useOrbitSim } from "../state/orbitStore";
import { useSimStore } from "../store/simStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { calculateComputeFromPower } from "../lib/orbitSim/computeEfficiency";
import { getOrbitalCostPerTFLOP } from "../lib/orbitSim/orbitalCostModel";
import { usePathname } from "next/navigation";

export default function DebugExportPanel() {
  const pathname = usePathname();
  
  // Only show on /data route
  if (pathname !== "/data") {
    return null;
  }
  const { timeline, config } = useSimulationStore();
  const { satellites, routes } = useOrbitSim();
  const simState = useSimStore((s) => s.state);
  const { getDeployedUnits } = useOrbitalUnitsStore();

  const handleExport = () => {
    // Get current year
    const currentYear = timeline.length > 0 
      ? timeline[timeline.length - 1]?.year || config.startYear
      : config.startYear;

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

    // Calculate total orbital power (100kW per satellite = 0.1 MW)
    const totalOrbitalPowerMW = satellites.length * 0.1;

    // Calculate total orbital compute using power-first model
    const powerWatts = totalOrbitalPowerMW * 1e6; // Convert MW to watts
    const totalOrbitalComputePFLOPs = calculateComputeFromPower(powerWatts, currentYear);

    // Get utilization multiplier (simplified - would need actual strategy from simulation)
    const utilizationMultiplier = 0.82; // Cost strategy default
    const effectiveComputeAfterUtilization = totalOrbitalComputePFLOPs * utilizationMultiplier;

    // Ground compute from timeline (convert TWh to PFLOPs)
    const lastStep = timeline.length > 0 ? timeline[timeline.length - 1] : null;
    const totalGroundComputePFLOPs = lastStep?.netGroundComputeTwh 
      ? lastStep.netGroundComputeTwh * 1e3 // Convert TWh to PFLOPs (1 TWh = 1000 PFLOPs)
      : 0;

    // Costs from timeline or calculate from cost per TFLOP
    const orbitCostPerTFLOP = getOrbitalCostPerTFLOP(currentYear);
    const orbitTotalCost = totalOrbitalComputePFLOPs * orbitCostPerTFLOP * 1e3; // Convert PFLOPs to TFLOPs
    const groundTotalCost = lastStep?.opexGround || 0;

    // Carbon (amortized launch carbon per satellite)
    const carbonOrbit = satellites.length * 1.19; // tons/year per satellite (amortized launch)
    const carbonGround = lastStep?.carbonGround || 0;

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

    // Snapshot data
    const snapshot = {
      year: currentYear,
      total_satellites: satellites.length,
      satellites_per_shell: satellitesPerShell,
      total_orbital_power_MW: totalOrbitalPowerMW,
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

    timeline.forEach((step) => {
      years.push(step.year);
      // Convert TWh to PFLOPs (1 TWh = 1000 PFLOPs)
      orbitalCompute.push((step.orbitalComputeTwh || 0) * 1e3);
      groundCompute.push((step.netGroundComputeTwh || 0) * 1e3);
      orbitalPower.push((step.podsTotal || 0) * 0.1); // 0.1 MW per pod
      // Use OPEX as cost proxy
      orbitCost.push((step.opexMix || 0) - (step.opexGround || 0)); // Orbital cost = mix - ground
      groundCost.push(step.opexGround || 0);
      orbitLatency.push(step.latencyMixMs || 65); // Use mix latency as proxy
      groundLatency.push(step.latencyGroundMs || 5);
      orbitCarbon.push((step.podsTotal || 0) * 1.19); // Amortized launch carbon
      groundCarbon.push(step.carbonGround || 0);
      satelliteCounts.push(step.podsTotal || 0);
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
    };

    // Combine snapshot and time-series
    const exportData = {
      snapshot,
      time_series: timeSeries,
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
    csvRows.push("TimeSeries,year,orbital_compute,ground_compute,orbital_power,orbit_cost,ground_cost,orbit_latency,ground_latency,orbit_carbon,ground_carbon,satellite_counts");
    for (let i = 0; i < years.length; i++) {
      csvRows.push(
        `TimeSeries,${years[i]},${orbitalCompute[i]},${groundCompute[i]},${orbitalPower[i]},${orbitCost[i]},${groundCost[i]},${orbitLatency[i]},${groundLatency[i]},${orbitCarbon[i]},${groundCarbon[i]},${satelliteCounts[i]}`
      );
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
    <div className="fixed bottom-4 left-4 z-50 pointer-events-auto">
      <button
        onClick={handleExport}
        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition shadow-lg"
        title="Export debug snapshot as JSON and CSV"
      >
        📥 Export Debug Data
      </button>
    </div>
  );
}

