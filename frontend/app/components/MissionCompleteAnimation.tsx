"use client";

import { useEffect, useState } from "react";

interface MissionCompleteAnimationProps {
  isVisible: boolean;
  missionTitle?: string;
  onComplete: () => void;
}

export default function MissionCompleteAnimation({ isVisible, missionTitle, onComplete }: MissionCompleteAnimationProps) {
  const [phase, setPhase] = useState<"pulse" | "metrics" | "message" | "badge" | "done">("pulse");
  const [globeScale, setGlobeScale] = useState(1);

  useEffect(() => {
    if (!isVisible) {
      setPhase("pulse");
      setGlobeScale(1);
      return;
    }

    // Globe pulse animation
    const pulseInterval = setInterval(() => {
      setGlobeScale((prev) => prev === 1 ? 1.1 : 1);
    }, 500);

    const timers = [
      setTimeout(() => setPhase("metrics"), 1500),
      setTimeout(() => setPhase("message"), 3000),
      setTimeout(() => setPhase("badge"), 4500),
      setTimeout(() => {
        setPhase("done");
        clearInterval(pulseInterval);
        setTimeout(onComplete, 1500);
      }, 6000),
    ];

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(pulseInterval);
    };
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none">
      {/* Animated background glow */}
      <div className="absolute inset-0 bg-accent-blue/20 animate-pulse" />
      
      <div className="relative panel-glass rounded-2xl p-12 max-w-3xl text-center border-4 border-accent-blue shadow-2xl backdrop-blur-xl">
        {phase === "pulse" && (
          <div className="space-y-6">
            <div 
              className="text-8xl mx-auto transition-transform duration-500"
              style={{ transform: `scale(${globeScale})` }}
            >
              🌍
            </div>
            <div className="text-5xl font-bold text-accent-blue animate-pulse">Mission Complete!</div>
          </div>
        )}
        {phase === "metrics" && (
          <div className="space-y-6">
            <div className="text-5xl font-bold text-accent-blue mb-6">{missionTitle || "Mission Complete!"}</div>
            <div className="grid grid-cols-3 gap-6 text-lg">
              <div className="space-y-2">
                <div className="text-3xl text-accent-green animate-bounce">↓</div>
                <div className="text-accent-green font-semibold">Latency</div>
                <div className="text-white text-sm">Improved</div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl text-accent-green animate-bounce">↓</div>
                <div className="text-accent-green font-semibold">Cooling</div>
                <div className="text-white text-sm">Reduced</div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl text-accent-green animate-bounce">↓</div>
                <div className="text-accent-green font-semibold">Carbon</div>
                <div className="text-white text-sm">Eliminated</div>
              </div>
            </div>
          </div>
        )}
        {phase === "message" && (
          <div className="space-y-6">
            <div className="text-4xl font-bold text-white mb-4">Orbit has stabilized global compute…</div>
            <div className="text-2xl text-gray-300">for now.</div>
          </div>
        )}
        {phase === "badge" && (
          <div className="space-y-6">
            <div className="text-8xl animate-bounce">🏆</div>
            <div className="text-3xl font-bold text-yellow-400">Achievement Unlocked!</div>
            <div className="text-xl text-gray-300">New missions and capabilities are now available.</div>
          </div>
        )}
      </div>
    </div>
  );
}

