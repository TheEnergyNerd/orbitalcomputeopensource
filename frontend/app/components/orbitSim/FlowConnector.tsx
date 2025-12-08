"use client";

import React from "react";

// Simple cn utility for className merging
function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

type FlowConnectorProps = {
  throughput: number;          // effectiveThroughputPerDeploy for upstream stage
  isBeforeBottleneck: boolean; // true if the next stage is the bottleneck
};

export function FlowConnector({ throughput, isBeforeBottleneck }: FlowConnectorProps) {
  const intensity = Math.min(throughput / 12, 1); // normalize vs typical max
  const baseClass = isBeforeBottleneck ? "bg-red-400" : "bg-cyan-400";
  const trackClass = isBeforeBottleneck ? "bg-red-900/70" : "bg-slate-800/80";
  const glowClass = isBeforeBottleneck ? "shadow-red-400/50" : "shadow-cyan-400/50";

  // Use fewer dots but spread them out more
  const dotCount = 4;
  const animationDuration = 3.0 - intensity * 1.2; // Slower = more visible
  const spacingDelay = 0.5; // More delay between dots = more spread out

  return (
    <div className="relative mx-4 flex h-4 flex-1 items-center min-w-[120px]">
      {/* Track background */}
      <div className={cn("h-2 w-full rounded-full", trackClass)} />
      
      {/* Animated dots flowing left to right */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: dotCount }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "absolute top-1/2 h-3 w-3 rounded-full -translate-y-1/2",
              baseClass,
              "shadow-lg",
              glowClass
            )}
            style={{
              animation: `flow-dot ${animationDuration}s linear infinite`,
              animationDelay: `${i * spacingDelay}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

