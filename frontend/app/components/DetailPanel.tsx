"use client";

import { useEffect, useState } from "react";
import { Vector3 } from "three";
import { latLonAltToXYZ } from "../lib/three/coordinateUtils";
import { useSimStore } from "../store/simStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { useSimulationStore } from "../store/simulationStore";
import { useOrbitSim } from "../state/orbitStore";
import type { SurfaceType } from "./SurfaceTabs";
import { computePodSpec, calculateTechLevel } from "../lib/orbitSim/podSpecs";
import { computeFactoryMultipliers } from "../lib/orbitSim/factoryEngine";
import { getCostPerTFLOP } from "../lib/orbitSim/orbitalCostModel";

const compareLevels = [0.25, 0.5, 0.75];

function Metric({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex justify-between text-xs sm:text-sm py-1 gap-2">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-white font-semibold text-right break-words">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 sm:mt-4 border-t border-gray-700 pt-2 sm:pt-3">
      <div className="text-[10px] sm:text-xs uppercase text-gray-500 tracking-wider mb-1.5 sm:mb-2">{title}</div>
      {children}
    </div>
  );
}

interface DetailPanelProps {
  activeSurface?: SurfaceType;
}

// Shared props for all detail card containers to enable mobile scrolling
const cardContainerProps = {
  style: { 
    touchAction: 'pan-y' as const, // Allow vertical scrolling, prevent horizontal pan
    WebkitOverflowScrolling: 'touch' as const, // Smooth scrolling on iOS
  },
  onTouchStart: (e: React.TouchEvent) => {
    // Stop event propagation so touches don't reach the globe
    e.stopPropagation();
  },
  onTouchMove: (e: React.TouchEvent) => {
    // Stop event propagation so touches don't reach the globe
    e.stopPropagation();
  },
};

