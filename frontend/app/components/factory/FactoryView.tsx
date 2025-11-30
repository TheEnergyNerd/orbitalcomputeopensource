"use client";

import { useEffect, useState, useRef } from "react";
import { useSandboxStore } from "../../store/sandboxStore";
import { getMachineUtilization } from "../../lib/sim/engine";
import type { SimState, ResourceId, MachineId } from "../../lib/sim/model";
import { FACTORY_NODES, FACTORY_EDGES, getResourceColor, type FactoryNodeId } from "../../lib/factory/factoryLayout";
import { formatSigFigs, formatDecimal } from "../../lib/utils/formatNumber";
import { classifyNode, getNodeBorderColor, getNetRateColor, type NodeStatus } from "../../lib/ui/semantics";

interface LaunchEvent {
  id: number;
  createdAt: number;
}

interface FactoryViewProps {
  selectedNodeId?: FactoryNodeId | null;
  onSelectNode?: (nodeId: FactoryNodeId | null) => void;
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

import { getResourceThroughput as getResourceThroughputEngine } from "../../lib/sim/engine";

/**
 * FactoryView - Top-down schematic view of the factory (PRIMARY VIEW)
 */
export default function FactoryView({ selectedNodeId = null, onSelectNode }: FactoryViewProps = {}) {
  const { simState } = useSandboxStore();
  const [launchEvents, setLaunchEvents] = useState<LaunchEvent[]>([]);
  const lastLaunchCountRef = useRef(0);
  const [internalSelectedNode, setInternalSelectedNode] = useState<FactoryNodeId | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  
  // Use prop if provided, otherwise use internal state
  const currentSelectedNode = selectedNodeId !== undefined ? selectedNodeId : internalSelectedNode;
  const handleSelectNode = onSelectNode || setInternalSelectedNode;

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
        return elapsed < 3;
      }));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const viewBoxWidth = 1000;
  const viewBoxHeight = 260;

  // Calculate bottlenecks and overproduced resources for summary
  const bottlenecks: Array<{ id: ResourceId; name: string; severity: number }> = [];
  const overproduced: Array<{ id: ResourceId; name: string; netRate: number }> = [];
  
  for (const [resourceId, resource] of Object.entries(simState.resources)) {
    const netRate = resource.prodPerMin - resource.consPerMin;
    const status: NodeStatus = {
      state: 'healthy',
      utilization: resource.consPerMin > 0 ? resource.prodPerMin / resource.consPerMin : 0,
      buffer: resource.buffer,
    };
    const classified = classifyNode(status);
    
    if (classified === 'starved' && resource.buffer <= 0.01) {
      bottlenecks.push({
        id: resourceId as ResourceId,
        name: resource.name,
        severity: Math.abs(netRate),
      });
    }
    if (netRate > 10 && resource.buffer > 100) {
      overproduced.push({
        id: resourceId as ResourceId,
        name: resource.name,
        netRate,
      });
    }
  }

  // Get total launches per month
  const launchesPerMonth = (simState.resources.launches?.prodPerMin ?? 0) * 60 * 24 * 30;

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
        onClick={(e) => {
          // Clicking on background deselects
          if (e.target === e.currentTarget) {
            handleSelectNode(null);
          }
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

          const throughput = getResourceThroughputEngine(edge.resource, simState);
          const speed = Math.min(1, throughput / 100);
          const opacity = throughput > 0 ? 0.6 + (speed * 0.4) : 0.2;
          const color = getResourceColor(edge.resource);
          const isSelected = currentSelectedNode === edge.from || currentSelectedNode === edge.to;

          const dashLength = 8;
          const gapLength = 12;
          const animationDuration = Math.max(0.5, 2 / (speed + 0.1));

          return (
            <g key={edge.id}>
              {/* Base path */}
              <line
                x1={fromX}
                y1={fromY}
                x2={toX}
                y2={toY}
                stroke={color}
                strokeWidth={isSelected ? "4" : "3"}
                opacity={isSelected ? opacity * 0.8 : opacity * 0.3}
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
                  onMouseEnter={() => setHoveredEdge(edge.id)}
                  onMouseLeave={() => setHoveredEdge(null)}
                  style={{ cursor: 'pointer' }}
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
              {/* Hover tooltip */}
              {hoveredEdge === edge.id && (
                <g>
                  <rect
                    x={(fromX + toX) / 2 - 60}
                    y={(fromY + toY) / 2 - 20}
                    width="120"
                    height="30"
                    fill="rgba(0, 0, 0, 0.8)"
                    rx="4"
                  />
                  <text
                    x={(fromX + toX) / 2}
                    y={(fromY + toY) / 2 - 5}
                    textAnchor="middle"
                    className="text-[10px] fill-white"
                  >
                    Flow: {formatSigFigs(throughput, 2)} {edge.resource}/min
                  </text>
                  <text
                    x={(fromX + toX) / 2}
                    y={(fromY + toY) / 2 + 8}
                    textAnchor="middle"
                    className="text-[8px] fill-gray-400"
                  >
                    {fromNode.label} → {toNode.label}
                  </text>
                </g>
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
          let netRate = 0;

          if (node.type === 'machine') {
            const machineId = node.id as MachineId;
            utilization = getMachineUtilizationFromSim(machineId, simState);
            const machine = simState.machines[machineId];
            if (machine) {
              const speedMultiplier = 1 + (machine.upgrades.speedLevel * 0.2);
              outputRate = machine.baseOutputPerLine * speedMultiplier * machine.lines;
              // Net rate = output - input consumption
              const totalInputConsumption = Object.values(machine.inputRates).reduce((sum, rate) => sum + (rate ?? 0), 0) * machine.lines;
              netRate = outputRate - totalInputConsumption;
            }
          } else if (node.type === 'storage') {
            const resourceMap: Record<string, ResourceId> = {
              'methaneTank': 'methane',
              'loxTank': 'lox',
              'fuelTank': 'fuel',
            };
            const resourceId = resourceMap[node.id];
            if (resourceId) {
              const resource = simState.resources[resourceId];
              bufferLevel = resource?.buffer ?? 0;
              bufferCapacity = 1000;
              netRate = (resource?.prodPerMin ?? 0) - (resource?.consPerMin ?? 0);
            }
          } else if (node.type === 'source') {
            const resourceMap: Record<string, ResourceId> = {
              'siliconSource': 'silicon',
              'steelSource': 'steel',
            };
            const resourceId = resourceMap[node.id];
            if (resourceId) {
              const resource = simState.resources[resourceId];
              bufferLevel = resource?.buffer ?? 0;
              netRate = resource?.prodPerMin ?? 0;
            }
          }

          // Classify node status using semantics
          const nodeStatus: NodeStatus = {
            state: 'healthy',
            utilization,
            buffer: bufferLevel,
          };
          const status = classifyNode(nodeStatus);
          const isSelected = currentSelectedNode === node.id;
          const borderColor = getNodeBorderColor(status, isSelected);
          const isStarved = status === 'starved';

          return (
            <g
              key={node.id}
              onClick={(e) => {
                e.stopPropagation();
                handleSelectNode(node.id);
              }}
              style={{ cursor: 'pointer' }}
            >
              {/* Building background */}
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                rx={4}
                fill={node.type === 'source' ? '#1e293b' : '#0f172a'}
                stroke={borderColor}
                strokeWidth={isSelected ? 4 : isStarved ? 3 : 2}
                opacity={status === 'idle' ? 0.5 : 1}
                style={{
                  filter: isSelected
                    ? 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.8))'
                    : isStarved
                    ? 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.5))'
                    : 'none',
                  animation: isStarved ? 'pulse 2s ease-in-out infinite' : 'none',
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
                y={y + height / 2 - 8}
                textAnchor="middle"
                className="text-[10px] fill-gray-300 font-semibold"
              >
                {node.label}
              </text>

              {/* Essential info: buf, rate, utilization */}
              {node.type !== 'launch' && (
                <>
                  <text
                    x={x + width / 2}
                    y={y + height / 2 + 4}
                    textAnchor="middle"
                    className="text-[8px] fill-gray-400"
                  >
                    buf: {formatDecimal(bufferLevel, 0)}
                  </text>
                  <text
                    x={x + width / 2}
                    y={y + height / 2 + 14}
                    textAnchor="middle"
                    className="text-[8px]"
                    fill={getNetRateColor(netRate)}
                  >
                    rate: {netRate >= 0 ? '+' : ''}{formatSigFigs(netRate, 2)}/min
                  </text>
                </>
              )}

              {/* Utilization for machines */}
              {node.type === 'machine' && (
                <text
                  x={x + width / 2}
                  y={y + height / 2 + 22}
                  textAnchor="middle"
                  className="text-[7px] fill-gray-500"
                >
                  {formatDecimal(utilization * 100, 0)}%
                </text>
              )}

              {/* Launch pad rocket icon */}
              {node.type === 'launch' && (
                <text
                  x={x + width / 2}
                  y={y + height / 2 + 4}
                  textAnchor="middle"
                  className="text-lg"
                >
                  🚀
                </text>
              )}
            </g>
          );
        })}

        {/* Launch animations */}
        {launchEvents.map(event => {
          const launchNode = FACTORY_NODES.find(n => n.id === 'launchComplex');
          if (!launchNode) return null;

          const startX = launchNode.x * viewBoxWidth + (launchNode.width * viewBoxWidth) / 2;
          const startY = launchNode.y * viewBoxHeight;
          const endX = viewBoxWidth - 20;
          const endY = 20;

          const elapsed = (Date.now() - event.createdAt) / 1000;
          const progress = Math.min(1, elapsed / 3);
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

        {/* Legend - bottom left */}
        <g>
          <rect
            x="20"
            y={viewBoxHeight - 80}
            width="180"
            height="60"
            fill="rgba(0, 0, 0, 0.7)"
            rx="4"
            stroke="#374151"
            strokeWidth="1"
          />
          <text
            x="30"
            y={viewBoxHeight - 65}
            className="text-[9px] fill-gray-300 font-semibold"
          >
            Resources
          </text>
          {['chips', 'racks', 'pods', 'fuel'].map((resource, idx) => (
            <g key={resource}>
              <line
                x1="30"
                y1={viewBoxHeight - 55 + idx * 12}
                x2="50"
                y2={viewBoxHeight - 55 + idx * 12}
                stroke={getResourceColor(resource as ResourceId)}
                strokeWidth="3"
              />
              <text
                x="55"
                y={viewBoxHeight - 52 + idx * 12}
                className="text-[8px] fill-gray-400 capitalize"
              >
                {resource}
              </text>
            </g>
          ))}
          <text
            x="30"
            y={viewBoxHeight - 10}
            className="text-[7px] fill-gray-500"
          >
            Node colors: Idle / Healthy / Constrained / Starved
          </text>
        </g>

        {/* Time scale indicator - bottom right */}
        <text
          x={viewBoxWidth - 20}
          y={viewBoxHeight - 10}
          textAnchor="end"
          className="text-[8px] fill-gray-500"
        >
          {simState?.timeScale ?? 1}×
        </text>
      </svg>

      {/* CSS for pulse animation */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
