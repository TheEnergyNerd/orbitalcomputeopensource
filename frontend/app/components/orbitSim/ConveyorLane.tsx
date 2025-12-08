"use client";

import { ItemSprite } from './ItemSprite';
import { motion } from 'framer-motion';

export function ConveyorLane({
  spriteKind,
  color,
  speed,          // 0–1 normalized throughput
  jammed,         // true if downstream is bottleneck
  deployPulseKey, // change when user hits "Deploy year"
}: {
  spriteKind: 'ingot' | 'die' | 'rack' | 'pod' | 'rocket';
  color: string;
  speed: number;
  jammed: boolean;
  deployPulseKey: number | null;
}) {
  const clampedSpeed = Math.max(0.2, Math.min(speed, 1.5));
  const duration = 6 / clampedSpeed; // seconds to traverse lane

  const itemCount = jammed ? 14 : 8;

  return (
    <div className="relative h-8 w-full" style={{ overflow: 'visible', minWidth: '120px' }}>
      {/* track - visible across full width */}
      <div className="absolute inset-y-[45%] left-0 right-0 h-[2px] bg-slate-700/60" />

      {/* items - animate from left edge to right edge */}
      {Array.from({ length: itemCount }).map((_, i) => {
        const delay = (-duration / itemCount) * i;
        const jitterY = jammed ? (i % 2 === 0 ? -4 : 2) : 0;
        const jitterScale = jammed ? 1.05 : 1;

        return (
          <motion.div
            key={i}
            className="absolute top-1/2 -translate-y-1/2"
            style={{
              willChange: 'transform',
            }}
            initial={{ left: '-3%' }}
            animate={{ left: '103%' }}
            transition={{
              duration,
              ease: 'linear',
              repeat: Infinity,
              delay,
            }}
          >
            <motion.div
              animate={jammed ? { y: jitterY, scale: jitterScale } : {}}
              transition={{ duration: 0.4, repeat: Infinity, repeatType: 'reverse' }}
            >
              <ItemSprite kind={spriteKind} color={color} />
            </motion.div>
          </motion.div>
        );
      })}

      {/* Deploy pulse overlay */}
      {deployPulseKey !== null && (
        <motion.div
          key={deployPulseKey}
          className="pointer-events-none absolute inset-y-[30%] w-1/3 rounded-full bg-cyan-400/20 blur-md"
          initial={{ x: '-20%' }}
          animate={{ x: '120%' }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      )}
    </div>
  );
}

