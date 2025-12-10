"use client";

import type { DominantConstraint } from "../../lib/orbitSim/debugState";

interface ConstraintTimelineEntry {
  year: number;
  dominantConstraint: DominantConstraint;
  constraintValues: {
    launch: number;
    heat: number;
    backhaul: number;
    autonomy: number;
  };
}

interface RiskRegimeTimelineProps {
  constraintTimeline: ConstraintTimelineEntry[];
}

export default function RiskRegimeTimeline({ constraintTimeline }: RiskRegimeTimelineProps) {
  if (constraintTimeline.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">Risk Regime Timeline</h3>
        <p className="text-gray-400">No data available</p>
      </div>
    );
  }
  
  const getRegimeLabel = (constraint: DominantConstraint): string => {
    switch (constraint) {
      case "LAUNCH":
        return "Launch-Limited Era";
      case "HEAT":
        return "Thermal-Limited Era";
      case "BACKHAUL":
        return "Backhaul-Limited Era";
      case "AUTONOMY":
        return "Autonomy-Limited Era";
      default:
        return "Steady-State Orbit Compute Era";
    }
  };
  
  const getRegimeColor = (constraint: DominantConstraint): string => {
    switch (constraint) {
      case "LAUNCH":
        return "bg-yellow-600";
      case "HEAT":
        return "bg-orange-600";
      case "BACKHAUL":
        return "bg-blue-600";
      case "AUTONOMY":
        return "bg-red-600";
      default:
        return "bg-green-600";
    }
  };
  
  const getRegimeIcon = (constraint: DominantConstraint): string => {
    switch (constraint) {
      case "LAUNCH":
        return "🚀";
      case "HEAT":
        return "🔥";
      case "BACKHAUL":
        return "📡";
      case "AUTONOMY":
        return "🤖";
      default:
        return "✅";
    }
  };
  
  // Group consecutive years with same constraint
  const regimes: Array<{ constraint: DominantConstraint; startYear: number; endYear: number }> = [];
  let currentRegime: DominantConstraint | null = null;
  let startYear = 0;
  
  constraintTimeline.forEach((entry, idx) => {
    if (entry.dominantConstraint !== currentRegime) {
      if (currentRegime !== null) {
        regimes.push({
          constraint: currentRegime,
          startYear,
          endYear: constraintTimeline[idx - 1].year,
        });
      }
      currentRegime = entry.dominantConstraint;
      startYear = entry.year;
    }
  });
  
  // Add last regime
  if (currentRegime !== null && constraintTimeline.length > 0) {
    regimes.push({
      constraint: currentRegime,
      startYear,
      endYear: constraintTimeline[constraintTimeline.length - 1].year,
    });
  }
  
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-bold mb-4">Risk Regime Timeline</h3>
      <p className="text-sm text-gray-400 mb-6">
        Dominant constraint by year (auto-advances based on ceiling dominance)
      </p>
      
      <div className="space-y-3">
        {regimes.map((regime, idx) => (
          <div
            key={idx}
            className={`${getRegimeColor(regime.constraint)} rounded-lg p-4 flex items-center justify-between`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{getRegimeIcon(regime.constraint)}</span>
              <div>
                <div className="font-semibold text-white">{getRegimeLabel(regime.constraint)}</div>
                <div className="text-sm text-white/80">
                  {regime.startYear === regime.endYear
                    ? `Year ${regime.startYear}`
                    : `Years ${regime.startYear} - ${regime.endYear}`}
                </div>
              </div>
            </div>
            <div className="text-white/80 text-sm font-semibold">
              {regime.constraint}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

