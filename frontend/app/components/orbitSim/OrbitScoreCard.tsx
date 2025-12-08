"use client";

import { useOrbitSimStore } from "../../store/orbitSimStore";
import { formatDecimal } from "../../lib/utils/formatNumber";

/**
 * OrbitScoreCard - Shows ORBITSCORE with breakdown
 */
export default function OrbitScoreCard() {
  const { state } = useOrbitSimStore();
  const opexDelta = (state.metrics.orbitOpex - state.metrics.groundOpex) / state.metrics.groundOpex;
  const carbonDelta = (state.metrics.orbitCarbon - state.metrics.groundCarbon) / state.metrics.groundCarbon;
  
  // Calculate score components
  const orbitAdvantage = Math.max(0, -opexDelta); // positive when orbit is cheaper
  const carbonAdvantage = Math.max(0, -carbonDelta);
  const launchRisk = Math.min(1, state.flow.backlogFactor / 3); // 0-1, higher is worse
  
  const opexContribution = Math.round(3000 * orbitAdvantage);
  const carbonContribution = Math.round(1000 * carbonAdvantage);
  const riskPenalty = Math.round(200 * launchRisk);
  
  const baseScore = opexContribution + carbonContribution - riskPenalty;
  const breakpointBonus = state.breakpointReached ? 2000 : 0;
  const totalScore = Math.max(0, baseScore + breakpointBonus);

  // Visual comparison bars
  const maxOpex = Math.max(state.metrics.groundOpex, state.metrics.orbitOpex);
  const groundBarWidth = (state.metrics.groundOpex / maxOpex) * 100;
  const orbitBarWidth = (state.metrics.orbitOpex / maxOpex) * 100;

  return (
    <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
      <div className="text-2xl font-bold text-cyan-400 font-mono mb-3">
        ORBITSCORE: {state.orbitScore.toLocaleString()}
      </div>
      
      {/* Clean breakdown list */}
      <div className="space-y-1 font-mono text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">OPEX advantage</span>
          <span className="text-green-400">+{opexContribution.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Carbon advantage</span>
          <span className="text-green-400">+{carbonContribution.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Launch failures</span>
          <span className="text-red-400">-{riskPenalty.toLocaleString()}</span>
        </div>
        {state.breakpointReached && (
          <div className="flex justify-between">
            <span className="text-gray-400">Breakpoint bonus</span>
            <span className="text-green-400">+2,000</span>
          </div>
        )}
      </div>
    </div>
  );
}

