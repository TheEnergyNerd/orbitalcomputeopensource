/**
 * Cost Comparison Component
 * Displays orbit vs ground total system cost with verdict
 */

"use client";

import React from 'react';
import { compareCosts } from '../../lib/sim/econ/groundCost';
import type { OrbitCostBreakdown } from '../../lib/sim/econ/orbitCost';
import type { GroundCostBreakdown } from '../../lib/sim/econ/groundCost';

interface CostComparisonProps {
  orbitCost: OrbitCostBreakdown;
  groundCost: GroundCostBreakdown;
  targetTFLOPs: number;
  currentYear: number;
}

export default function CostComparison({
  orbitCost,
  groundCost,
  targetTFLOPs,
  currentYear,
}: CostComparisonProps) {
  const comparison = compareCosts(
    orbitCost.totalCost,
    groundCost.totalCost,
    targetTFLOPs,
    currentYear
  );

  return (
    <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700">
      <h3 className="text-lg font-semibold text-white mb-4">Total System Cost Comparison</h3>
      
      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Orbit Total Cost:</span>
          <span className="text-lg font-mono text-cyan-400">
            ${(comparison.orbitTotal / 1e9).toFixed(2)}B
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Ground Total Cost:</span>
          <span className="text-lg font-mono text-amber-400">
            ${(comparison.groundTotal / 1e9).toFixed(2)}B
          </span>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-700">
        <p className={`text-sm font-semibold ${
          comparison.crossoverYear 
            ? 'text-green-400' 
            : 'text-gray-300'
        }`}>
          {comparison.verdict}
        </p>
      </div>
    </div>
  );
}

