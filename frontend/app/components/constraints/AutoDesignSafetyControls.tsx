"use client";

import { useState } from "react";
import type { RiskMode } from "../../lib/orbitSim/thermalIntegration";

interface AutoDesignSafetyControlsProps {
  autoDesignMode: boolean;
  riskMode: RiskMode;
  onAutoDesignModeChange: (enabled: boolean) => void;
  onRiskModeChange: (mode: RiskMode) => void;
}

export default function AutoDesignSafetyControls({
  autoDesignMode,
  riskMode,
  onAutoDesignModeChange,
  onRiskModeChange,
}: AutoDesignSafetyControlsProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h3 className="text-lg font-bold mb-4">Auto-Design Safety</h3>
      
      {/* Auto-Design Toggle */}
      <div className="mb-4">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-sm font-semibold text-gray-300">Auto-Design Safety</div>
            <div className="text-xs text-gray-500 mt-1">
              Automatically clamp compute to safe limits based on thermal, backhaul, and maintenance constraints
            </div>
          </div>
          <input
            type="checkbox"
            checked={autoDesignMode}
            onChange={(e) => onAutoDesignModeChange(e.target.checked)}
            className="w-5 h-5 rounded accent-accent-blue cursor-pointer"
          />
        </label>
      </div>
      
      {/* Risk Mode Dropdown */}
      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-300 mb-2">
          Risk Mode
        </label>
        <select
          value={riskMode}
          onChange={(e) => onRiskModeChange(e.target.value as RiskMode)}
          className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:border-accent-blue focus:outline-none cursor-pointer pointer-events-auto z-50 relative"
          style={{ pointerEvents: 'auto' }}
        >
          <option value="SAFE">SAFE - Conservative margins (70% thermal, 90% backhaul/maintenance)</option>
          <option value="AGGRESSIVE">AGGRESSIVE - Tight margins (95% thermal, 100% backhaul/maintenance)</option>
          <option value="YOLO">YOLO - No safety clamp, full physics death possible</option>
        </select>
        <div className="text-xs text-gray-500 mt-2">
          {riskMode === "SAFE" && "Default baseline: temp ~70-80°C, near-zero thermal drift, stable survival"}
          {riskMode === "AGGRESSIVE" && "Can easily tip into mild overheating, higher failure rates"}
          {riskMode === "YOLO" && "No safety limits - sliders can drive temps into failure territory"}
        </div>
      </div>
      
      {/* Status Display */}
      <div className="mt-4 p-3 bg-gray-700/50 rounded border border-gray-600">
        <div className="text-xs text-gray-400 mb-1">Current Status</div>
        <div className="text-sm text-white">
          <div>Mode: <span className="font-semibold">{autoDesignMode ? "AUTO-DESIGN" : "MANUAL"}</span></div>
          <div>Risk: <span className="font-semibold">{riskMode}</span></div>
        </div>
      </div>
    </div>
  );
}

