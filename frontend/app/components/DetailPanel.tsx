"use client";

import { useEffect, useState } from "react";
import { useSimStore } from "../store/simStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";

const compareLevels = [0.25, 0.5, 0.75];

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-semibold">{value}</span>
    </div>
  );
}

export default function DetailPanel() {
  const state = useSimStore((s) => s.state);
  const selectedEntity = useSimStore((s) => s.selectedEntity);
  const { getDeployedUnits } = useOrbitalUnitsStore();
  const [showCompare, setShowCompare] = useState(false);

  useEffect(() => {
    setShowCompare(false);
  }, [selectedEntity?.id]);

  if (!state || !selectedEntity) return null;

  // Check if this is a deployed unit satellite
  if (selectedEntity.type === "satellite" && (selectedEntity as any).unitId) {
    const deployedUnits = getDeployedUnits();
    const unit = deployedUnits.find(u => u.id === (selectedEntity as any).unitId);
    if (unit) {
      return (
        <div className="fixed bottom-6 left-6 panel-glass rounded-2xl p-5 w-72 sm:w-80 max-w-[calc(100vw-12px)] z-[120] shadow-2xl border border-white/10">
          <div className="text-xs uppercase text-gray-400 tracking-[0.2em] mb-1">Deployed Orbital Unit</div>
          <h2 className="text-2xl font-semibold text-white mb-4">{unit.name}</h2>

          <div className="space-y-2">
            <Metric label="Type" value={unit.type.replace('_', ' ').toUpperCase()} />
            <Metric label="Power Output" value={`${unit.powerOutputMw.toFixed(2)} MW`} />
            <Metric label="Latency" value={`${unit.latencyMs.toFixed(1)} ms`} />
            <Metric label="Lifetime" value={`${unit.lifetimeYears} years`} />
            <Metric label="Status" value={unit.status} />
            {unit.deployedAt && (
              <Metric label="Deployed" value={new Date(unit.deployedAt).toLocaleDateString()} />
            )}
          </div>
        </div>
      );
    }
  }

  if (selectedEntity.type === "ground") {
    const site = state.groundSites.find((s) => s.id === selectedEntity.id);
    if (!site) return null;

    return (
      <div className="fixed bottom-0 left-0 right-0 sm:bottom-6 sm:left-6 sm:right-auto sm:w-72 sm:w-80 panel-glass rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 max-w-full sm:max-w-[calc(100vw-12px)] z-[120] shadow-2xl border border-white/10">
        <div className="text-xs uppercase text-gray-400 tracking-[0.2em] mb-1">Ground Site</div>
        <h2 className="text-2xl font-semibold text-white mb-4">{site.label}</h2>

        <div className="space-y-2">
          <Metric label="Total Power" value={`${site.powerMw.toFixed(1)} MW`} />
          <Metric label="Active Jobs" value={`${site.jobsRunning}`} />
          <Metric label="Energy Price" value={`$${site.energyPrice.toFixed(2)}/MWh`} />
          <Metric label="Carbon" value={`${site.carbonIntensity.toFixed(1)} kg/MWh`} />
        </div>

        <button
          className="text-xs text-accent-blue mt-4 hover:text-white transition"
          onClick={() => setShowCompare((prev) => !prev)}
        >
          {showCompare ? "Hide orbit comparison ▲" : "Compare to orbit ▸"}
        </button>

        {showCompare && (
          <div className="mt-3 space-y-1 text-xs text-gray-300">
            {compareLevels.map((level) => (
              <div key={level} className="flex justify-between">
                <span>Move {(level * 100).toFixed(0)}%</span>
                <span className="text-accent-blue">
                  -{(site.powerMw * level).toFixed(1)} MW &nbsp;|&nbsp; -{(site.jobsRunning * level).toFixed(0)} jobs
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (selectedEntity.type === "satellite") {
    // Try multiple ID formats to find the satellite
    let sat = state.satellites.find((s) => s.id === selectedEntity.id);
    if (!sat) {
      // Try with sat_ prefix
      sat = state.satellites.find((s) => s.id === `sat_${selectedEntity.id}`);
    }
    if (!sat) {
      // Try without sat_ prefix
      sat = state.satellites.find((s) => s.id === selectedEntity.id.replace(/^sat_/, ""));
    }
    if (!sat) {
      console.warn("[DetailPanel] Could not find satellite with ID:", selectedEntity.id, "Available satellites:", state.satellites.length);
      // Show a placeholder card even if satellite not found
      return (
        <div className="fixed bottom-6 left-6 panel-glass rounded-2xl p-5 w-72 sm:w-80 max-w-[calc(100vw-12px)] z-[120] shadow-2xl border border-white/10">
          <div className="text-xs uppercase text-gray-400 tracking-[0.2em] mb-1">Orbital Node</div>
          <h2 className="text-2xl font-semibold text-white mb-4">{selectedEntity.id}</h2>
          <div className="text-sm text-gray-400">Satellite data loading...</div>
        </div>
      );
    }

    return (
      <div className="fixed bottom-6 left-6 panel-glass rounded-2xl p-5 w-72 sm:w-80 max-w-[calc(100vw-12px)] z-[120] shadow-2xl border border-white/10">
        <div className="text-xs uppercase text-gray-400 tracking-[0.2em] mb-1">Orbital Node</div>
        <h2 className="text-2xl font-semibold text-white mb-4">{sat.id}</h2>

        <div className="space-y-2">
          <Metric label="Altitude" value={`${sat.alt_km.toFixed(0)} km`} />
          <Metric label="Utilization" value={`${(sat.utilization * 100).toFixed(1)}%`} />
          <Metric label="Capacity" value={`${sat.capacityMw >= 0.001 ? sat.capacityMw.toFixed(3) : sat.capacityMw.toFixed(4)} MW`} />
          <Metric label="Latency" value={`${sat.latencyMs.toFixed(1)} ms`} />
          <Metric label="Gateway" value={sat.nearestGatewayId} />
        </div>
      </div>
    );
  }

  return null;
}

