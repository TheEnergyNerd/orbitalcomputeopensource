"use client";

import { useMemo } from "react";
import { getDebugState } from "../lib/orbitSim/debugState";
import type { DebugStateEntry } from "../lib/orbitSim/debugState";
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
import PhysicsChart from "./orbitSim/PhysicsChart";

export default function PhysicsLimitsTab() {
  // Get years from debug state
  const years = useMemo(() => {
    try {
      const debugState = getDebugState();
      if (!debugState) return [];

      const yearKeys = Object.keys(debugState)
        .filter(key => key !== "errors" && !isNaN(Number(key)))
        .map(Number)
        .sort((a, b) => a - b);

      return yearKeys
        .map(year => debugState[year] as DebugStateEntry)
        .filter((entry): entry is DebugStateEntry => entry !== undefined);
    } catch (e) {
      console.warn("[PhysicsLimitsTab] Failed to get debug state:", e);
      return [];
    }
  }, []);

  const computeDensity = useMemo(() => buildComputeDensitySeries(years), [years]);
  const massFractions = useMemo(() => buildMassFractionsSeries(years), [years]);
  const radiatorArea = useMemo(() => buildRadiatorAreaSeries(years), [years]);
  const solarArea = useMemo(() => buildSolarAreaSeries(years), [years]);
  const radDerating = useMemo(() => buildRadiationDeratingSeries(years), [years]);
  const fleetCompute = useMemo(() => buildFleetComputeSeries(years), [years]);
  const launchSeries = useMemo(() => buildLaunchSeries(years), [years]);
  const costDecomp = useMemo(() => buildCostDecompositionSeries(years), [years]);
  const thermalCeiling = useMemo(() => buildThermalCeilingSeries(years, 500.0), [years]);
  const networking = useMemo(() => buildNetworkingSeries(years), [years]);
  const bottlenecks = useMemo(() => buildBottleneckSeries(years), [years]);
  const physicsVsGround = useMemo(() => buildPhysicsVsGroundSeries(years), [years]);

  if (years.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400">
        No simulation data available. Run a simulation to see physics metrics.
      </div>
    );
  }

  return (
    <div className="pt-20 sm:pt-24 px-4 sm:px-6 pb-8 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 1. Compute density */}
        <PhysicsChart
          title="Compute Density (TFLOPs/kg)"
          data={computeDensity}
          dataKeys={[
            { key: "tflops_per_kg", label: "Effective TFLOPs/kg", color: "#06b6d4" },
          ]}
        />

        {/* 2. Mass fractions */}
        <PhysicsChart
          title="Sat Mass Fractions"
          data={massFractions}
          dataKeys={[
            { key: "silicon", label: "Silicon", color: "#3b82f6", type: "area" },
            { key: "radiator", label: "Radiator", color: "#ef4444", type: "area" },
            { key: "solar", label: "Solar", color: "#f59e0b", type: "area" },
            { key: "structure", label: "Structure", color: "#8b5cf6", type: "area" },
            { key: "shielding", label: "Shielding", color: "#10b981", type: "area" },
            { key: "power_electronics", label: "Power", color: "#6366f1", type: "area" },
          ]}
          stacked={true}
          yAxisFormatter={(v) => `${Math.round(v * 100)}%`}
        />

        {/* 3. Radiator area */}
        <PhysicsChart
          title="Radiator Area: Required vs Feasible"
          data={radiatorArea}
          dataKeys={[
            { key: "required_m2", label: "Required (fleet)", color: "#ef4444" },
            { key: "feasible_m2", label: "Feasible (fleet cap)", color: "#10b981" },
          ]}
        />

        {/* 4. Solar area vs power */}
        <PhysicsChart
          title="Solar Array Area vs Power"
          data={solarArea}
          dataKeys={[
            { key: "solar_area_m2", label: "Solar Area (m²)", color: "#f59e0b" },
            { key: "power_kw", label: "Bus Power (kW - fleet)", color: "#3b82f6" },
          ]}
        />

        {/* 5. Radiation derating */}
        <PhysicsChart
          title="Radiation Derating & Availability"
          data={radDerating}
          dataKeys={[
            { key: "tflops_nominal", label: "Nominal TFLOPs/sat", color: "#3b82f6" },
            { key: "tflops_derated", label: "Derated TFLOPs/sat", color: "#ef4444" },
            { key: "availability", label: "Availability", color: "#10b981" },
          ]}
        />

        {/* 7. Fleet effective compute */}
        <PhysicsChart
          title="Fleet Effective Compute (PFLOPs)"
          data={fleetCompute}
          dataKeys={[
            { key: "nominal_pflops", label: "Nominal", color: "#3b82f6" },
            { key: "derated_pflops", label: "Derated", color: "#f59e0b" },
            { key: "effective_pflops", label: "Effective", color: "#10b981" },
          ]}
        />

        {/* 8. Launch mass, cost, carbon */}
        <PhysicsChart
          title="Launch Mass, Cost & Carbon"
          data={launchSeries}
          dataKeys={[
            { key: "mass_launched_tons", label: "Mass Launched (tons)", color: "#3b82f6", type: "bar" },
            { key: "launch_cost_musd", label: "Launch Cost (MUSD)", color: "#f59e0b", type: "bar" },
            { key: "launch_carbon_kt", label: "Launch Carbon (kt CO₂e)", color: "#ef4444", type: "bar" },
          ]}
        />

        {/* 9. Cost-per-compute decomposition */}
        <PhysicsChart
          title="Cost-per-Compute Decomposition (Orbit)"
          data={costDecomp}
          dataKeys={[
            { key: "launch", label: "Launch", color: "#3b82f6", type: "area" },
            { key: "orbit_opex", label: "Orbit Opex", color: "#f59e0b", type: "area" },
            { key: "ground_opex", label: "Ground Opex (fallback)", color: "#ef4444", type: "area" },
          ]}
          stacked={true}
          yAxisFormatter={(v) => `$${v.toFixed(0)}`}
        />

        {/* 10. Thermal ceiling */}
        <PhysicsChart
          title="Thermal Ceiling (Heat Flux)"
          data={thermalCeiling}
          dataKeys={[
            { key: "required_w_m2", label: "Required W/m²", color: "#ef4444" },
            { key: "max_w_m2", label: "Max Radiator W/m²", color: "#10b981" },
          ]}
        />

        {/* 11. Networking bottleneck */}
        <PhysicsChart
          title="Networking Bottleneck"
          data={networking}
          dataKeys={[
            { key: "exportable_pflops", label: "Exportable PFLOPs", color: "#3b82f6" },
            { key: "backhaul_tbps", label: "Backhaul (Tbps)", color: "#f59e0b" },
          ]}
        />

        {/* 12. Bottlenecks normalized */}
        <PhysicsChart
          title="Constraint Utilization"
          data={bottlenecks}
          dataKeys={[
            { key: "heat", label: "Heat", color: "#ef4444" },
            { key: "backhaul", label: "Backhaul", color: "#3b82f6" },
            { key: "autonomy", label: "Autonomy", color: "#10b981" },
            { key: "manufacturing", label: "Manufacturing", color: "#f59e0b" },
            { key: "maintenance", label: "Maintenance", color: "#8b5cf6" },
          ]}
          yAxisFormatter={(v) => `${Math.round(v * 100)}%`}
        />

        {/* 13. Physics-limited orbit vs ground */}
        <PhysicsChart
          title="Physics-Limited Cost/Compute: Orbit vs Ground"
          data={physicsVsGround}
          dataKeys={[
            { key: "cost_ground", label: "Texas Ground", color: "#ef4444" },
            { key: "cost_orbit_physics", label: "Orbit (Physics)", color: "#10b981" },
          ]}
          yAxisFormatter={(v) => `$${v.toFixed(0)}`}
        />
      </div>
    </div>
  );
}

