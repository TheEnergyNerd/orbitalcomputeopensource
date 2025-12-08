"use client";

import { motion } from 'framer-motion';
import { StageDef } from '../../lib/orbitSim/factoryModel';
import { PipelineIconPaths } from './PipelineIcons';

export function FactoryStageCard({
  stage,
  throughput,
  isSelected,
  isBottleneck,
  children,
  onClick,
}: {
  stage: StageDef;
  throughput: number;
  isSelected: boolean;
  isBottleneck: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <motion.div
      layout
      className="relative flex h-40 w-52 items-center justify-center cursor-pointer flex-shrink-0"
      animate={isSelected ? { scale: 1.04 } : { scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      onClick={onClick}
    >
      {/* "3D" building base */}
      <svg viewBox="0 0 120 90" className="absolute inset-0">
        <defs>
          <linearGradient id={`roof-${stage.id}`} x1="0" x2="1">
            <stop offset="0%" stopColor="#020617" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id={`wall-${stage.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stage.color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={stage.color} stopOpacity="0.7" />
          </linearGradient>
        </defs>
        <polygon points="20,40 60,20 100,40 60,60" fill={`url(#roof-${stage.id})`} />
        <rect x="25" y="40" width="70" height="35" fill={`url(#wall-${stage.id})`} rx="6" />
      </svg>

      {/* Stage icon SVG on the building */}
      <div className="absolute inset-0 flex items-center justify-center z-5">
        <svg className="h-16 w-16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.6 }}>
          <PipelineIconPaths stageId={stage.id} color={stage.color} />
        </svg>
      </div>

      {/* glow + label */}
      <div className="relative z-10 flex flex-col items-center gap-1 text-slate-100">
        <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
          {stage.label}
        </div>
        <motion.div
          key={throughput}
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="font-mono text-2xl"
        >
          {throughput.toFixed(1)}
          <span className="ml-1 text-xs">/ deploy</span>
        </motion.div>
        {children}
      </div>

      {isBottleneck && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-2xl border border-amber-400/70"
          animate={{ opacity: [0.2, 0.6, 0.2] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </motion.div>
  );
}
