"use client";

import { useState, useRef, useEffect } from "react";
import { useSandboxStore } from "../store/sandboxStore";
import { formatDecimal } from "../lib/utils/formatNumber";
import { getOrbitalComputeKw } from "../lib/sim/orbitConfig";
import { showReactionMessage } from "./LiveReactionMessages";

/**
 * ControlsPanel - 6 controls for Overview tab
 * - Orbital Share
 * - Pod Gen (Gen 1/2/3)
 * - Launch Capacity
 * - Ground Energy Price
 * - Launch Reliability
 * - Ground Cooling Overhead
 */
export default function ControlsPanel() {
  const { 
    simState,
    setOrbitShare,
    selectedPodTier,
    setSelectedPodTier,
    launchSlotsThisMonth,
    setLaunchCapacity,
    launchReliability,
    setLaunchReliability,
    coolingOverhead,
    setCoolingOverhead,
    setGroundEnergyPrice,
  } = useSandboxStore();

  if (!simState) return null;

  // Calculate current orbital share
  const podsInOrbit = Math.floor(simState.podsInOrbit);
  const orbitalComputeKw = getOrbitalComputeKw(
    podsInOrbit,
    simState.orbitalPodSpec,
    simState.podDegradationFactor
  );
  const targetComputeKw = simState.targetComputeKw;
  const currentOrbitalShare = targetComputeKw > 0 ? (orbitalComputeKw / targetComputeKw) * 100 : 0;

  // Pod generation: tier1 = Gen 1, tier2 = Gen 2, tier3 = Gen 3
  const podGen = selectedPodTier === 'tier1' ? 1 : selectedPodTier === 'tier2' ? 2 : 3;

  // Launch capacity (simplified - use launch slots)
  const launchCapacity = launchSlotsThisMonth || 1;

  // Ground energy price
  const groundEnergyPrice = simState.groundDcSpec.energyPricePerMwh;

  const prevOrbitalShareRef = useRef(currentOrbitalShare);
  const prevPodGenRef = useRef(podGen);
  const prevLaunchCapacityRef = useRef(launchCapacity);
  const prevGroundEnergyRef = useRef(groundEnergyPrice);
  const prevLaunchReliabilityRef = useRef(launchReliability);
  const prevCoolingOverheadRef = useRef(coolingOverhead);

  useEffect(() => {
    prevOrbitalShareRef.current = currentOrbitalShare;
    prevPodGenRef.current = podGen;
    prevLaunchCapacityRef.current = launchCapacity;
    prevGroundEnergyRef.current = groundEnergyPrice;
    prevLaunchReliabilityRef.current = launchReliability;
    prevCoolingOverheadRef.current = coolingOverhead;
  });

  const handleOrbitShareChange = (value: number) => {
    const oldValue = prevOrbitalShareRef.current;
    setOrbitShare(value);
    
    if (value > oldValue) {
      showReactionMessage("Launch Requirements Spiking");
      showReactionMessage("Latency Improving");
      showReactionMessage("Carbon Savings Increased");
    } else {
      showReactionMessage("OPEX Improving");
    }
    
    window.dispatchEvent(new CustomEvent('controls-changed'));
  };

  const handlePodGenChange = (gen: number) => {
    const oldGen = prevPodGenRef.current;
    const tier = gen === 1 ? 'tier1' : gen === 2 ? 'tier2' : 'tier3';
    setSelectedPodTier(tier);
    
    if (gen > oldGen) {
      showReactionMessage("Carbon Savings Increased");
      showReactionMessage("Latency Improving");
    } else {
      showReactionMessage("OPEX Improving");
    }
    
    window.dispatchEvent(new CustomEvent('controls-changed'));
  };

  const handleLaunchCapacityChange = (value: number) => {
    const oldValue = prevLaunchCapacityRef.current;
    setLaunchCapacity(value);
    
    if (value > oldValue) {
      showReactionMessage("Launch Stress Reduced");
    }
    
    window.dispatchEvent(new CustomEvent('controls-changed'));
  };

  const handleGroundEnergyChange = (value: number) => {
    const oldValue = prevGroundEnergyRef.current;
    setGroundEnergyPrice(value);
    
    if (value > oldValue) {
      showReactionMessage("Ground baseline worsened");
      showReactionMessage("Orbital compute more attractive");
    } else {
      showReactionMessage("Ground baseline improved");
    }
    
    window.dispatchEvent(new CustomEvent('controls-changed'));
  };

  const handleLaunchReliabilityChange = (value: number) => {
    const oldValue = prevLaunchReliabilityRef.current;
    setLaunchReliability(value / 100);
    
    if (value / 100 > oldValue) {
      showReactionMessage("Launch Requirements Reduced");
    }
    
    window.dispatchEvent(new CustomEvent('controls-changed'));
  };

  const handleCoolingOverheadChange = (value: number) => {
    const oldValue = prevCoolingOverheadRef.current;
    setCoolingOverhead(value / 100);
    
    if (value / 100 > oldValue) {
      showReactionMessage("Ground baseline worsened (Cooling Overhead ↑)");
    }
    
    window.dispatchEvent(new CustomEvent('controls-changed'));
  };

  return (
    <div className="fixed top-[220px] left-1/2 transform -translate-x-1/2 z-30 panel pointer-events-auto w-[95%] max-w-[1000px] px-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 text-xs">
        {/* Orbital Share */}
        <div className="group relative">
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">Orbital Share</span>
            <span className="text-white font-semibold">{formatDecimal(currentOrbitalShare, 1)}%</span>
          </div>
          <div className="flex items-center gap-1 mb-1 text-[8px] text-gray-500">
            <span>Latency: ↓</span>
            <span>Carbon: ↓</span>
            <span>OPEX: ↑</span>
            <span>Launches: ↑↑</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={currentOrbitalShare}
            onChange={(e) => handleOrbitShareChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            title="Increases carbon savings & lowers latency. Higher share increases OPEX + launch demand."
          />
        </div>

        {/* Pod Generation */}
        <div className="group relative">
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">Pod Gen</span>
            <span className="text-white font-semibold">Gen {podGen}</span>
          </div>
          <div className="flex items-center gap-1 mb-1 text-[8px] text-gray-500">
            <span>Energy: ↓</span>
            <span>Carbon: ↓</span>
            <span>Capex: ↑</span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3].map(gen => (
              <button
                key={gen}
                onClick={() => handlePodGenChange(gen)}
                className={`flex-1 py-1 px-2 rounded text-[10px] transition ${
                  podGen === gen
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
                title="Higher generations: cleaner compute, lower latency, higher capex."
              >
                Gen {gen}
              </button>
            ))}
          </div>
        </div>

        {/* Launch Capacity */}
        <div className="group relative">
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">Launch Capacity</span>
            <span className="text-white font-semibold">{launchCapacity}/mo</span>
          </div>
          <div className="flex items-center gap-1 mb-1 text-[8px] text-gray-500">
            <span>Stress: ↓</span>
          </div>
          <input
            type="range"
            min="1"
            max="40"
            value={launchCapacity}
            onChange={(e) => handleLaunchCapacityChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            title="Raises max pods/month. Prevents launch stress."
          />
        </div>

        {/* Ground Energy Price */}
        <div className="group relative">
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">Ground Energy</span>
            <span className="text-white font-semibold">${groundEnergyPrice}/MWh</span>
          </div>
          <div className="flex items-center gap-1 mb-1 text-[8px] text-gray-500">
            <span>Orbit: ↑</span>
          </div>
          <input
            type="range"
            min="30"
            max="100"
            value={groundEnergyPrice}
            onChange={(e) => handleGroundEnergyChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            title="Higher price makes orbital compute economically attractive."
          />
        </div>

        {/* Launch Reliability */}
        <div className="group relative">
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">Launch Reliability</span>
            <span className="text-white font-semibold">{formatDecimal(launchReliability * 100, 1)}%</span>
          </div>
          <div className="flex items-center gap-1 mb-1 text-[8px] text-gray-500">
            <span>Launches: ↓</span>
          </div>
          <input
            type="range"
            min="80"
            max="99.9"
            step="0.1"
            value={launchReliability * 100}
            onChange={(e) => handleLaunchReliabilityChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            title="Higher reliability reduces launch count needed."
          />
        </div>

        {/* Ground Cooling Overhead */}
        <div className="group relative">
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">Cooling Overhead</span>
            <span className="text-white font-semibold">{formatDecimal(coolingOverhead * 100, 0)}%</span>
          </div>
          <div className="flex items-center gap-1 mb-1 text-[8px] text-gray-500">
            <span>Ground: ↑</span>
          </div>
          <input
            type="range"
            min="10"
            max="50"
            value={coolingOverhead * 100}
            onChange={(e) => handleCoolingOverheadChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            title="Increases ground energy + carbon baseline."
          />
        </div>
      </div>
    </div>
  );
}

