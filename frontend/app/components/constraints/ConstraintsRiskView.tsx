"use client";

import { useState, useEffect } from "react";
import { getDebugState, getConstraintTimeline, exportDebugData } from "../../lib/orbitSim/debugState";
import AutoDesignSafetyControls from "./AutoDesignSafetyControls";
import type { RiskMode } from "../../lib/orbitSim/thermalIntegration";
import CeilingStackChart from "./CeilingStackChart";
import FailureReplacementChart from "./FailureReplacementChart";
import ThermalUtilizationGauge from "./ThermalUtilizationGauge";
import LaunchEconomicsSlider from "./LaunchEconomicsSlider";
import AutonomyMaturityCurve from "./AutonomyMaturityCurve";
import RiskRegimeTimeline from "./RiskRegimeTimeline";
import DebugPanel from "./DebugPanel";
import EnergyReturnOnLaunch from "./EnergyReturnOnLaunch";
import PowerStrandedChart from "./PowerStrandedChart";
import ThermalRejectionMargin from "./ThermalRejectionMargin";
import RadiatorScalingChart from "./RadiatorScalingChart";

export default function ConstraintsRiskView() {
  const [debugState, setDebugState] = useState(getDebugState());
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showGraphOverlay, setShowGraphOverlay] = useState(false);
  const [autoDesignMode, setAutoDesignMode] = useState(true);
  const [riskMode, setRiskMode] = useState<RiskMode>("SAFE");
  
  // Refresh debug state periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setDebugState(getDebugState());
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "d" || e.key === "D") {
        setShowDebugPanel(prev => !prev);
      }
      if (e.key === "g" || e.key === "G") {
        setShowGraphOverlay(prev => !prev);
      }
    };
    
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, []);
  
  const constraintTimeline = getConstraintTimeline();
  const years = Object.keys(debugState)
    .filter(key => key !== "errors")
    .map(Number)
    .sort((a, b) => a - b);
  
  const currentYear = years[years.length - 1] || 2025;
  const currentState = debugState[currentYear];
  
  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 pt-24 sm:pt-28">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Auto-Design Safety Controls */}
        <AutoDesignSafetyControls
          autoDesignMode={autoDesignMode}
          riskMode={riskMode}
          onAutoDesignModeChange={setAutoDesignMode}
          onRiskModeChange={setRiskMode}
        />
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Constraints & Risk</h1>
            <p className="text-gray-400 text-sm mt-1">
              Structural limits on orbital compute growth
            </p>
          </div>
          <div className="flex gap-2 pointer-events-auto z-50 relative">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowDebugPanel(prev => !prev);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-semibold cursor-pointer z-50 relative"
              type="button"
            >
              {showDebugPanel ? "Hide" : "Show"} Debug (D)
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                exportDebugData();
              }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-semibold cursor-pointer z-50 relative"
              type="button"
            >
              Export Debug Data
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowGraphOverlay(prev => !prev);
              }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm font-semibold cursor-pointer z-50 relative"
              type="button"
            >
              {showGraphOverlay ? "Hide" : "Show"} Graph (G)
            </button>
          </div>
        </div>
        
        {/* Error Banner */}
        {debugState.errors && debugState.errors.length > 0 && (
          <div className="bg-red-900/50 border border-red-500 rounded p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-red-400 font-bold text-lg">MODEL BROKEN</span>
              <span className="text-red-300 text-sm">
                {debugState.errors.length} error(s) detected
              </span>
            </div>
            <div className="text-red-200 text-sm space-y-1 max-h-32 overflow-y-auto">
              {debugState.errors.slice(0, 5).map((error, idx) => (
                <div key={idx}>
                  Year {error.year}: {error.error}
                </div>
              ))}
              {debugState.errors.length > 5 && (
                <div className="text-red-300 italic">
                  ... and {debugState.errors.length - 5} more errors
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Main Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ceiling Stack Chart */}
          <div className="lg:col-span-2">
            <CeilingStackChart debugState={debugState} />
          </div>
          
          {/* Failure vs Replacement Chart */}
          <div>
            <FailureReplacementChart debugState={debugState} />
          </div>
          
          {/* Thermal Utilization Gauge */}
          <div>
            <ThermalUtilizationGauge currentState={currentState} />
          </div>
          
          {/* Launch Economics Slider */}
          <div className="lg:col-span-2">
            <LaunchEconomicsSlider />
          </div>
          
          {/* Autonomy Maturity Curve */}
          <div className="lg:col-span-2">
            <AutonomyMaturityCurve debugState={debugState} />
          </div>
          
          {/* Risk Regime Timeline */}
          <div className="lg:col-span-2">
            <RiskRegimeTimeline constraintTimeline={constraintTimeline} />
          </div>
          
          {/* Energy Return on Launch */}
          <div className="lg:col-span-2">
            <EnergyReturnOnLaunch debugState={debugState} />
          </div>
          
          {/* Power Stranded vs Power Used */}
          <div className="lg:col-span-2">
            <PowerStrandedChart debugState={debugState} />
          </div>
          
          {/* Thermal Rejection Margin */}
          <div className="lg:col-span-2">
            <ThermalRejectionMargin debugState={debugState} />
          </div>
          
          {/* Radiator Scaling vs Compute Density */}
          <div className="lg:col-span-2">
            <RadiatorScalingChart debugState={debugState} />
          </div>
        </div>
        
        {/* Debug Panel */}
        {showDebugPanel && (
          <DebugPanel currentState={currentState} currentYear={currentYear} />
        )}
        
        {/* Graph Overlay */}
        {showGraphOverlay && (
          <div className="fixed inset-0 bg-black/90 z-[100] p-8 overflow-auto pointer-events-auto">
            <div className="max-w-6xl mx-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Real-time Constraint Graph</h2>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowGraphOverlay(false);
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded cursor-pointer z-[101] relative"
                  type="button"
                >
                  Close (G)
                </button>
              </div>
              <CeilingStackChart debugState={debugState} fullScreen />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

