"use client";

import { useV1SandboxStore } from "../../store/v1SandboxStore";
import { formatDecimal } from "../../lib/utils/formatNumber";

/**
 * Three Lever Controls Panel
 * Only shows: Orbital Share, Ground Efficiency, Launch Cadence
 */
export default function ThreeLeverControls() {
  const {
    orbitalShare,
    groundEfficiency,
    launchCadence,
    setOrbitalShare,
    setGroundEfficiency,
    setLaunchCadence,
  } = useV1SandboxStore();

  return (
    <div className="fixed top-[220px] left-1/2 transform -translate-x-1/2 z-30 panel pointer-events-auto w-[95%] max-w-[800px] px-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 text-xs">
        {/* Orbital Share */}
        <div className="group relative">
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">Orbital Compute Share</span>
            <span className="text-white font-semibold">{formatDecimal(orbitalShare * 100, 1)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="90"
            value={orbitalShare * 100}
            onChange={(e) => setOrbitalShare(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            title="Percentage of compute capacity in orbit (0-90%)"
          />
        </div>

        {/* Ground Efficiency */}
        <div className="group relative">
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">Ground Efficiency</span>
            <span className="text-white font-semibold">{formatDecimal(groundEfficiency * 100, 0)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={groundEfficiency * 100}
            onChange={(e) => setGroundEfficiency(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            title="Ground data center efficiency index (0-100%)"
          />
        </div>

        {/* Launch Cadence */}
        <div className="group relative">
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">Launch Cadence</span>
            <span className="text-white font-semibold">{launchCadence}/mo</span>
          </div>
          <input
            type="range"
            min="1"
            max="30"
            value={launchCadence}
            onChange={(e) => setLaunchCadence(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            title="Number of launches per month (1-30)"
          />
        </div>
      </div>
    </div>
  );
}

