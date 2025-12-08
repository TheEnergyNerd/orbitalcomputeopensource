"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface ConveyorConnectorProps {
  throughput: number;
  maxThroughput: number;
  isBeforeBottleneck: boolean;
  deployPulse?: number | null;
}

/**
 * ConveyorConnector - Animated dots streaming between pipeline stages
 */
export default function ConveyorConnector({
  throughput,
  maxThroughput,
  isBeforeBottleneck,
  deployPulse,
}: ConveyorConnectorProps) {
  const baseDuration = 3.0; // Base animation duration in seconds
  const speedFactor = Math.max(0.5, Math.min(2.0, 0.5 + throughput / maxThroughput));
  const animationDuration = baseDuration / speedFactor;

  const dotCount = isBeforeBottleneck ? 12 : 6; // More dots when backed up

  return (
    <div className="relative mx-4 flex h-4 flex-1 items-center min-w-[120px]">
      {/* Track background */}
      <div
        className={cn(
          "h-2 w-full rounded-full",
          isBeforeBottleneck ? "bg-red-900/70" : "bg-slate-800/80"
        )}
      />

      {/* Animated dots */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: dotCount }).map((_, i) => {
          const delay = -i * (animationDuration / dotCount);
          const yOffset = isBeforeBottleneck
            ? (Math.random() - 0.5) * 4 // Jitter when backed up
            : 0;

          return (
            <div
              key={i}
              className={cn(
                "absolute top-1/2 h-3 w-3 rounded-full -translate-y-1/2",
                isBeforeBottleneck ? "bg-red-400" : "bg-cyan-400",
                isBeforeBottleneck && "shadow-red-400/50" || "shadow-cyan-400/50",
                "shadow-lg"
              )}
              style={{
                left: `${(i * 100) / dotCount}%`,
                transform: `translateY(${yOffset}px)`,
                animation: `conveyor ${animationDuration}s linear infinite`,
                animationDelay: `${delay}s`,
              }}
            />
          );
        })}
      </div>

      {/* Deploy pulse overlay */}
      {deployPulse && (
        <motion.div
          className="absolute inset-y-0 w-1/4 bg-cyan-400/40 blur-sm"
          initial={{ x: "-20%" }}
          animate={{ x: "120%" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          onAnimationComplete={() => {
            // Pulse complete
          }}
        />
      )}
    </div>
  );
}

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}




