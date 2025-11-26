"use client";

import { useSimStore } from "../store/simStore";

interface EnhancedSatelliteDetailProps {
  satelliteId: string;
  onClose: () => void;
}

export default function EnhancedSatelliteDetail({ satelliteId, onClose }: EnhancedSatelliteDetailProps) {
  const state = useSimStore((s) => s.state);
  const sat = state?.satellites.find((s) => s.id === satelliteId);
  
  if (!sat) return null;

  // Calculate metrics
  const groundLoadIncrease = sat.capacityMw * 0.8; // If this unit didn't exist, ground would need this
  const carbonIncrease = groundLoadIncrease * 300; // kg/MWh average

  // Calculate eclipse countdown (simplified - would use actual orbital mechanics)
  const isInEclipse = !sat.sunlit;
  const eclipseDuration = isInEclipse ? "18 min" : "0 min";
  const nextEclipse = isInEclipse ? "Now" : "~45 min";

  return (
    <div className="fixed top-1/2 right-6 -translate-y-1/2 panel-glass rounded-2xl p-6 w-96 z-50 shadow-2xl border border-white/10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs uppercase text-gray-400 tracking-[0.2em] mb-1">Orbital Compute Unit</div>
          <h2 className="text-2xl font-semibold text-white">{sat.id}</h2>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
      </div>

      {/* Status Badge */}
      <div className={`mb-4 px-3 py-2 rounded-lg text-sm font-semibold ${
        sat.sunlit 
          ? "bg-accent-green/20 text-accent-green border border-accent-green/50"
          : "bg-accent-orange/20 text-accent-orange border border-accent-orange/50"
      }`}>
        {sat.sunlit ? "☀️ Sunlit" : "🌑 In Eclipse"}
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricCard label="Altitude" value={`${sat.alt_km.toFixed(0)} km`} color="accent-blue" />
        <MetricCard label="Capacity" value={`${sat.capacityMw >= 0.001 ? sat.capacityMw.toFixed(3) : sat.capacityMw.toFixed(4)} MW`} color="accent-green" />
        <MetricCard label="Utilization" value={`${(sat.utilization * 100).toFixed(1)}%`} color="accent-orange" />
        <MetricCard label="Latency" value={`${sat.latencyMs.toFixed(1)} ms`} color="accent-blue" />
      </div>

      {/* Eclipse Info */}
      <div className="mb-4 p-3 bg-gray-800/50 rounded-lg">
        <div className="text-xs text-gray-400 mb-2">Eclipse Status</div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-300">Current:</span>
            <span className={isInEclipse ? "text-accent-orange font-semibold" : "text-accent-green font-semibold"}>
              {isInEclipse ? "In Shadow" : "Sunlit"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-300">Duration:</span>
            <span className="text-white">{eclipseDuration}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-300">Next Eclipse:</span>
            <span className="text-white">{nextEclipse}</span>
          </div>
        </div>
      </div>

      {/* Impact Analysis */}
      <div className="mb-4 p-3 bg-accent-blue/10 border border-accent-blue/30 rounded-lg">
        <div className="text-xs text-gray-400 mb-2">If This Unit Didn't Exist</div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-300">Ground Load Increase:</span>
            <span className="text-accent-orange font-semibold">+{groundLoadIncrease.toFixed(2)} MW</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-300">Carbon Increase:</span>
            <span className="text-accent-orange font-semibold">+{carbonIncrease.toFixed(0)} kg/day</span>
          </div>
        </div>
      </div>

      {/* Latency to Regions */}
      <div className="mb-4">
        <div className="text-xs text-gray-400 mb-2">Latency to Ground Regions</div>
        <div className="space-y-1 text-xs">
          {state?.groundSites.slice(0, 4).map((site) => {
            // Simplified latency calculation
            const distance = Math.sqrt(
              Math.pow(sat.lat - site.lat, 2) + Math.pow(sat.lon - site.lon, 2)
            );
            const latency = Math.round(distance * 0.5 + sat.latencyMs);
            return (
              <div key={site.id} className="flex justify-between">
                <span className="text-gray-400">{site.label}:</span>
                <span className="text-accent-blue font-semibold">{latency} ms</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gateway */}
      <div className="text-xs text-gray-400">
        Gateway: <span className="text-white font-semibold">{sat.nearestGatewayId}</span>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorClasses = {
    "accent-blue": "text-accent-blue",
    "accent-green": "text-accent-green",
    "accent-orange": "text-accent-orange",
  };
  return (
    <div className="p-2 bg-gray-800/50 rounded">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-sm font-bold ${colorClasses[color as keyof typeof colorClasses]}`}>
        {value}
      </div>
    </div>
  );
}

