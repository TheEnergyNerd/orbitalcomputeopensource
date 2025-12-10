"use client";

import { useState } from "react";

export default function LaunchEconomicsSlider() {
  const [costPerKg, setCostPerKg] = useState(2000); // $/kg to LEO (baseline)
  
  const scenarios = {
    optimistic: 1000,
    baseline: 2000,
    pessimistic: 5000,
  };
  
  const getScenarioLabel = (cost: number): string => {
    if (cost <= scenarios.optimistic) return "Optimistic";
    if (cost <= scenarios.baseline) return "Baseline";
    return "Pessimistic";
  };
  
  const getScenarioColor = (cost: number): string => {
    if (cost <= scenarios.optimistic) return "text-green-400";
    if (cost <= scenarios.baseline) return "text-yellow-400";
    return "text-red-400";
  };
  
  // Calculate impact on launch ceiling (simplified)
  const baseLaunchCapacity = 100; // launches/year
  const basePayloadPerLaunch = 100000; // kg
  const baseBudget = 5000; // $M
  
  const massBudget = baseLaunchCapacity * basePayloadPerLaunch; // kg
  const costBudget = baseBudget * 1e6; // $
  
  // Adjusted based on cost per kg
  const adjustedCostBudget = costBudget / (costPerKg / scenarios.baseline);
  const adjustedLaunchCapacity = Math.min(
    baseLaunchCapacity,
    adjustedCostBudget / (basePayloadPerLaunch * costPerKg)
  );
  
  const launchMassCeiling = Math.floor(massBudget / 1000); // Assuming 1000 kg per satellite
  const launchCostCeiling = Math.floor(adjustedCostBudget / (costPerKg * 1000));
  const launchCeiling = Math.min(launchMassCeiling, launchCostCeiling);
  
  // Estimate cost crossover year shift (simplified)
  const crossoverYearShift = Math.round((costPerKg / scenarios.baseline - 1) * 5);
  
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-bold mb-4">Launch Economics Sensitivity</h3>
      <p className="text-sm text-gray-400 mb-6">
        Interactive $/kg to LEO slider. Drag to see how launch ceiling, compute curve, and cost crossover year shift live.
      </p>
      
      <div className="space-y-6">
        {/* Slider */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-semibold">$/kg to LEO</label>
            <span className={`text-lg font-bold ${getScenarioColor(costPerKg)}`}>
              ${costPerKg.toLocaleString()} /kg
            </span>
          </div>
          <input
            type="range"
            min="500"
            max="10000"
            step="100"
            value={costPerKg}
            onChange={(e) => setCostPerKg(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Optimistic ($1,000)</span>
            <span>Baseline ($2,000)</span>
            <span>Pessimistic ($5,000)</span>
          </div>
        </div>
        
        {/* Impact Display */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-700 rounded p-4">
            <div className="text-xs text-gray-400 mb-1">Scenario</div>
            <div className={`text-lg font-semibold ${getScenarioColor(costPerKg)}`}>
              {getScenarioLabel(costPerKg)}
            </div>
          </div>
          
          <div className="bg-gray-700 rounded p-4">
            <div className="text-xs text-gray-400 mb-1">Launch Ceiling</div>
            <div className="text-lg font-semibold text-white">
              {launchCeiling.toLocaleString()} satellites/year
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {launchCeiling < launchMassCeiling ? "Cost-limited" : "Mass-limited"}
            </div>
          </div>
          
          <div className="bg-gray-700 rounded p-4">
            <div className="text-xs text-gray-400 mb-1">Cost Crossover Year Shift</div>
            <div className={`text-lg font-semibold ${
              crossoverYearShift > 0 ? "text-red-400" : 
              crossoverYearShift < 0 ? "text-green-400" : 
              "text-white"
            }`}>
              {crossoverYearShift > 0 ? "+" : ""}{crossoverYearShift} years
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {crossoverYearShift > 0 ? "Delayed" : crossoverYearShift < 0 ? "Accelerated" : "No change"}
            </div>
          </div>
        </div>
        
        {/* Explanation */}
        <div className="bg-blue-900/20 border border-blue-500/30 rounded p-4">
          <p className="text-sm text-blue-200">
            <strong>Key Insight:</strong> Orbital compute is not computable without launch economics behaving.
            Higher $/kg means fewer satellites can be launched per dollar, directly limiting growth.
          </p>
        </div>
      </div>
    </div>
  );
}

