"use client";

import { useEffect, useState, useRef } from "react";
import { useSandboxStore } from "../../store/sandboxStore";
import { getMachineUtilization } from "../../lib/sim/engine";
import type { SimState, ResourceId, MachineId } from "../../lib/sim/model";
import { FACTORY_NODES, FACTORY_EDGES, getResourceColor, type FactoryNodeId } from "../../lib/factory/factoryLayout";
import { formatSigFigs, formatDecimal } from "../../lib/utils/formatNumber";

interface LaunchEvent {
  id: number;
  createdAt: number;
}

/**
 * Get machine utilization from sim state
 */
function getMachineUtilizationFromSim(id: MachineId, sim: SimState): number {
  const machine = sim.machines[id];
  if (!machine) return 0;
  return getMachineUtilization(machine, sim.resources);
}

/**
 * Get resource buffer from sim state
 */
function getResourceBufferFromSim(id: ResourceId, sim: SimState): number {
  return sim.resources[id]?.buffer ?? 0;
}

/**
 * Get resource throughput (max of production and consumption)
 */
function getResourceThroughput(id: ResourceId, sim: SimState): number {
  const resource = sim.resources[id];
  if (!resource) return 0;
  return Math.max(resource.prodPerMin, resource.consPerMin);
}

/**
 * FactoryView - Top-down schematic view of the factory
 */
