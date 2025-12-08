"use client";

import { useEffect, useRef, useState } from "react";
import { useOrbitSimStore } from "../../store/orbitSimStore";
import type { StageId } from "../../lib/orbitSim/orbitSimState";
import FactoryStrip from "./FactoryStrip";
import StageDetailsPanel from "./StageDetailsPanel";
import OrbitScoreCard from "./OrbitScoreCard";
import MissionCard from "./MissionCard";
import CompactMetricsCard from "./CompactMetricsCard";
// import OpexGraph from "./OpexGraph"; // Removed per user request
import OnboardingTooltip from "./OnboardingTooltip";
import SharePanel from "./SharePanel";

/**
 * OrbitSimRoot - Top-level container with globe background and floating UI
 */
export default function OrbitSimRoot() {
  const { tick, state } = useOrbitSimStore();
  const [selectedStage, setSelectedStage] = useState<StageId | null>(null);
  const [showShare, setShowShare] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(Date.now());
  const prevMissionCompletedRef = useRef(false);

  // Expose state to SandboxGlobe for launch animations
  useEffect(() => {
    (window as any).__orbitSimState = state;
    return () => {
      delete (window as any).__orbitSimState;
    };
  }, [state]);

  // Run simulation loop
  useEffect(() => {
    const animate = () => {
      const now = Date.now();
      const dtSeconds = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      // Tick simulation (cap dt to prevent large jumps)
      tick(Math.min(dtSeconds, 0.1));

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [tick]);

  // Show share panel when mission completes
  useEffect(() => {
    if (state.currentMission.completed && !prevMissionCompletedRef.current) {
      setShowShare(true);
    }
    prevMissionCompletedRef.current = state.currentMission.completed;
  }, [state.currentMission.completed]);

  return (
    <>
      {/* Globe is background - handled by SandboxGlobe component */}
      
      {/* CSS Grid Layout */}
      <div className="fixed inset-0 z-30 grid grid-cols-2 grid-rows-3 gap-4 p-4 pt-16 pointer-events-none">
        {/* Mission header bar - spans full width */}
        <div className="col-span-2 pointer-events-auto" id="mission-bar">
          <MissionCard />
        </div>

        {/* Factory pipeline - left */}
        <div className="pointer-events-auto" id="factory-pipeline">
          <FactoryStrip onStageClick={setSelectedStage} />
        </div>

        {/* OPEX comparison removed per user request */}

        {/* Key Metrics grid - spans full width */}
        <div className="col-span-2 pointer-events-auto" id="metrics-grid">
          <div className="flex gap-4">
            <div className="flex-1">
              <CompactMetricsCard />
            </div>
            <div className="flex-1">
              <OrbitScoreCard />
            </div>
          </div>
        </div>
      </div>

      {/* Stage Details Drawer */}
      {selectedStage && (
        <StageDetailsPanel
          stageId={selectedStage}
          onClose={() => setSelectedStage(null)}
        />
      )}

      {/* Share Panel */}
      {showShare && (
        <SharePanel onClose={() => setShowShare(false)} />
      )}

      {/* Onboarding */}
      <OnboardingTooltip />
    </>
  );
}

