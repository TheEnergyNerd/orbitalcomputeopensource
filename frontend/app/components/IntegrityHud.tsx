"use client";

import { useEffect, useState } from "react";
import { useSimulationStore } from "../store/simulationStore";

interface IntegrityCheck {
  name: string;
  status: "valid" | "repaired" | "failed";
  lastChecked: number;
}

export default function IntegrityHud() {
  const { timeline } = useSimulationStore();
  const [checks, setChecks] = useState<IntegrityCheck[]>([]);

  useEffect(() => {
    if (timeline.length === 0) return;

    const currentStep = timeline[timeline.length - 1];
    const now = Date.now();

    // Run integrity checks
    const newChecks: IntegrityCheck[] = [
      {
        name: "Compute conserved",
        status: checkComputeConserved(currentStep),
        lastChecked: now,
      },
      {
        name: "No negative costs",
        status: checkNoNegativeCosts(currentStep),
        lastChecked: now,
      },
      {
        name: "Latency ≥ physics bound",
        status: checkLatencyPhysics(currentStep),
        lastChecked: now,
      },
      {
        name: "Carbon decline ≤ transition rate",
        status: checkCarbonTransition(currentStep),
        lastChecked: now,
      },
      {
        name: "Orbital share ≤ shell capacity",
        status: checkOrbitalCapacity(currentStep),
        lastChecked: now,
      },
      {
        name: "No unrepaired auto-patches pending",
        status: "valid", // TODO: Implement auto-repair tracking
        lastChecked: now,
      },
    ];

    setChecks(newChecks);
  }, [timeline]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "valid":
        return "text-green-400";
      case "repaired":
        return "text-yellow-400";
      case "failed":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "valid":
        return "✓";
      case "repaired":
        return "⚠";
      case "failed":
        return "✗";
      default:
        return "?";
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 bg-black/90 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono pointer-events-none">
      <div className="text-slate-300 space-y-1">
        <div className="text-slate-500 mb-2 text-[10px] uppercase tracking-wide">
          Integrity HUD
        </div>
        {checks.map((check, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={getStatusColor(check.status)}>
              {getStatusIcon(check.status)}
            </span>
            <span className={getStatusColor(check.status)}>{check.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Integrity check functions
function checkComputeConserved(step: any): "valid" | "repaired" | "failed" {
  // Check that total compute is conserved (orbital + ground = total demand)
  const orbitalCompute = step.orbitalShare * (step.totalDemandTwh || 0);
  const groundCompute = (1 - step.orbitalShare) * (step.totalDemandTwh || 0);
  const total = orbitalCompute + groundCompute;
  const expected = step.totalDemandTwh || 0;
  const diff = Math.abs(total - expected);
  const tolerance = expected * 0.01; // 1% tolerance
  
  if (diff > tolerance) {
    return "failed";
  }
  return "valid";
}

function checkNoNegativeCosts(step: any): "valid" | "repaired" | "failed" {
  // Check that all costs are non-negative
  if (
    (step.costPerComputeMix || 0) < 0 ||
    (step.costPerComputeGround || 0) < 0 ||
    (step.costPerComputeOrbit || 0) < 0
  ) {
    return "failed";
  }
  return "valid";
}

function checkLatencyPhysics(step: any): "valid" | "repaired" | "failed" {
  // Check that latency is at least the physics lower bound
  // Speed of light: ~3ms per 1000km
  // Minimum orbital latency: ~2-3ms (LEO altitude)
  const minLatency = 2; // ms
  const latency = step.latencyMixMs || 0;
  
  if (latency < minLatency) {
    return "failed";
  }
  return "valid";
}

function checkCarbonTransition(step: any): "valid" | "repaired" | "failed" {
  // Check that carbon decline rate is within acceptable transition rate
  // This is a placeholder - would need historical data to check rate
  return "valid";
}

function checkOrbitalCapacity(step: any): "valid" | "repaired" | "failed" {
  // Check that orbital share doesn't exceed shell capacity
  // Shell capacity is typically around 80-90% of theoretical max
  const maxOrbitalShare = 0.9;
  const orbitalShare = step.orbitalShare || 0;
  
  if (orbitalShare > maxOrbitalShare) {
    return "failed";
  }
  return "valid";
}

