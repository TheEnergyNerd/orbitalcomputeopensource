"use client";

import React from "react";
import type { StageId } from "../../lib/orbitSim/factoryTypes";
import { getStageDef } from "../../lib/orbitSim/factoryModel";
import { FactoryStageCard } from "./FactoryStageCard";
import { ConveyorLane } from "./ConveyorLane";

interface FactoryPipelineProps {
  stages: Array<{ stageId: StageId; maxThroughputPerDeploy: number; effectiveThroughputPerDeploy: number }>;
  bottleneckStage: StageId;
  timeline?: Array<{ stageThroughputs: Array<{ stageId: StageId; effectiveThroughputPerDeploy: number }> }>;
  onStageClick?: (stageId: StageId) => void;
  selectedStage?: StageId;
  globalThroughput?: number;
  maxThroughput?: number;
  deployPulse?: number | null;
}


/**
 * FactoryPipeline - Conveyor chain visualization with animations
 * Shows: Silicon → Chips → Racks → Pods → Launch → Orbit
 */
export default function FactoryPipeline({ 
  stages, 
  bottleneckStage, 
  timeline, 
  onStageClick,
  selectedStage,
  globalThroughput = 1,
  maxThroughput = 10,
  deployPulse,
}: FactoryPipelineProps) {
  const stageIds: StageId[] = ["silicon", "chips", "racks", "pods", "launch"];
  
  // Calculate normalized speed for conveyor lanes
  const normalizedSpeed = maxThroughput > 0 
    ? Math.min(1.5, Math.max(0.1, globalThroughput / maxThroughput))
    : 0.5;

  return (
    <div className="flex items-center">
      <div className="mr-6 text-[11px] text-slate-400 leading-tight flex-shrink-0">
        THROUGHPUT<br/>PER<br/>DEPLOYMENT<br/>
        <span className="text-[10px] text-slate-500">
          (Silicon → Chips → Racks → Pods → Launches)
        </span>
      </div>

      <div className="flex items-center gap-6 overflow-x-auto overflow-y-visible flex-1 min-w-0" style={{ scrollbarWidth: 'thin' }}>
        {stageIds.map((id, idx) => {
          const stage = stages.find(s => s.stageId === id);
          if (!stage) return null;
          
          const stageDef = getStageDef(id);
          if (!stageDef) return null;
          
          const nextId = stageIds[idx + 1];
          const isBottleneck = id === bottleneckStage;
          const isNextBottleneck = nextId === bottleneckStage;

          return (
            <React.Fragment key={id}>
              <FactoryStageCard
                stage={stageDef}
                throughput={stage.maxThroughputPerDeploy}
                isSelected={selectedStage === id}
                isBottleneck={isBottleneck}
                onClick={() => onStageClick?.(id)}
              />
              {idx < stageIds.length - 1 && (
                <div className="flex-shrink-0" style={{ minWidth: '120px', overflow: 'visible' }}>
                  <ConveyorLane
                    spriteKind={stageDef.itemSprite}
                    color={stageDef.color}
                    speed={normalizedSpeed}
                    jammed={isNextBottleneck}
                    deployPulseKey={deployPulse ?? null}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
