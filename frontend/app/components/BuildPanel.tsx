"use client";

import { useState, useEffect } from "react";
import { useOrbitalUnitsStore, UNIT_DEFINITIONS, UnitType } from "../store/orbitalUnitsStore";
import { useSandboxStore } from "../store/sandboxStore";
import { calculateDeploymentEngine, type DeploymentState } from "../lib/deployment/deploymentEngine";

interface BuildPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BuildPanel({ isOpen, onClose }: BuildPanelProps) {
  const [selectedType, setSelectedType] = useState<UnitType>("leo_pod");
  const [quantity, setQuantity] = useState(1);
  const [queueFullError, setQueueFullError] = useState(false);
  const { addToQueue, getDeployedUnits, getQueuedUnits } = useOrbitalUnitsStore();
  const { unlockedUnits, selectedPodTier, orbitMode, activeLaunchProviders, totalPodsBuilt } = useSandboxStore();

  const unitDef = UNIT_DEFINITIONS[selectedType];
  
  // Check queue capacity
  const deployedUnits = getDeployedUnits();
  const queuedUnits = getQueuedUnits();
  const deploymentState: DeploymentState = {
    totalPodsBuilt,
    totalPodsInOrbit: deployedUnits.length,
    totalPodsInQueue: queuedUnits.length,
    activeLaunchProviders,
  };
  const engine = calculateDeploymentEngine(deploymentState);
  const canAddToQueue = queuedUnits.length + quantity <= engine.maxQueue;

  // Clear stale "queue full" error when the panel is reopened
  useEffect(() => {
    if (isOpen) {
      setQueueFullError(false);
    }
  }, [isOpen]);

  // Also clear the error once there is actually room in the queue again
  useEffect(() => {
    if (queueFullError && queuedUnits.length < engine.maxQueue) {
      setQueueFullError(false);
    }
  }, [queueFullError, queuedUnits.length, engine.maxQueue]);

  if (!isOpen) return null;

  const handleDeploy = () => {
    setQueueFullError(false);
    let successCount = 0;
    
    // Add multiple units based on quantity
    for (let i = 0; i < quantity; i++) {
      const added = addToQueue({
        type: selectedType,
        name: unitDef.name,
        cost: unitDef.cost,
        powerOutputMw: unitDef.powerOutputMw,
        latencyMs: unitDef.latencyMs,
        lifetimeYears: unitDef.lifetimeYears,
        buildTimeDays: unitDef.buildTimeDays,
      }, {
        podTier: selectedPodTier,
        orbitMode,
        activeLaunchProviders,
      });
      
      if (added) {
        successCount++;
      } else {
        setQueueFullError(true);
        break; // Stop if queue is full
      }
    }
    
    if (successCount > 0) {
    onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none p-0 sm:p-2 sm:p-4">
      <div className="panel-glass rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 w-full sm:max-w-2xl sm:min-w-[280px] shadow-2xl pointer-events-auto border-2 border-accent-blue/50 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-accent-blue">Deploy Orbital Compute Unit</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Unit Type Selection */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-300 mb-3">
            Unit Type
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-1 gap-3">
            {(["leo_pod"] as UnitType[]).map((type) => {
              const def = UNIT_DEFINITIONS[type];
              const isSelected = selectedType === type;
              const isUnlocked = unlockedUnits.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => isUnlocked && setSelectedType(type)}
                  disabled={!isUnlocked}
                  className={`p-4 rounded-xl border-2 transition-all relative ${
                    !isUnlocked
                      ? "border-gray-800 bg-gray-900/50 opacity-50 cursor-not-allowed"
                      : isSelected
                      ? "border-accent-blue bg-accent-blue/20"
                      : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
                  }`}
                >
                  {!isUnlocked && (
                    <div className="absolute top-2 right-2 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-400">
                      🔒 Locked
                    </div>
                  )}
                  <div className={`text-lg font-bold mb-1 ${isUnlocked ? 'text-white' : 'text-gray-600'}`}>{def.name}</div>
                  <div className="text-xs text-gray-400 space-y-1">
                    <div>Cost: ${def.cost}M</div>
                    <div>Power: {def.powerOutputMw} MW</div>
                    <div>Latency: {def.latencyMs}ms</div>
                    <div>Build: {def.buildTimeDays} days</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Unit Details */}
        <div className="mb-6 p-4 bg-gray-800/50 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-3">Unit Specifications</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Power Output:</span>
              <span className="text-accent-green font-semibold ml-2">{unitDef.powerOutputMw} MW</span>
            </div>
            <div>
              <span className="text-gray-400">Latency:</span>
              <span className="text-accent-blue font-semibold ml-2">{unitDef.latencyMs} ms</span>
            </div>
            <div>
              <span className="text-gray-400">Lifetime:</span>
              <span className="text-white font-semibold ml-2">{unitDef.lifetimeYears} years</span>
            </div>
            <div className="col-span-2 text-xs text-gray-400 pt-2 border-t border-gray-700">
              Each LEO pod represents ~50 satellites and about{" "}
              <span className="text-accent-green font-semibold">
                {(unitDef.powerOutputMw * 1000).toFixed(0)} kW
              </span>{" "}
              of orbital compute capacity.
            </div>
          </div>
        </div>

        {/* Quantity Slider */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-300 mb-3">
            Quantity: {quantity}
          </label>
          <input
            type="range"
            min="1"
            max="30"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent-blue"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>1</span>
            <span>30</span>
          </div>
        </div>


        {/* Queue Status */}
        {queueFullError && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-sm text-red-300">
            <div className="font-semibold mb-1">Queue Full</div>
            <div className="text-xs">
              Deployment queue is at capacity ({engine.maxQueue} pods). Increase manufacturing or launch capacity, or wait for current deployments to complete.
            </div>
          </div>
        )}
        
        {!canAddToQueue && !queueFullError && (
          <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-500/50 rounded-lg text-sm text-yellow-300">
            <div className="text-xs">
              Queue: {queuedUnits.length} / {engine.maxQueue} (near capacity)
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <button
            onClick={handleDeploy}
            disabled={!canAddToQueue}
            className={`flex-1 px-4 sm:px-6 py-3 rounded-lg font-semibold transition-all text-sm sm:text-base ${
              canAddToQueue
                ? "bg-accent-blue hover:bg-accent-blue/80 text-dark-bg hover:scale-105"
                : "bg-gray-700 text-gray-400 cursor-not-allowed"
            }`}
          >
            Add {quantity} {quantity === 1 ? 'Unit' : 'Units'} to Queue
          </button>
          <button
            onClick={onClose}
            className="px-4 sm:px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-all text-sm sm:text-base"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

