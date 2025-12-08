"use client";

import { useState, useEffect, useRef } from "react";
import { useSandboxStore } from "../store/sandboxStore";
import { formatDecimal } from "../lib/utils/formatNumber";
import {
  getOrbitalComputeKw,
  getOrbitHybridEnergyMwhPerYear,
  getOrbitHybridCo2TonsPerYear,
  getGroundEnergyMwhPerYear,
} from "../lib/sim/orbitConfig";

/**
 * MetricsGrid - 4 simplified metric cards (Cost, OPEX, Latency, Carbon)
 * No sliders, just Ground / Mix / Delta
 */
export default function MetricsGrid() {
  const simState = useSandboxStore((s) => s.simState);
  const { coolingOverhead } = useSandboxStore();
  const [pulsingCards, setPulsingCards] = useState<Set<string>>(new Set());
  const prevMetricsRef = useRef<{ opex: number; latency: number; carbon: number; cost: number } | null>(null);

  if (!simState) return null;

  const podsInOrbit = Math.floor(simState.podsInOrbit);
  const orbitalSpec = simState.orbitalPodSpec;
  const groundSpec = simState.groundDcSpec;
  const targetComputeKw = simState.targetComputeKw;

  // Calculate current metrics
  const orbitalComputeKw = getOrbitalComputeKw(podsInOrbit, orbitalSpec, simState.podDegradationFactor);
  const orbitalShare = targetComputeKw > 0 ? (orbitalComputeKw / targetComputeKw) : 0;

  const currentEnergyMwh = getOrbitHybridEnergyMwhPerYear(
    targetComputeKw,
    orbitalComputeKw,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );
  const currentCo2 = getOrbitHybridCo2TonsPerYear(
    targetComputeKw,
    podsInOrbit,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );
  // Calculate energy costs only (not including orbital OPEX)
  // Ground energy cost
  const groundKw = Math.max(0, targetComputeKw - orbitalComputeKw);
  const groundEnergyMwh = getGroundEnergyMwhPerYear(groundKw, groundSpec) * (1 + coolingOverhead);
  const groundEnergyCost = groundEnergyMwh * groundSpec.energyPricePerMwh;
  
  // Orbital energy is free (solar), so no energy cost
  const currentEnergyCost = groundEnergyCost; // Only ground energy costs

  // Baseline (ground-only) with cooling overhead
  const baselineEnergyMwh = getOrbitHybridEnergyMwhPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  ) * (1 + coolingOverhead);
  const baselineCo2 = getOrbitHybridCo2TonsPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  ) * (1 + coolingOverhead);
  // Baseline: ground-only energy costs (with cooling overhead)
  const baselineGroundEnergyMwh = getGroundEnergyMwhPerYear(targetComputeKw, groundSpec) * (1 + coolingOverhead);
  const baselineEnergyCost = baselineGroundEnergyMwh * groundSpec.energyPricePerMwh;

  // Simplified latency calculation
  const baselineLatency = 120; // ms
  const currentLatency = baselineLatency * (1 - orbitalShare * 0.38);

  // Calculate cost per compute: Energy costs only (not including OPEX)
  // Convert computeKw to TFLOP-yr: (kW * hours/year) / (kWh per TFLOP)
  // 1 kW * 8760 hours = 8760 kWh, and 1 TFLOP = 1000 kWh, so 1 kW = 8.76 TFLOP-yr
  const KWH_PER_TFLOP = 1000;
  const HOURS_PER_YEAR = 8760;
  const computeKwToTFLOPyr = HOURS_PER_YEAR / KWH_PER_TFLOP; // 8.76
  
  // Ground cost per TFLOP-yr: energy cost only (includes cooling overhead)
  const groundComputeTFLOPyr = targetComputeKw * computeKwToTFLOPyr;
  const groundEnergyMwhBaseline = getOrbitHybridEnergyMwhPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  ) * (1 + coolingOverhead);
  const groundEnergyCostOnly = groundEnergyMwhBaseline * groundSpec.energyPricePerMwh;
  const costPerComputeGround = groundComputeTFLOPyr > 0 
    ? groundEnergyCostOnly / groundComputeTFLOPyr 
    : 0;
  
  // Mixed cost per TFLOP-yr: weighted average of energy costs only
  // Ground portion: energy cost
  const groundKwMix = Math.max(0, targetComputeKw - orbitalComputeKw);
  const groundTFLOPyr = groundKwMix * computeKwToTFLOPyr;
  const groundEnergyMwhMix = getGroundEnergyMwhPerYear(groundKwMix, groundSpec) * (1 + coolingOverhead);
  const groundEnergyCostMix = groundEnergyMwhMix * groundSpec.energyPricePerMwh;
  const groundCostPerTFLOP = groundTFLOPyr > 0 
    ? groundEnergyCostMix / groundTFLOPyr 
    : costPerComputeGround;
  
  // Orbital portion: energy is free (solar), so cost per TFLOP-yr = $0
  const orbitalTFLOPyr = orbitalComputeKw * computeKwToTFLOPyr;
  const orbitalCostPerTFLOP = 0; // Free solar energy
  
  // Weighted average: (ground share * ground cost) + (orbital share * orbital cost)
  const totalTFLOPyr = groundTFLOPyr + orbitalTFLOPyr;
  const costPerComputeMix = totalTFLOPyr > 0
    ? ((groundTFLOPyr * groundCostPerTFLOP) + (orbitalTFLOPyr * orbitalCostPerTFLOP)) / totalTFLOPyr
    : costPerComputeGround;

  const metrics = [
    {
      id: "cost",
      title: "COST PER COMPUTE",
      ground: costPerComputeGround,
      mix: costPerComputeMix,
      unit: "$/TFLOP-yr",
      lowerIsBetter: true,
    },
    {
      id: "opex",
      title: "ANNUAL OPEX",
      ground: baselineEnergyCost,
      mix: currentEnergyCost,
      unit: "$/yr",
      lowerIsBetter: true,
    },
    {
      id: "latency",
      title: "LATENCY",
      ground: baselineLatency,
      mix: currentLatency,
      unit: "ms",
      lowerIsBetter: true,
    },
    {
      id: "carbon",
      title: "CARBON",
      ground: baselineCo2,
      mix: currentCo2,
      unit: "t/yr",
      lowerIsBetter: true,
    },
  ];

  // Detect metric changes and pulse affected cards
  useEffect(() => {
    if (!prevMetricsRef.current) {
      prevMetricsRef.current = {
        opex: currentEnergyCost,
        latency: currentLatency,
        carbon: currentCo2,
        cost: costPerComputeMix,
      };
      return;
    }

    const prev = prevMetricsRef.current;
    const newPulsing = new Set<string>();

    // Check for significant changes (>1% or >0.1ms for latency)
    if (Math.abs(currentEnergyCost - prev.opex) > prev.opex * 0.01) {
      newPulsing.add('opex');
    }
    if (Math.abs(currentLatency - prev.latency) > 0.1) {
      newPulsing.add('latency');
    }
    if (Math.abs(currentCo2 - prev.carbon) > prev.carbon * 0.01) {
      newPulsing.add('carbon');
    }
    if (Math.abs(costPerComputeMix - prev.cost) > prev.cost * 0.01) {
      newPulsing.add('cost');
    }

    if (newPulsing.size > 0) {
      setPulsingCards(newPulsing);
      // Remove pulse after 300ms
      setTimeout(() => {
        setPulsingCards(new Set());
      }, 300);
    }

    prevMetricsRef.current = {
      opex: currentEnergyCost,
      latency: currentLatency,
      carbon: currentCo2,
      cost: costPerComputeMix,
    };
  }, [currentEnergyCost, currentLatency, currentCo2, costPerComputeMix]);

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-30 pointer-events-auto w-full max-w-[95vw] px-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 justify-center">
        {metrics.map((metric) => {
          const delta = metric.mix - metric.ground;
          const deltaPct = metric.ground > 0 ? (delta / metric.ground) * 100 : 0;
          const isBetter = metric.lowerIsBetter ? delta < 0 : delta > 0;
          const isNeutral = Math.abs(deltaPct) < 5;
          
          const deltaColor = isBetter ? "text-green-400" : isNeutral ? "text-gray-400" : "text-red-400";
          const verdictText = isBetter && !isNeutral ? "Better with Orbit" : isNeutral ? "Tradeoff" : "Worse with Orbit";
          const verdictColor = isBetter && !isNeutral ? "bg-green-600" : isNeutral ? "bg-gray-600" : "bg-red-600";

          const isPulsing = pulsingCards.has(metric.id);
          const pulseColor = isBetter ? 'border-green-500' : 'border-red-500';
          const pulseClass = isPulsing ? `animate-pulse ${pulseColor}` : 'border-gray-700';

          return (
            <div 
              key={metric.title} 
              className={`panel border-2 p-3 md:p-4 transition-all ${pulseClass} w-full max-w-[280px] mx-auto`}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-semibold text-gray-300">{metric.title}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${verdictColor} text-white`}>
                  {verdictText}
                </span>
              </div>
              
              <div className="text-xs text-gray-400 mb-1">Ground: {formatDecimal(metric.ground, 1)} {metric.unit}</div>
              <div className="text-xs text-white mb-1">Orbit Mix: {formatDecimal(metric.mix, 1)} {metric.unit}</div>
              <div className={`text-xs ${deltaColor} mt-2 ${isPulsing ? 'font-bold' : ''}`}>
                Delta: {delta >= 0 ? '+' : ''}{formatDecimal(delta, 1)} {metric.unit} ({deltaPct >= 0 ? '+' : ''}{formatDecimal(deltaPct, 1)}% {isBetter ? 'better' : 'worse'})
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

