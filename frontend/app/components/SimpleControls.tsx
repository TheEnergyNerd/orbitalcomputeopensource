"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { formatDecimal } from "../lib/utils/formatNumber";

/**
 * SimpleControls - 3-4 global sliders for Overview tab
 * - Orbital Share
 * - Pod Generation (Gen 1/2/3)
 * - Launch Capacity
 * - Ground Energy Price
 */
export default function SimpleControls() {
  const { 
    simState,
    setOrbitShare,
    selectedPodTier,
    setSelectedPodTier,
    launchSlotsThisMonth,
    setLaunchThreshold,
  } = useSandboxStore();

  if (!simState) return null;

  // Calculate current orbital share
  const podsInOrbit = Math.floor(simState.podsInOrbit);
  const orbitalComputeKw = simState.orbitalPodSpec.computeKw * podsInOrbit * simState.podDegradationFactor;
  const targetComputeKw = simState.targetComputeKw;
  const currentOrbitalShare = targetComputeKw > 0 ? (orbitalComputeKw / targetComputeKw) * 100 : 0;

  // Pod generation: tier1 = Gen 1, tier2 = Gen 2, tier3 = Gen 3
  const podGen = selectedPodTier === 'tier1' ? 1 : selectedPodTier === 'tier2' ? 2 : 3;

  // Launch capacity (simplified - use launch slots)
  const launchCapacity = launchSlotsThisMonth || 1;

  // Ground energy price
  const groundEnergyPrice = simState.groundDcSpec.energyPricePerMwh;

  const handleOrbitShareChange = (value: number) => {
    setOrbitShare(value);
    window.dispatchEvent(new CustomEvent('controls-changed'));
  };

  const handlePodGenChange = (gen: number) => {
    const tier = gen === 1 ? 'tier1' : gen === 2 ? 'tier2' : 'tier3';
    setSelectedPodTier(tier);
    window.dispatchEvent(new CustomEvent('controls-changed'));
  };

  const handleLaunchCapacityChange = (value: number) => {
    // Simplified: set launch threshold which affects capacity
    setLaunchThreshold(Math.max(1, Math.floor(value)));
    window.dispatchEvent(new CustomEvent('controls-changed'));
  };

  const handleGroundEnergyChange = (value: number) => {
    // Update ground energy price in simState
    // This would need to be added to the store
    window.dispatchEvent(new CustomEvent('controls-changed'));
  };

  return (
    <div className="fixed top-[280px] left-1/2 transform -translate-x-1/2 z-30 panel pointer-events-auto" style={{ width: "90%", maxWidth: "900px" }}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        {/* Orbital Share */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">Orbital Share</span>
            <span className="text-white font-semibold">{formatDecimal(currentOrbitalShare, 1)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={currentOrbitalShare}
            onChange={(e) => handleOrbitShareChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
        </div>

        {/* Pod Generation */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">Pod Gen</span>
            <span className="text-white font-semibold">Gen {podGen}</span>
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
              >
                Gen {gen}
              </button>
            ))}
          </div>
        </div>

        {/* Launch Capacity */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">Launch Capacity</span>
            <span className="text-white font-semibold">{launchCapacity}/mo</span>
          </div>
          <input
            type="range"
            min="1"
            max="20"
            value={launchCapacity}
            onChange={(e) => handleLaunchCapacityChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
        </div>

        {/* Ground Energy Price */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">Ground Energy</span>
            <span className="text-white font-semibold">${groundEnergyPrice}/MWh</span>
          </div>
          <input
            type="range"
            min="30"
            max="100"
            value={groundEnergyPrice}
            onChange={(e) => handleGroundEnergyChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
        </div>
      </div>
    </div>
  );
}