export default function FactoryView() {
  const { simState } = useSandboxStore();
  const [launchEvents, setLaunchEvents] = useState<LaunchEvent[]>([]);
  const lastLaunchCountRef = useRef(0);

  if (!simState) {
    return (
      <div className="fixed bottom-0 left-0 right-0 h-[260px] bg-gray-900/95 border-t border-gray-700 z-30 flex items-center justify-center">
        <div className="text-xs text-gray-500">Loading factory state...</div>
      </div>
    );
  }

  // Detect new launches
  useEffect(() => {
    const currentLaunchCount = Math.floor(simState.resources.launches?.buffer ?? 0);
    if (currentLaunchCount > lastLaunchCountRef.current && lastLaunchCountRef.current > 0) {
      // New launch detected
      setLaunchEvents(prev => [...prev, {
        id: Date.now(),
        createdAt: Date.now(),
      }]);
    }
    lastLaunchCountRef.current = currentLaunchCount;
  }, [simState.resources.launches?.buffer]);

  // Remove completed launch events
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setLaunchEvents(prev => prev.filter(event => {
        const elapsed = (now - event.createdAt) / 1000;
        return elapsed < 3; // 3 second animation
      }));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const viewBoxWidth = 1000;
  const viewBoxHeight = 260;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-[260px] bg-gray-900/95 border-t border-gray-700 z-30 overflow-hidden">
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        className="w-full h-full"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
        }}
      >
        {/* Edges (belts) - render first so nodes appear on top */}
        {FACTORY_EDGES.map(edge => {
          const fromNode = FACTORY_NODES.find(n => n.id === edge.from);
          const toNode = FACTORY_NODES.find(n => n.id === edge.to);
          if (!fromNode || !toNode) return null;

          const fromX = fromNode.x * viewBoxWidth + (fromNode.width * viewBoxWidth) / 2;
          const fromY = fromNode.y * viewBoxHeight + (fromNode.height * viewBoxHeight) / 2;
          const toX = toNode.x * viewBoxWidth + (toNode.width * viewBoxWidth) / 2;
          const toY = toNode.y * viewBoxHeight + (toNode.height * viewBoxHeight) / 2;

          const throughput = getResourceThroughput(edge.resource, simState);
          const speed = Math.min(1, throughput / 100); // Normalize to 0-1
          const opacity = throughput > 0 ? 0.6 + (speed * 0.4) : 0.2;
          const color = getResourceColor(edge.resource);

          // Calculate path length for animation
          const pathLength = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
          const dashLength = 8;
          const gapLength = 12;
          const animationDuration = Math.max(0.5, 2 / (speed + 0.1)); // Faster when throughput is higher

          return (
            <g key={edge.id}>
              {/* Base path */}
              <line
                x1={fromX}
                y1={fromY}
                x2={toX}
                y2={toY}
                stroke={color}
                strokeWidth="3"
                opacity={opacity * 0.3}
              />
              {/* Animated flow */}
              {throughput > 0 && (
                <line
                  x1={fromX}
                  y1={fromY}
                  x2={toX}
                  y2={toY}
                  stroke={color}
                  strokeWidth="4"
                  opacity={opacity}
                  strokeDasharray={`${dashLength} ${gapLength}`}
                  strokeDashoffset={0}
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from={0}
                    to={dashLength + gapLength}
                    dur={`${animationDuration}s`}
                    repeatCount="indefinite"
                  />
                </line>
              )}
            </g>
          );
        })}

        {/* Nodes (buildings) */}
        {FACTORY_NODES.map(node => {
          const x = node.x * viewBoxWidth;
          const y = node.y * viewBoxHeight;
          const width = node.width * viewBoxWidth;
          const height = node.height * viewBoxHeight;

          let utilization = 0;
          let outputRate = 0;
          let bufferLevel = 0;
          let bufferCapacity = 100;

          if (node.type === 'machine') {
            const machineId = node.id as MachineId;
            utilization = getMachineUtilizationFromSim(machineId, simState);
            const machine = simState.machines[machineId];
            if (machine) {
              const speedMultiplier = 1 + (machine.upgrades.speedLevel * 0.2);
              outputRate = machine.baseOutputPerLine * speedMultiplier * machine.lines;
            }
          } else if (node.type === 'storage') {
            // Map storage nodes to resources
            const resourceMap: Record<string, ResourceId> = {
              'methaneTank': 'methane',
              'loxTank': 'lox',
              'fuelTank': 'fuel',
            };
            const resourceId = resourceMap[node.id];
            if (resourceId) {
              bufferLevel = getResourceBufferFromSim(resourceId, simState);
              bufferCapacity = 1000; // Nominal capacity
            }
          }

          const utilizationPercent = utilization * 100;
          const isActive = utilizationPercent > 30;
          const isBottlenecked = utilizationPercent > 80;

          // Color based on utilization
          let borderColor = '#4b5563'; // gray-600
          if (isBottlenecked) {
            borderColor = '#ef4444'; // red
          } else if (utilizationPercent > 70) {
            borderColor = '#f97316'; // orange
          } else if (isActive) {
            borderColor = '#3b82f6'; // blue
          }

          return (
            <g key={node.id}>
              {/* Building background */}
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                rx={4}
                fill={node.type === 'source' ? '#1e293b' : '#0f172a'}
                stroke={borderColor}
                strokeWidth={isBottlenecked ? 3 : 2}
                opacity={isActive ? 1 : 0.5}
                style={{
                  filter: isBottlenecked ? 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.5))' : 'none',
                }}
              />

              {/* Storage fill bar */}
              {node.type === 'storage' && (
                <rect
                  x={x + 2}
                  y={y + height - 2 - ((bufferLevel / bufferCapacity) * (height - 4))}
                  width={width - 4}
                  height={(bufferLevel / bufferCapacity) * (height - 4)}
                  rx={2}
                  fill={getResourceColor(node.id === 'methaneTank' ? 'methane' : node.id === 'loxTank' ? 'lox' : 'fuel')}
                  opacity={0.6}
                />
              )}

              {/* Label */}
              <text
                x={x + width / 2}
                y={y + height / 2 - 4}
                textAnchor="middle"
                className="text-[10px] fill-gray-300 font-semibold"
              >
                {node.label}
              </text>

              {/* Machine stats */}
              {node.type === 'machine' && (
                <>
                  <text
                    x={x + width / 2}
                    y={y + height / 2 + 8}
                    textAnchor="middle"
                    className="text-[8px] fill-gray-400"
                  >
                    {formatDecimal(utilizationPercent, 0)}%
                  </text>
                  <text
                    x={x + width / 2}
                    y={y + height / 2 + 16}
                    textAnchor="middle"
                    className="text-[8px] fill-gray-500"
                  >
                    {formatSigFigs(outputRate, 1)}/min
                  </text>
                </>
              )}

              {/* Storage buffer */}
              {node.type === 'storage' && (
                <text
                  x={x + width / 2}
                  y={y + height / 2 + 8}
                  textAnchor="middle"
                  className="text-[8px] fill-gray-400"
                >
                  {formatSigFigs(bufferLevel, 0)}
                </text>
              )}

              {/* Launch pad rocket icon */}
              {node.type === 'launch' && (
                <text
                  x={x + width / 2}
                  y={y + height / 2 + 8}
                  textAnchor="middle"
                  className="text-lg"
                >
                  🚀
                </text>
              )}
            </g>
          );
        })}

        {/* Launch animations - rockets moving from launch complex to orbit */}
        {launchEvents.map(event => {
          const launchNode = FACTORY_NODES.find(n => n.id === 'launchComplex');
          if (!launchNode) return null;

          const startX = launchNode.x * viewBoxWidth + (launchNode.width * viewBoxWidth) / 2;
          const startY = launchNode.y * viewBoxHeight;
          const endX = viewBoxWidth - 20; // Right edge
          const endY = 20; // Top corner (orbit)

          const elapsed = (Date.now() - event.createdAt) / 1000;
          const progress = Math.min(1, elapsed / 3); // 3 second animation
          const currentX = startX + (endX - startX) * progress;
          const currentY = startY + (endY - startY) * progress;

          if (progress >= 1) return null;

          return (
            <g key={event.id}>
              <circle
                cx={currentX}
                cy={currentY}
                r="6"
                fill="#ef4444"
                opacity={1 - progress}
              >
                <animate
                  attributeName="r"
                  from="4"
                  to="8"
                  dur="0.5s"
                  repeatCount="indefinite"
                />
              </circle>
              <text
                x={currentX}
                y={currentY - 10}
                textAnchor="middle"
                className="text-xs"
                opacity={1 - progress}
              >
                🚀
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

