"use client";

import { useSimpleModeStore } from "../../store/simpleModeStore";
import { formatDecimal } from "../../lib/utils/formatNumber";

/**
 * V1 Deployment Surface - Simplified
 * Shows: Pod Progression, Launch Stress
 * Now reads from Simple Mode scenario metrics
 */
export default function V1DeploymentSurface() {
  const { podsDeployed, metrics } = useSimpleModeStore();

  if (!metrics) return null;

  const podsPerYear = podsDeployed;
  const launchesPerYear = metrics.launchesRequiredPerYear;
  const launchesCapacityPerYear = metrics.launchCapacityPerYear;
  const backlogFactor = metrics.launchStress;

  return (
    <div className="fixed inset-0 pointer-events-none">
      {/* Pod Progression and Launch Stress cards removed */}
    </div>
  );
}

