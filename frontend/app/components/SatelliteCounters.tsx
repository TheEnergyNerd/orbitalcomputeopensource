"use client";

import { useOrbitSim } from "../state/orbitStore";
import { useSimStore } from "../store/simStore";
import { useMemo } from "react";

/**
 * Mandatory numeric counters that must always be visible
 * Even when rendering all satellites, human eyes cannot estimate density accurately
 */
export function SatelliteCounters() {
  const satellites = useOrbitSim((s) => s.satellites);
  const routes = useOrbitSim((s) => s.routes);
  const simState = useSimStore((s) => s.state);
  
  // Calculate metrics
  const metrics = useMemo(() => {
    const totalSatellites = satellites.length;
    
    // Calculate total orbital power (assuming 100kW per satellite)
    const totalOrbitalPowerMW = (totalSatellites * 0.1); // 100kW = 0.1MW
    const totalOrbitalPowerGW = totalOrbitalPowerMW / 1000;
    
    // Calculate total orbital compute (PFLOPs)
    // Using efficiency curve: ~12.5 W/TFLOP in 2025, improving over time
    const efficiencyWPerTFLOP = 12.5; // Simplified for now
    const totalOrbitalComputeTFLOPs = (totalOrbitalPowerMW * 1000 * 1000) / efficiencyWPerTFLOP; // Convert MW to W, then to TFLOPs
    const totalOrbitalComputePFLOPs = totalOrbitalComputeTFLOPs / 1000;
    
    // Active routes
    const activeRoutes = routes.length;
    
    // Calculate congestion index (simplified: routes per satellite)
    const congestionIndex = totalSatellites > 0 ? activeRoutes / totalSatellites : 0;
    
    // Count satellites per shell
    const satellitesPerShell = {
      LEO: 0,
      MEO: 0,
      GEO: 0,
    };
    
    satellites.forEach(sat => {
      const alt = sat.orbitalState?.altitudeRadius || 700;
      if (alt >= 2000) satellitesPerShell.GEO++;
      else if (alt >= 1000) satellitesPerShell.MEO++;
      else satellitesPerShell.LEO++;
    });
    
    return {
      totalSatellites,
      totalOrbitalPowerMW,
      totalOrbitalPowerGW,
      totalOrbitalComputePFLOPs,
      activeRoutes,
      congestionIndex,
      satellitesPerShell,
    };
  }, [satellites, routes]);
  
  return (
    <div className="fixed top-4 right-4 z-50 panel-glass rounded-lg p-4 shadow-xl border border-white/10 min-w-[280px]">
      <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase">Orbital System Status</h3>
      
      <div className="space-y-2 text-xs">
        {/* Total Satellites */}
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Total Satellites:</span>
          <span className="text-white font-mono font-semibold">{metrics.totalSatellites.toLocaleString()}</span>
        </div>
        
        {/* Satellites per Shell */}
        <div className="flex justify-between items-center pl-2 border-l-2 border-cyan-500/30">
          <span className="text-gray-400 text-[10px]">LEO:</span>
          <span className="text-cyan-400 font-mono">{metrics.satellitesPerShell.LEO.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center pl-2 border-l-2 border-green-500/30">
          <span className="text-gray-400 text-[10px]">MEO:</span>
          <span className="text-green-400 font-mono">{metrics.satellitesPerShell.MEO.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center pl-2 border-l-2 border-purple-500/30">
          <span className="text-gray-400 text-[10px]">GEO:</span>
          <span className="text-purple-400 font-mono">{metrics.satellitesPerShell.GEO.toLocaleString()}</span>
        </div>
        
        {/* Total Orbital Power */}
        <div className="flex justify-between items-center pt-2 border-t border-white/10">
          <span className="text-gray-400">Orbital Power:</span>
          <span className="text-white font-mono font-semibold">
            {metrics.totalOrbitalPowerGW >= 1 
              ? `${metrics.totalOrbitalPowerGW.toFixed(2)} GW`
              : `${metrics.totalOrbitalPowerMW.toFixed(1)} MW`
            }
          </span>
        </div>
        
        {/* Total Orbital Compute */}
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Orbital Compute:</span>
          <span className="text-white font-mono font-semibold">
            {metrics.totalOrbitalComputePFLOPs >= 1
              ? `${metrics.totalOrbitalComputePFLOPs.toFixed(2)} PFLOPs`
              : `${(metrics.totalOrbitalComputePFLOPs * 1000).toFixed(1)} TFLOPs`
            }
          </span>
        </div>
        
        {/* Active Routes */}
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Active Routes:</span>
          <span className="text-white font-mono font-semibold">{metrics.activeRoutes.toLocaleString()}</span>
        </div>
        
        {/* Congestion Index */}
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Congestion Index:</span>
          <span className={`font-mono font-semibold ${
            metrics.congestionIndex > 1 ? "text-red-400" :
            metrics.congestionIndex > 0.5 ? "text-yellow-400" :
            "text-green-400"
          }`}>
            {metrics.congestionIndex.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