export default function DetailPanel({ activeSurface }: DetailPanelProps = {}) {
  const state = useSimStore((s) => s.state);
  const selectedEntity = useSimStore((s) => s.selectedEntity);
  const setSelectedEntity = useSimStore((s) => s.setSelectedEntity);
  const { getDeployedUnits } = useOrbitalUnitsStore();
  const config = useSimulationStore((s) => s.config);
  const timeline = useSimulationStore((s) => s.timeline);
  const [showCompare, setShowCompare] = useState(false);

  useEffect(() => {
    setShowCompare(false);
  }, [selectedEntity?.id]);

  // Helper function to get entity type label
  const getEntityTypeLabel = (entityType: string | undefined): string => {
    switch (entityType) {
      case "satellite":
        return "Orbital Compute Pod";
      case "ground":
        return "Data Center";
      case "launch_site":
        return "Launch Site";
      default:
        return "Entity";
    }
  };

  // Only show cards in deployment section
  if (activeSurface !== "deployment") {
    return null;
  }

  // Allow rendering even if state is null - we can show basic info from selectedEntity
  if (!selectedEntity) {
    return null;
  }

  // Close handler
  const handleClose = () => {
    setSelectedEntity(null);
  };
  
  // If state is null, show a basic card with just the entity info
  if (!state) {
    if (selectedEntity.type === "satellite") {
      return (
        <div 
          className="fixed bottom-0 left-0 right-0 sm:bottom-6 sm:left-6 sm:right-auto w-full sm:w-80 md:w-96 lg:w-[420px] max-w-[100vw] sm:max-w-[90vw] panel-glass rounded-t-2xl sm:rounded-2xl p-3 sm:p-5 max-h-[70vh] sm:max-h-[85vh] overflow-y-auto z-[120] shadow-2xl border border-white/10"
          {...cardContainerProps}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-400 hover:text-white transition-colors z-10"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="text-xs uppercase text-gray-400 tracking-[0.2em] mb-1">{getEntityTypeLabel(selectedEntity.type)}</div>
          <h2 className="text-lg sm:text-2xl font-semibold text-white mb-3 sm:mb-4 break-words pr-8">{selectedEntity.id}</h2>
          <div className="text-xs sm:text-sm text-gray-400">
            {selectedEntity.type === "satellite" ? "Satellite data not available" : 
             selectedEntity.type === "ground" ? "Data center data not available" :
             "Launch site data not available"}
          </div>
          <div className="mt-4 text-xs text-gray-500">
            Note: Full satellite data requires simulation state to be loaded.
          </div>
        </div>
      );
    }
    return null;
  }

  // Check if this is a deployed unit satellite
  if (selectedEntity.type === "satellite" && (selectedEntity as any).unitId) {
    const deployedUnits = getDeployedUnits();
    const unit = deployedUnits.find(u => u.id === (selectedEntity as any).unitId);
    if (unit) {
      return (
        <div 
          className="fixed bottom-0 left-0 right-0 sm:bottom-6 sm:left-6 sm:right-auto w-full sm:w-80 md:w-96 lg:w-[420px] max-w-[100vw] sm:max-w-[90vw] panel-glass rounded-t-2xl sm:rounded-2xl p-3 sm:p-5 max-h-[90vh] sm:max-h-[85vh] overflow-y-auto z-[120] shadow-2xl border border-white/10"
          {...cardContainerProps}
        >
          <div className="text-xs uppercase text-gray-400 tracking-[0.2em] mb-1">Deployed Orbital Unit</div>
          <h2 className="text-lg sm:text-2xl font-semibold text-white mb-3 sm:mb-4 break-words">{unit.name}</h2>

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

  // 1. ORBITAL COMPUTE PODS (Satellites)
  if (selectedEntity.type === "satellite") {
    // Try multiple ID matching strategies
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
      // Try extracting numeric ID from formats like "pod_base_sat_34" -> "34" or "sat_34"
      const numericMatch = selectedEntity.id.match(/(\d+)$/);
      if (numericMatch) {
        const numericId = numericMatch[1];
        sat = state.satellites.find((s) => {
          const sNumericMatch = s.id.match(/(\d+)$/);
          return sNumericMatch && sNumericMatch[1] === numericId;
        });
        if (!sat) {
          sat = state.satellites.find((s) => s.id === `sat_${numericId}`);
        }
        if (!sat) {
          sat = state.satellites.find((s) => s.id === numericId);
        }
      }
    }
    if (!sat) {
      // Try partial match (contains)
      sat = state.satellites.find((s) => 
        s.id.includes(selectedEntity.id) || selectedEntity.id.includes(s.id)
      );
    }
    
    // If still not found, show card with available data from selectedEntity or fallback
    if (!sat) {
      // Try to extract info from the ID itself
      const idParts = selectedEntity.id.split('_');
      const shellMatch = selectedEntity.id.match(/shell[_\s]?(\d+)/i);
      const planeMatch = selectedEntity.id.match(/plane[_\s]?(\d+)/i);
      const satNumMatch = selectedEntity.id.match(/(\d+)$/);
      
      const shell = shellMatch ? shellMatch[1] : "Unknown";
      const plane = planeMatch ? planeMatch[1] : "Unknown";
      const satNum = satNumMatch ? satNumMatch[1] : "?";
      
      // Use default/estimated values when satellite not in state
      const defaultAltitude = 550;
      const defaultCapacity = 0.1; // MW
      const defaultUtilization = 0.3;
      
      return (
            <div 
              className="fixed bottom-0 left-0 right-0 sm:bottom-6 sm:left-6 sm:right-auto w-full sm:w-80 md:w-96 lg:w-[420px] max-w-[100vw] sm:max-w-[90vw] panel-glass rounded-t-2xl sm:rounded-2xl p-3 sm:p-5 max-h-[85vh] sm:max-h-[85vh] overflow-y-auto z-[120] shadow-2xl border border-white/10"
              {...cardContainerProps}
            >
              {/* Close button */}
              <button
            onClick={handleClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-400 hover:text-white transition-colors z-10"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {/* Header */}
          <div className="text-xs uppercase text-gray-400 tracking-[0.2em] mb-1">{getEntityTypeLabel(selectedEntity.type)}</div>
          <h2 className="text-xl font-semibold text-white mb-1 pr-8">{selectedEntity.id}</h2>
          <div className="text-xs text-gray-400 mb-3 sm:mb-4 break-words">
            {defaultAltitude} km • Edge
          </div>

          {/* Compute Specs */}
          <Section title="Compute Specs">
            <Metric label="Compute capacity" value={`${(defaultCapacity * 10).toFixed(2)} TFLOPs`} />
            <Metric label="Power envelope" value={`${(defaultCapacity * 10).toFixed(1)} kW`} />
            <Metric label="Thermal margin" value="75%" />
            <Metric label="Onboard storage" value="512 GB" />
          </Section>

          {/* Latency Geometry */}
          <Section title="Latency Geometry">
            <Metric label="One-way latency (nadir)" value="~50 ms" />
            <Metric label="Latency to nearest DC" value="~60 ms" />
            <Metric label="Latency jitter class" value="Low" />
          </Section>

          {/* Economics - use default pod specs */}
          {(() => {
            const defaultPodSpec = computePodSpec({ techLevel: 0.2, orbitShellAltitudeKm: defaultAltitude });
            const currentYear = new Date().getFullYear();
            const costPerTFLOP = getCostPerTFLOP(currentYear);
            return (
              <Section title="Economics">
                <Metric label="Annual OPEX" value={`$${(defaultPodSpec.annualOpexUSD / 1000).toFixed(1)}k`} />
                <Metric label="Cost per TFLOP" value={`$${(costPerTFLOP / 1000).toFixed(1)}k`} />
                <Metric label="Carbon impact" value={`${defaultPodSpec.carbonTonsPerYear.toFixed(2)} tCO₂/yr`} />
              </Section>
            );
          })()}


          {/* Reliability */}
          <Section title="Reliability">
            <Metric label="Health" value="95%" />
            <Metric label="Failure probability (yearly)" value="0.5%" />
            <Metric label="Replacement interval" value="7 years" />
          </Section>

          <div className="mt-4 text-xs text-amber-400 border-t border-gray-700 pt-3">
            ⚠️ Estimated values - satellite not found in simulation state
          </div>
        </div>
      );
    }

    // Extract shell/plane from satellite data or estimate from altitude
    let shell: string | null = null;
    let plane: string | null = null;
    
    // Try to get from orbitStore satellite data (most accurate)
    // Also try matching by partial ID (satellite IDs might have prefixes)
    const allOrbitSats = useOrbitSim.getState().satellites;
    
    const orbitStoreSat = allOrbitSats.find(s => {
      return s.id === sat.id || 
        s.id === `deployed_${sat.id}` ||
        s.id === `deployed_${sat.id}_sat` ||
        s.id.endsWith(`_${sat.id}`) ||
        sat.id.endsWith(`_${s.id}`) ||
        s.id.includes(sat.id) ||
        sat.id.includes(s.id);
    });
    
    // Try to get shell and plane from orbitStoreSat if it exists
    if (orbitStoreSat) {
      // Try to get shell from orbitStoreSat
      if (orbitStoreSat.shell !== undefined && orbitStoreSat.shell !== null) {
        const shellValue = orbitStoreSat.shell;
        
        if (typeof shellValue === 'string') {
          shell = shellValue;
        } else if (typeof shellValue === 'number') {
          // Map shell number to name
          const shellNames: Record<number, string> = {
            1: "VLEO",
            2: "LEO", 
            3: "MEO",
            4: "GEO",
            5: "SSO",
          };
          shell = shellNames[shellValue] || `Shell ${shellValue}`;
        }
      }
      
      // Try to get plane from orbitalState
      if (orbitStoreSat.orbitalState) {
        const orbitalState = orbitStoreSat.orbitalState as any;
        if (orbitalState.plane !== undefined) {
          plane = `Plane ${orbitalState.plane}`;
        } else if (orbitalState.inclination !== undefined) {
          plane = `Inclination ${orbitalState.inclination.toFixed(1)}°`;
        }
      }
    }
    
    // Try to get from satellite shell property if available
    if (!shell && (sat as any).shell !== undefined) {
      const shellNum = (sat as any).shell;
      console.log('[DetailPanel] 🎯 Shell from sat.shell:', shellNum, typeof shellNum);
      if (typeof shellNum === 'number') {
        const shellNames: Record<number, string> = {
          1: "VLEO",
          2: "LEO",
          3: "MEO", 
          4: "GEO",
          5: "SSO",
        };
        shell = shellNames[shellNum] || `Shell ${shellNum}`;
      } else if (typeof shellNum === 'string') {
        shell = shellNum;
      }
    }
    
    // If not found, estimate from altitude (updated to match extreme ranges)
    if (!shell) {
      // Use orbitStoreSat altitude if available, otherwise use sat.alt_km
      const altKm = orbitStoreSat ? (() => {
        if (orbitStoreSat.orbitalState?.altitudeRadius) {
          return orbitStoreSat.orbitalState.altitudeRadius;
        }
        const radius = Math.sqrt((orbitStoreSat.x || 0) ** 2 + (orbitStoreSat.y || 0) ** 2 + (orbitStoreSat.z || 0) ** 2);
        return (radius - 1) * 6371;
      })() : sat.alt_km;
      
      if (altKm >= 35786) {
        shell = "GEO";
      } else if (altKm >= 10000) {
        shell = "MEO";
      } else if (altKm >= 800 && altKm <= 1000) {
        shell = "SSO";
      } else if (altKm >= 400) {
        shell = "LEO";
      } else if (altKm >= 250) {
        shell = "VLEO";
      } else {
        shell = "LEO"; // Default fallback
      }
    }
    
    // Estimate plane from satellite position (use longitude as proxy)
    if (!plane) {
      // Calculate longitude from x, y, z coordinates
      let lon = 0;
      if (orbitStoreSat && (orbitStoreSat.x !== undefined || orbitStoreSat.y !== undefined || orbitStoreSat.z !== undefined)) {
        const radius = Math.sqrt(orbitStoreSat.x ** 2 + orbitStoreSat.y ** 2 + orbitStoreSat.z ** 2);
        if (radius > 0) {
          // Calculate longitude from x, y, z
          lon = Math.atan2(orbitStoreSat.y, orbitStoreSat.x) * (180 / Math.PI);
        }
      } else if (sat.alt_km !== undefined && sat.lat !== undefined && sat.lon !== undefined) {
        // Use lat/lon from simSatellite if available
        lon = sat.lon;
      }
      
      // Use longitude to estimate plane (each plane ~22.5 degrees apart)
      const estimatedPlane = Math.floor((lon + 180) / 22.5) + 1;
      plane = `Plane ${Math.min(estimatedPlane, 16)}`; // Max 16 planes
      console.log('[DetailPanel] ✅ Estimated plane from longitude:', lon, '→', plane);
    }
    
    // Final fallback for shell/plane
    if (!shell) {
      shell = "Unknown";
      console.warn('[DetailPanel] ⚠️ Could not determine shell, using "Unknown"');
    }
    if (!plane) {
      plane = "Unknown";
      console.warn('[DetailPanel] ⚠️ Could not determine plane, using "Unknown"');
    }
    
    // Calculate pod specs using centralized function
    // Get factory state to calculate tech level
    const factoryState = (config as any)?.factoryState || null;
    
    // Calculate tech level from factory breakthroughs (if available)
    let techLevel = 0.2; // Default baseline
    if (factoryState) {
      const siliconYield = factoryState.stages?.silicon?.breakthroughs?.find((b: any) => b.id === 'silicon_yield')?.level || 0;
      const chipsDensity = factoryState.stages?.chips?.breakthroughs?.find((b: any) => b.id === 'chips_density')?.level || 0;
      const racksMod = factoryState.stages?.racks?.breakthroughs?.find((b: any) => b.id === 'racks_modularity')?.level || 0;
      techLevel = calculateTechLevel(siliconYield, chipsDensity, racksMod);
    }
    
    // Get launch/deployment year from ID or satellite data
    let launchYear: number | null = null;
    
    // Try to extract year from ID pattern: deploy_YYYY_launch_...
    const yearMatch = sat.id.match(/deploy[_\s](\d{4})/i) || sat.id.match(/_(\d{4})_/);
    if (yearMatch) {
      launchYear = parseInt(yearMatch[1]);
      // Validate it's a reasonable year
      if (launchYear >= 2020 && launchYear <= 2100) {
        // Valid year
      } else {
        launchYear = null;
      }
    }
    
    // Try from createdAt timestamp
    if (!launchYear && (sat as any).createdAt) {
      launchYear = new Date((sat as any).createdAt).getFullYear();
    }
    
    // Try from deployedAt if available (from unit)
    if (!launchYear && (sat as any).deployedAt) {
      launchYear = new Date((sat as any).deployedAt).getFullYear();
    }
    
    // Fallback: use current year from timeline if available
    if (!launchYear && timeline && timeline.length > 0) {
      launchYear = timeline[timeline.length - 1]?.year || new Date().getFullYear();
    }
    
    // Calculate pod specs (factoryState already defined above)
    const podSpec = computePodSpec({
      techLevel,
      orbitShellAltitudeKm: sat.alt_km,
      factoryState: factoryState,
    });
    
    const computeCapacityTflops = podSpec.computeTFLOPs;
    const powerEnvelopeKw = podSpec.powerKW;
    const annualOpex = podSpec.annualOpexUSD;
    const carbonImpact = podSpec.carbonTonsPerYear;
    
    // Use realistic cost per TFLOP model (not derived from OPEX)
    const currentYear = launchYear || new Date().getFullYear();
    const costPerTFLOP = getCostPerTFLOP(currentYear);
    const costPerComputeUnit = costPerTFLOP; // Cost per TFLOP (not per compute unit in old sense)
    
    const thermalMargin = sat.sunlit ? 75 : 45; // Higher when sunlit
    // Calculate storage based on factory upgrades
    const podsLevel = factoryState?.stages.find((s: any) => s.id === 'pods')?.upgradeLevel || 0;
    const baseStorageGb = 8 * 1024; // 8 TB base (8192 GB)
    const podBoost = 1 + 0.25 * podsLevel;
    const onboardStorageGb = baseStorageGb * podBoost; // Scales with pods upgrade level
    
    // Latency calculations
    const nadirLatency = sat.latencyMs;
    const nearestDcLatency = sat.latencyMs * 1.2; // Slightly higher
    const latencyJitter = sat.utilization > 0.8 ? "High" : sat.utilization > 0.5 ? "Med" : "Low"
    
    // Constellation role - calculate based on actual routes
    const routes = useOrbitSim.getState().routes;
    
    // Get satellite ID variations to match routes (handle different ID formats)
    const satIdVariations = [
      sat.id,
      `deployed_${sat.id}`,
      `deployed_${sat.id}_sat`,
      ...(sat.id.includes('_sat_') ? [sat.id.replace('_sat_', '_')] : []),
      ...(sat.id.includes('launch_deploy_') ? [sat.id.replace('launch_deploy_', 'deploy_')] : []),
    ];
    
    // Get satellite position for matching routes without IDs
    // orbitStoreSat has x, y, z, but sat (SimSatellite) has lat, lon, alt_km
    const satPos = orbitStoreSat ? new Vector3(orbitStoreSat.x || 0, orbitStoreSat.y || 0, orbitStoreSat.z || 0) : 
      (sat.lat !== undefined && sat.lon !== undefined && sat.alt_km !== undefined) ? 
        (() => {
          const [x, y, z] = latLonAltToXYZ(sat.lat, sat.lon, sat.alt_km);
          return new Vector3(x, y, z);
        })() : null;
    const POSITION_TOLERANCE = 0.05; // Increased tolerance for better matching
    
    // Count routes that pass through this satellite (by ID or position)
    const routesThroughThisSat = routes.filter(r => {
      // Check by satellite ID variations (more flexible matching)
      const idMatch = satIdVariations.some(idVar => {
        const exactMatch = r.fromSatId === idVar || r.toSatId === idVar;
        const partialMatch = r.fromSatId?.includes(idVar) || r.toSatId?.includes(idVar) ||
          idVar.includes(r.fromSatId || '') || idVar.includes(r.toSatId || '');
        return exactMatch || partialMatch;
      });
      if (idMatch) {
        return true;
      }
      
      // Fallback: check by position if IDs don't match
      if (satPos && satPos.length() > 0.1) {
        const fromVec = new Vector3(r.fromVec[0], r.fromVec[1], r.fromVec[2]);
        const toVec = new Vector3(r.toVec[0], r.toVec[1], r.toVec[2]);
        const distFrom = satPos.distanceTo(fromVec);
        const distTo = satPos.distanceTo(toVec);
        return distFrom < POSITION_TOLERANCE || distTo < POSITION_TOLERANCE;
      }
      
      return false;
    });
    
    // Calculate total traffic through this satellite
    const totalTrafficThroughSat = routesThroughThisSat.reduce((sum, r) => sum + (r.trafficMbps || 100), 0);
    
    // Calculate total traffic across all satellites
    const totalTrafficAllSats = routes.reduce((sum, r) => sum + (r.trafficMbps || 100), 0);
    
    // Traffic share is percentage of total traffic
    const trafficShare = totalTrafficAllSats > 0 
      ? (totalTrafficThroughSat / totalTrafficAllSats) * 100 
      : 0;
    
    // Calculate utilization based on routes and capacity
    // Utilization = (traffic through sat / sat capacity) * 100
    const satCapacity = sat.capacityMw || 0.1; // MW
    
    // If we have routes through this satellite, calculate from traffic
    let calculatedUtilization: number;
    if (routesThroughThisSat.length > 0 && totalTrafficThroughSat > 0) {
      // Convert Mbps to MW (rough: 1 Mbps ≈ 0.001 MW for compute traffic)
      const trafficThroughSatMw = totalTrafficThroughSat / 1000;
      calculatedUtilization = satCapacity > 0 
        ? Math.min(1.0, trafficThroughSatMw / satCapacity)
        : 0.5; // Default if capacity is 0
    } else {
      // No routes through this satellite - use congestion from orbitStore or default
      const congestion = orbitStoreSat?.congestion || 0;
      // If congestion is available, use it; otherwise use a low default
      calculatedUtilization = congestion > 0 ? Math.min(1.0, congestion) : 0.1;
    }
    
    // Use calculated utilization (never use hardcoded sat.utilization from simStore)
    const currentLoad = calculatedUtilization * 100;
    const routesThrough = routesThroughThisSat.length;
    
    // Reliability
    const health = sat.sunlit ? 95 : 85;
    const failureProbability = (1 - health / 100) * 10; // %
    const replacementInterval = 7; // years

    return (
      <div 
        className="fixed bottom-0 left-0 right-0 sm:bottom-6 sm:left-6 sm:right-auto sm:w-80 sm:max-w-[90vw] panel-glass rounded-t-2xl sm:rounded-2xl p-5 max-h-[70vh] sm:max-h-[85vh] overflow-y-auto z-[120] shadow-2xl border border-white/10"
        {...cardContainerProps}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-400 hover:text-white transition-colors z-10"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {/* Header */}
        <div className="text-xs uppercase text-gray-400 tracking-[0.2em] mb-1">{getEntityTypeLabel(selectedEntity.type)}</div>
        {(() => {
          // Get satellite class from orbitStore or sat data
          const satClass = orbitStoreSat?.satelliteClass || (sat as any).satelliteClass || "A";
          const isClassB = satClass === "B";
          
          // Get strategy to determine usage from timeline or default to BALANCED
          const currentYear = timeline && timeline.length > 0 ? timeline[timeline.length - 1]?.year : 2025;
          const currentStep = timeline?.find(s => s.year === currentYear);
          // Try to get strategy from yearPlan or default to BALANCED
          const strategy = "BALANCED"; // Default strategy
          const strategyUpper = strategy.toUpperCase();
          
          // Determine usage reason based on class and strategy
          let usageReason = "";
          if (isClassB) {
            switch (strategyUpper) {
              case "CARBON":
                usageReason = "Carbon-optimized compute (sun-facing)";
                break;
              case "COST":
                usageReason = "Cost-optimized high-power compute";
                break;
              case "LATENCY":
                usageReason = "High-power compute (limited use)";
                break;
              default:
                usageReason = "High-power compute";
            }
          } else {
            switch (strategyUpper) {
              case "LATENCY":
                usageReason = "Low-latency networking";
                break;
              case "COST":
                usageReason = "Cost-efficient networking";
                break;
              case "CARBON":
                usageReason = "Carbon-efficient networking";
                break;
              default:
                usageReason = "Networking & compute";
            }
          }
          
          // Parse satellite ID using new naming schema: [CLASS]-[SHELL]-[DEPLOY_YEAR]-[SEQUENCE]
          // Example: A-LOW-2029-01472, B-SSO-2032-00304, A-MID-2031-00811 [RET]
          let displayName = sat.id;
          let humanReadableAlias = "";
          let isRetired = false;
          let deployYearFromId: number | null = null;
          
          // Check for new naming schema pattern
          const newSchemaMatch = sat.id.match(/^([AB])-([A-Z]+)-(\d{4})-(\d{5})(\s+\[RET\])?$/);
          if (newSchemaMatch) {
            const [, classLetter, shellName, year, sequenceStr, retSuffix] = newSchemaMatch;
            const sequence = parseInt(sequenceStr);
            deployYearFromId = parseInt(year);
            isRetired = !!retSuffix;
            
            // Primary display name is the full ID
            displayName = sat.id;
            
            // Generate human-readable alias
            const shellDesc = shellName === "SSO" ? "Sun-Synchronous" : 
                              shellName === "LOW" ? "Low-LEO" :
                              shellName === "MID" ? "Mid-LEO" : "High-LEO";
            
            if (classLetter === "B") {
              humanReadableAlias = `${shellDesc} Inference Node ${sequence}`;
            } else {
              humanReadableAlias = `${shellDesc} Compute Node ${sequence}`;
            }
          } else {
            // Fallback: try to parse old format IDs for backwards compatibility
            const launchDeployMatch = sat.id.match(/launch[_\s]deploy[_\s](\d{4})[_\s]launch[_\s](\d+)/i);
            if (launchDeployMatch) {
              const year = parseInt(launchDeployMatch[1]);
              const launchNum = parseInt(launchDeployMatch[2]);
              deployYearFromId = year;
              displayName = `Launch ${launchNum} • ${year}`;
            } else {
              const deployMatch = sat.id.match(/deploy[_\s](\d{4})[_\s]launch[_\s](\d+)/i);
              if (deployMatch) {
                const year = parseInt(deployMatch[1]);
                const launchNum = parseInt(deployMatch[2]);
                deployYearFromId = year;
                displayName = `Launch ${launchNum} • ${year}`;
              } else {
                // Final fallback
                displayName = `Orbital Pod`;
              }
            }
          }
          
          return (
            <>
              <h2 className="text-lg sm:text-xl font-semibold text-white mb-1 break-words pr-8 font-mono">
                {displayName}
                {isRetired && <span className="ml-2 text-xs text-red-400">[RET]</span>}
              </h2>
              {humanReadableAlias ? (
                <div className="text-xs text-gray-400 mb-2 break-words">
                  {humanReadableAlias}
                  {deployYearFromId && ` · Deployed ${deployYearFromId}`}
                </div>
              ) : (
                <>
                  <div className="text-xs text-gray-400 mb-2 break-words">
                    {usageReason}
                  </div>
                  <div className="text-xs text-gray-500 mb-3 sm:mb-4 break-words">
                    {shell !== "Unknown" && plane !== "Unknown" ? `${shell} • Plane ${plane} • ` : ''}
                    {sat.alt_km.toFixed(0)} km
                    {launchYear && ` • Deployed ${launchYear}`}
                  </div>
                </>
              )}
            </>
          );
        })()}

            {/* Compute Specs */}
            <Section title="Compute Specs">
              <Metric label="Compute capacity" value={`${computeCapacityTflops.toFixed(0)} TFLOPs`} />
              <Metric label="Power envelope" value={`${powerEnvelopeKw.toFixed(1)} kW`} />
              <Metric label="Efficiency" value={`${(powerEnvelopeKw / computeCapacityTflops * 1000).toFixed(1)} W/TFLOP`} />
              <Metric label="Thermal margin" value={`${thermalMargin}%`} />
              <Metric label="Onboard storage" value={`${(onboardStorageGb / 1024).toFixed(1)} TB`} />
            </Section>

        {/* Latency Geometry */}
        <Section title="Latency Geometry">
          <Metric label="One-way latency (nadir)" value={`${nadirLatency.toFixed(1)} ms`} />
          <Metric label="Latency to nearest DC" value={`${nearestDcLatency.toFixed(1)} ms`} />
          <Metric label="Latency jitter class" value={latencyJitter} />
        </Section>

        {/* Economics */}
        <Section title="Economics">
          <Metric label="Annual OPEX" value={`$${(annualOpex / 1000).toFixed(1)}k`} />
          <Metric label="Cost per TFLOP" value={`$${(costPerComputeUnit / 1000).toFixed(1)}k`} />
          <Metric label="Carbon impact" value={`${carbonImpact.toFixed(2)} tCO₂/yr`} />
        </Section>


        {/* Reliability */}
        <Section title="Reliability">
          <Metric label="Health" value={`${health}%`} />
          <Metric label="Failure probability (yearly)" value={`${failureProbability.toFixed(2)}%`} />
          <Metric label="Replacement interval" value={`${replacementInterval} years`} />
        </Section>
      </div>
    );
  }

  // 2. GROUND DATA CENTERS
  if (selectedEntity.type === "ground") {
    const site = state.groundSites.find((s) => s.id === selectedEntity.id);
    if (!site) {
      // Fallback card if site not found
      return (
        <div 
          className="fixed bottom-0 left-0 right-0 sm:bottom-6 sm:left-6 sm:right-auto w-full sm:w-80 md:w-96 lg:w-[420px] max-w-[100vw] sm:max-w-[90vw] panel-glass rounded-t-2xl sm:rounded-2xl p-3 sm:p-5 max-h-[70vh] sm:max-h-[85vh] overflow-y-auto z-[120] shadow-2xl border border-white/10"
          {...cardContainerProps}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-400 hover:text-white transition-colors z-10"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="text-xs uppercase text-gray-400 tracking-[0.2em] mb-1">Ground Data Center</div>
          <h2 className="text-lg sm:text-xl font-semibold text-white mb-1 break-words pr-8">{selectedEntity.id}</h2>
          <div className="text-sm text-gray-400">Data center information loading...</div>
        </div>
      );
    }

    // Determine type from label/ID
    const isEdge = site.label.toLowerCase().includes('edge') || site.id.includes('edge');
    const isCore = site.label.toLowerCase().includes('core') || site.id.includes('core');
    const siteType = isEdge ? "Edge" : isCore ? "Core" : "Hyperscale";
    
    // Capacity calculations
    const computeCapacityPflops = site.powerMw / 10; // Rough: 10MW per PFLOP
    const currentLoad = site.jobsRunning > 0 ? (site.jobsRunning / 100) * 100 : 0; // Estimate
    
    // Job mix (estimate from workload)
    const realtimePct = 30;
    const interactivePct = 40;
    const batchPct = 20;
    const coldPct = 10;
    
    // Economics
    const costPerComputeUnit = site.energyPrice / 100; // Rough estimate
    const annualOpex = site.powerMw * site.energyPrice * 8760 / 1000000; // $M
    
    // Latency to orbit (rough estimate based on location)
    const latencyToOrbit = 120 + (Math.abs(site.lat) * 2); // ms
    
    // Routing stats (estimates)
    const incomingTraffic = site.jobsRunning * 10; // jobs/sec
    const outgoingToOrbit = site.jobsRunning * 0.1; // jobs/sec
    const globalRoutingShare = (site.powerMw / state.metrics.totalGroundPowerMw) * 100;
    
    // Reliability
    const downtimeRisk = site.coolingMw < site.powerMw * 0.8 ? "High" : site.coolingMw < site.powerMw ? "Med" : "Low";
    const coolingMargin = ((site.coolingMw - site.powerMw) / site.powerMw) * 100;

    return (
      <div 
        className="fixed bottom-0 left-0 right-0 sm:bottom-6 sm:left-6 sm:right-auto sm:w-80 sm:max-w-[90vw] panel-glass rounded-t-2xl sm:rounded-2xl p-5 max-h-[70vh] sm:max-h-[85vh] overflow-y-auto z-[120] shadow-2xl border border-white/10"
        {...cardContainerProps}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-400 hover:text-white transition-colors z-10"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {/* Header */}
        <div className="text-xs uppercase text-gray-400 tracking-[0.2em] mb-1">{getEntityTypeLabel(selectedEntity.type)}</div>
        <h2 className="text-lg sm:text-xl font-semibold text-white mb-1 break-words pr-8">{site.label}</h2>
        <div className="text-xs text-gray-400 mb-3 sm:mb-4 break-words">{siteType}</div>

        {/* Capacity & Workload */}
        <Section title="Capacity & Workload">
          <Metric label="Compute capacity" value={`${computeCapacityPflops.toFixed(2)} PFLOPs`} />
          <Metric label="Current load" value={`${currentLoad.toFixed(1)}%`} />
          <div className="mt-2 text-xs text-gray-400">
            <div>Job mix: Realtime {realtimePct}% • Interactive {interactivePct}%</div>
            <div>Batch {batchPct}% • Cold {coldPct}%</div>
          </div>
        </Section>

        {/* Economics */}
        <Section title="Economics">
          <Metric label="Cost per TFLOP" value={`$${(costPerComputeUnit / 1000).toFixed(1)}k`} />
          <Metric label="Power price baseline" value={`$${site.energyPrice.toFixed(2)}/MWh`} />
          <Metric label="Annual OPEX" value={`$${annualOpex.toFixed(1)}M`} />
          <Metric label="Carbon intensity" value={`${site.carbonIntensity.toFixed(1)} kgCO₂/kWh`} />
        </Section>

        {/* Latency Geometry */}
        <Section title="Latency Geometry">
          <Metric label="Latency to orbit" value={`${latencyToOrbit.toFixed(0)} ms`} />
          <div className="text-xs text-gray-400 mt-1">Regional latencies vary by destination</div>
        </Section>

        {/* Routing Stats */}
        <Section title="Routing Stats">
          <Metric label="Incoming job traffic" value={`${incomingTraffic.toFixed(0)} jobs/sec`} />
          <Metric label="Outgoing → orbit" value={`${outgoingToOrbit.toFixed(1)} jobs/sec`} />
          <Metric label="Global routing share" value={`${globalRoutingShare.toFixed(2)}%`} />
        </Section>

        {/* Reliability */}
        <Section title="Reliability">
          <Metric label="Downtime risk" value={downtimeRisk} />
          <Metric label="Cooling margin" value={`${coolingMargin.toFixed(1)}%`} />
        </Section>
      </div>
    );
  }

  // 3. LAUNCH SITES
  if (selectedEntity.type === "launch_site" || selectedEntity.type === "launch") {
    // Launch sites are stored differently - they might be in a separate array
    // For now, create a card with available info from the ID
    const siteName = selectedEntity.id.replace(/^launch_/, '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    return (
      <div 
        className="fixed bottom-0 left-0 right-0 sm:bottom-6 sm:left-6 sm:right-auto sm:w-80 sm:max-w-[90vw] panel-glass rounded-t-2xl sm:rounded-2xl p-3 sm:p-5 max-h-[70vh] sm:max-h-[85vh] overflow-y-auto z-[120] shadow-2xl border border-white/10"
        {...cardContainerProps}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-400 hover:text-white transition-colors z-10"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="text-xs uppercase text-gray-400 tracking-[0.2em] mb-1">{getEntityTypeLabel(selectedEntity.type)}</div>
        <h2 className="text-lg sm:text-xl font-semibold text-white mb-1 break-words pr-8">{siteName}</h2>
        <div className="text-xs text-gray-400 mb-3 sm:mb-4 break-words">Launch Facility</div>
        
        <Section title="Status">
          <Metric label="Operational status" value="Active" />
          <Metric label="Launch cadence" value="On demand" />
        </Section>

        <Section title="Capabilities">
          <Metric label="Launch capacity" value="Variable payload" />
          <Metric label="Orbit types" value="LEO, MEO, GEO" />
        </Section>

        <Section title="Economics">
          <Metric label="Launch cost baseline" value="$2,000/kg" />
          <Metric label="Reusability" value="Variable" />
        </Section>
      </div>
    );
  }

  return null;
}
