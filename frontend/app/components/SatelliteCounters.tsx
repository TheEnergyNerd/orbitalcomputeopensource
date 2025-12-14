"use client";

import { useOrbitSim } from "../state/orbitStore";
import { useSimStore } from "../store/simStore";
import { useSimulationStore } from "../store/simulationStore";
import { getDebugStateEntry, scenarioModeToKey } from "../lib/orbitSim/debugState";
import { getClassAPower, getClassBPower, getClassACompute, getClassBCompute } from "../lib/orbitSim/satelliteClasses";
import { useMemo, useState, useEffect } from "react";

/**
 * Mandatory numeric counters that must always be visible
 * Even when rendering all satellites, human eyes cannot estimate density accurately
 */
export function SatelliteCounters() {
  // CRITICAL FIX: All hooks must be called before any conditional returns
  const [mounted, setMounted] = useState(false);
  const satellites = useOrbitSim((s) => s.satellites);
  const routes = useOrbitSim((s) => s.routes);
  const simState = useSimStore((s) => s.state);
  const { config, timeline } = useSimulationStore();
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Calculate render percentage (from SatellitesOptimized logic)
  const renderInfo = useMemo(() => {
    const totalCount = satellites.length;
    const PERFORMANCE_LIMITS = {
      INSTANCED_SPHERES: 500,
      INSTANCED_POINTS: 1000,
      GPU_POINT_SPRITES: 2000,
    };
    
    let renderMode: string;
    let renderedCount: number;
    let renderPercentage: number;
    
    if (totalCount <= PERFORMANCE_LIMITS.INSTANCED_SPHERES) {
      renderMode = "full";
      renderedCount = totalCount;
      renderPercentage = 100;
    } else if (totalCount <= PERFORMANCE_LIMITS.INSTANCED_POINTS) {
      renderMode = "points";
      renderedCount = totalCount;
      renderPercentage = 100;
    } else if (totalCount <= PERFORMANCE_LIMITS.GPU_POINT_SPRITES) {
      renderMode = "sprites";
      renderedCount = totalCount;
      renderPercentage = 100;
    } else {
      renderMode = "representative";
      const representativePercentage = 0.05; // 5% for better performance
      renderedCount = Math.max(1, Math.floor(totalCount * representativePercentage));
      renderPercentage = (renderedCount / totalCount) * 100;
    }
    
    return { renderMode, renderedCount, renderPercentage, totalCount };
  }, [satellites.length]);
  
  // Calculate metrics
  const metrics = useMemo(() => {
    // Get current year from timeline
    const currentYear = timeline.length > 0 ? timeline[timeline.length - 1].year : 2025;
    const scenarioKey = scenarioModeToKey(config.scenarioMode);
    
    // Get debug entry for accurate power calculation (single source of truth)
    const debugEntry = getDebugStateEntry(currentYear, config.scenarioMode);
    
    // Use satellitesTotal from debug state (matches fleet_growth chart), not satellites.length (rendered count)
    const totalSatellites = debugEntry?.satellitesTotal ?? satellites.length;
    
    // Calculate total orbital power using the same method as KPI strip
    let totalOrbitalPowerMW = 0;
    let totalOrbitalComputePFLOPs = 0;
    
    if (debugEntry && debugEntry.power_total_kw !== undefined && debugEntry.power_total_kw > 0) {
      // Use power from debug state (most accurate - uses power progression curve)
      totalOrbitalPowerMW = debugEntry.power_total_kw / 1000;
      
      // Use compute from debug state (prefer exportable, then effective, then raw)
      // CRITICAL FIX: Match KPI strip logic - use exportable if meaningful (> 0.1 PFLOPs), otherwise fall back
      const computeExportablePFLOPs = debugEntry.compute_exportable_flops !== undefined 
        ? debugEntry.compute_exportable_flops / 1e15 
        : 0;
      const computeEffectivePFLOPs = debugEntry.compute_effective_flops !== undefined 
        ? debugEntry.compute_effective_flops / 1e15 
        : 0;
      const computeRawPFLOPs = debugEntry.compute_raw_flops !== undefined 
        ? debugEntry.compute_raw_flops / 1e15 
        : 0;
      
      // Use exportable if it's meaningful (> 0.1 PFLOPs), otherwise fall back to raw or satellite counts
      if (computeExportablePFLOPs > 0.1) {
        totalOrbitalComputePFLOPs = computeExportablePFLOPs;
      } else if (computeEffectivePFLOPs > 0.1) {
        totalOrbitalComputePFLOPs = computeEffectivePFLOPs;
      } else if (computeRawPFLOPs > 0.1) {
        totalOrbitalComputePFLOPs = computeRawPFLOPs;
      } else {
        // Fallback: Calculate from satellite counts (same as KPI strip)
        const classASats = debugEntry.classA_satellites_alive ?? 0;
        const classBSats = debugEntry.classB_satellites_alive ?? 0;
        
        if (classASats > 0 || classBSats > 0) {
          // Calculate compute from satellite counts using tech curves
          const computePerA = getClassACompute(currentYear);
          const computePerB = getClassBCompute(currentYear);
          totalOrbitalComputePFLOPs = (classASats * computePerA) + (classBSats * computePerB);
        }
      }
    } else {
      // Fallback: Calculate from satellite counts using power progression curve
      // Count Class A and Class B satellites
      let classACount = 0;
      let classBCount = 0;
      
      satellites.forEach(sat => {
        // Use satelliteClass property (set in OrbitalDataSync)
        const satClass = sat.satelliteClass || "A"; // Default to Class A
        if (satClass === "B") {
          classBCount++;
        } else {
          classACount++;
        }
      });
      
      // Use power progression curve (same as KPI strip)
      const powerPerA = getClassAPower(currentYear);
      const powerPerB = getClassBPower(currentYear);
      const totalPowerKW = (classACount * powerPerA) + (classBCount * powerPerB);
      totalOrbitalPowerMW = totalPowerKW / 1000;
      
      // Estimate compute from power (simplified)
      const efficiencyWPerTFLOP = 12.5; // Simplified for now
      const totalOrbitalComputeTFLOPs = (totalOrbitalPowerMW * 1000 * 1000) / efficiencyWPerTFLOP;
      totalOrbitalComputePFLOPs = totalOrbitalComputeTFLOPs / 1000;
    }
    
    const totalOrbitalPowerGW = totalOrbitalPowerMW / 1000;
    
    // Active routes
    const activeRoutes = routes.length;
    
    // Count satellites per shell
    // FIX: Use shell_power_breakdown from debug state if available (matches total satellites)
    // Otherwise estimate from rendered satellites (scaled to total)
    let satellitesPerShell = {
      LEO: 0,
      MEO: 0,
      GEO: 0,
    };
    
    if (debugEntry?.shell_power_breakdown && debugEntry.shell_power_breakdown.length > 0) {
      // Use actual shell breakdown from debug state (most accurate)
      // FIX: Round satellite counts to ensure integers (no decimals)
      debugEntry.shell_power_breakdown.forEach(shell => {
        const shellId = shell.shell;
        const satCount = Math.round(shell.sats || 0); // Round to integer
        if (shellId === "LEO_340" || shellId === "LEO_550" || shellId === "LEO_1100") {
          satellitesPerShell.LEO += satCount;
        } else if (shellId === "MEO_8000" || shellId === "MEO_20000") {
          satellitesPerShell.MEO += satCount;
        } else if (shellId === "GEO") {
          satellitesPerShell.GEO += satCount;
        }
      });
    } else {
      // Fallback: Count from rendered satellites and scale to total
      const renderedCounts = { LEO: 0, MEO: 0, GEO: 0 };
      satellites.forEach(sat => {
        const alt = sat.orbitalState?.altitudeRadius || 700;
        if (alt >= 2000) renderedCounts.GEO++;
        else if (alt >= 1000) renderedCounts.MEO++;
        else renderedCounts.LEO++;
      });
      
      // Scale to total satellites if we have a total
      const renderedTotal = satellites.length;
      if (renderedTotal > 0 && totalSatellites > 0) {
        const scale = totalSatellites / renderedTotal;
        satellitesPerShell.LEO = Math.round(renderedCounts.LEO * scale);
        satellitesPerShell.MEO = Math.round(renderedCounts.MEO * scale);
        satellitesPerShell.GEO = Math.round(renderedCounts.GEO * scale);
      } else {
        satellitesPerShell = renderedCounts;
      }
    }
    
    return {
      totalSatellites,
      totalOrbitalPowerMW,
      totalOrbitalPowerGW,
      totalOrbitalComputePFLOPs,
      activeRoutes,
      satellitesPerShell,
    };
  }, [satellites, routes, timeline, config]);
  
  // Don't render until mounted to prevent hydration mismatch
  // Show placeholder with "0" to match initial client state
  if (!mounted) {
    return (
      <div className="fixed bottom-4 right-4 z-50 panel-glass rounded-lg p-4 shadow-xl border border-white/10 min-w-[280px]">
        <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase">Orbital System Status</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Total Satellites:</span>
            <span className="text-white font-mono font-semibold">0</span>
          </div>
          <div className="flex justify-between items-center pl-2 border-l-2 border-cyan-500/30">
            <span className="text-gray-400 text-[10px]">LEO:</span>
            <span className="text-cyan-400 font-mono">0</span>
          </div>
          <div className="flex justify-between items-center pl-2 border-l-2 border-green-500/30">
            <span className="text-gray-400 text-[10px]">MEO:</span>
            <span className="text-green-400 font-mono">0</span>
          </div>
          <div className="flex justify-between items-center pl-2 border-l-2 border-purple-500/30">
            <span className="text-gray-400 text-[10px]">GEO:</span>
            <span className="text-purple-400 font-mono">0</span>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="fixed bottom-4 right-4 z-50 panel-glass rounded-lg p-4 shadow-xl border border-white/10 min-w-[280px]">
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
            {metrics.totalOrbitalComputePFLOPs >= 1000
              ? `${(metrics.totalOrbitalComputePFLOPs / 1000 / 1000).toFixed(2)} ExaFLOPs`  // FIX: Divide by 1,000,000 (1000*1000) to convert from TFLOPs to ExaFLOPs
              : metrics.totalOrbitalComputePFLOPs >= 1
              ? `${(metrics.totalOrbitalComputePFLOPs / 1000).toFixed(2)} PFLOPs`  // Convert from TFLOPs to PFLOPs
              : `${metrics.totalOrbitalComputePFLOPs.toFixed(1)} TFLOPs`
            }
          </span>
        </div>
        
        {/* Active Routes */}
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Active Routes:</span>
          <span className="text-white font-mono font-semibold">{metrics.activeRoutes.toLocaleString()}</span>
        </div>
        
        {/* Render Performance Indicator - Always show when in representative mode */}
        {renderInfo.renderPercentage < 100 ? (
          <div className="pt-2 mt-2 border-t border-amber-500/30 bg-amber-500/5 rounded px-2 py-1.5">
            <div className="flex justify-between items-center mb-1">
              <span className="text-amber-300 text-[10px] font-semibold uppercase">Performance Mode</span>
              <span className="text-amber-400 font-mono text-[11px] font-bold">
                {renderInfo.renderPercentage.toFixed(1)}%
              </span>
            </div>
            <div className="text-[10px] text-amber-200/80">
              Rendering <span className="font-mono font-semibold">{renderInfo.renderedCount.toLocaleString()}</span> of <span className="font-mono font-semibold">{renderInfo.totalCount.toLocaleString()}</span> satellites
            </div>
            <div className="text-[9px] text-amber-300/60 mt-0.5 italic">
              Representative visualization for optimal performance
            </div>
          </div>
        ) : (
          <div className="pt-2 mt-2 border-t border-green-500/30">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-[10px]">Rendering:</span>
              <span className="text-green-400 font-mono text-[10px] font-semibold">
                100% (Full)
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

