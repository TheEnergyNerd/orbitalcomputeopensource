"use client";

import { useEffect, useState, useRef } from "react";
import { useSandboxStore } from "../../store/sandboxStore";
import { getMachineUtilization, getResourceThroughput } from "../../lib/sim/engine";
import type { SimState, ResourceId, MachineId } from "../../lib/sim/model";
import { formatSigFigs, formatDecimal } from "../../lib/utils/formatNumber";
import { classifyNode } from "../../lib/ui/semantics";
import {
  ChipFabBuilding,
  ComputeLineBuilding,
  PodFactoryBuilding,
  LaunchOpsBuilding,
  SiliconSourceBuilding,
  SteelSourceBuilding,
} from "./BuildingSprites";

interface FactoryStripProps {
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  highlightNodeId?: string | null; // Node to highlight as bottleneck
}

// Proper spacing for scrollable factory flow
const BUILDING_WIDTH = 240;
const BUILDING_HEIGHT = 100;
const SOURCE_WIDTH = 160;
const SOURCE_HEIGHT = 80;
const BUILDING_SPACING = 260; // Minimum 260px spacing between nodes
const VERTICAL_SPACING = 160; // Minimum 160px vertical spacing
const CONDUIT_HEIGHT = 8;
const PACKET_COUNT = 6;
const PACKET_RADIUS = 4;

// Building order for horizontal layout
const BUILDING_ORDER = [
  { id: "siliconSource", type: "source" as const, label: "Silicon", subtitle: "Infinite source" },
  { id: "chipFab", type: "machine" as const, label: "Chip Fab", subtitle: "Turns Silicon into Chips" },
  { id: "computeLine", type: "machine" as const, label: "Compute Line", subtitle: "Turns Steel + Chips into Compute Units" },
  { id: "podFactory", type: "machine" as const, label: "Pod Factory", subtitle: "Builds Pods from Chips + Compute Units" },
  { id: "launchOpsResource", type: "source" as const, label: "Launch Ops", subtitle: "Infinite source" },
  { id: "launchOps", type: "machine" as const, label: "Launch Ops", subtitle: "Consumes Pods + Launch Ops to add Pods in Orbit" },
] as const;

// Resource flow paths
const RESOURCE_FLOWS: Array<{ from: string; to: string; resource: ResourceId; color: string }> = [
  { from: "siliconSource", to: "chipFab", resource: "silicon", color: "#a78bfa" },
  { from: "steelSource", to: "computeLine", resource: "steel", color: "#cbd5e1" },
  { from: "chipFab", to: "computeLine", resource: "chips", color: "#22d3ee" },
  { from: "chipFab", to: "podFactory", resource: "chips", color: "#22d3ee" },
  { from: "computeLine", to: "podFactory", resource: "computeUnits", color: "#facc15" },
  { from: "podFactory", to: "launchOps", resource: "pods", color: "#f472b6" },
  { from: "launchOpsResource", to: "launchOps", resource: "launchOpsResource", color: "#f97316" },
];

export default function FactoryStrip({ selectedNodeId, onSelectNode, highlightNodeId }: FactoryStripProps) {
  const { simState } = useSandboxStore();
  const [isMobile, setIsMobile] = useState(false);
  const animationFrameRef = useRef<number>();
  const packetOffsetsRef = useRef<Record<string, number>>({});
  const lastLaunchCountRef = useRef(0);
  const [launchAnimations, setLaunchAnimations] = useState<Array<{ id: number; startTime: number }>>([]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 700);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Detect launch events
  useEffect(() => {
    if (simState) {
      const currentLaunches = Math.floor(simState.resources.launches?.buffer ?? 0);
      if (currentLaunches > lastLaunchCountRef.current) {
        // New launch detected
        const newLaunch = {
          id: Date.now(),
          startTime: Date.now(),
        };
        setLaunchAnimations((prev) => [...prev, newLaunch]);
        lastLaunchCountRef.current = currentLaunches;
        
        // Remove animation after 3 seconds
        setTimeout(() => {
          setLaunchAnimations((prev) => prev.filter((a) => a.id !== newLaunch.id));
        }, 3000);
      }
    }
  }, [simState]);

  useEffect(() => {
    // Only animate if there's actual production happening
    const hasProduction = Object.values(simState?.machines || {}).some(m => m.lines > 0);
    
    if (!hasProduction) {
      // No animation if no machines are running
      return;
    }

    // Animate packet offsets
    const animate = () => {
      if (!simState) return;

      // Update packet offsets based on throughput
      RESOURCE_FLOWS.forEach((flow) => {
        const throughput = getResourceThroughput(flow.resource, simState);
        const speed = Math.max(throughput / 100, 0.15); // Minimum speed 0.15
        const key = `${flow.from}-${flow.to}`;
        packetOffsetsRef.current[key] = (packetOffsetsRef.current[key] || 0) + speed * 0.5;
        if (packetOffsetsRef.current[key] > 100) {
          packetOffsetsRef.current[key] = 0;
        }
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [simState]);

  if (!simState) {
    return (
      <div className="fixed bottom-0 left-0 right-0 h-[200px] bg-gray-900/95 border-t border-gray-700 z-30 flex items-center justify-center">
        <div className="text-xs text-gray-500">Loading factory state...</div>
      </div>
    );
  }

  const { machines, resources } = simState;

  // Calculate building positions
  const buildingPositions: Record<string, { x: number; y: number }> = {};
  
  if (isMobile) {
    // Vertical stack for mobile
    let currentY = 20;
    const centerX = 50;
    const verticalSpacing = 80;
    
    BUILDING_ORDER.forEach((building) => {
      if (building.type === "source") {
        buildingPositions[building.id] = { x: centerX - SOURCE_WIDTH / 2, y: currentY };
        currentY += SOURCE_HEIGHT + verticalSpacing;
      } else {
        buildingPositions[building.id] = { x: centerX - BUILDING_WIDTH / 2, y: currentY };
        currentY += BUILDING_HEIGHT + verticalSpacing;
      }
    });
    
    // Steel source above compute line
    const computeLineY = buildingPositions["computeLine"]?.y || 0;
    buildingPositions["steelSource"] = {
      x: centerX - SOURCE_WIDTH / 2,
      y: computeLineY - SOURCE_HEIGHT - 10,
    };
  } else {
    // Horizontal layout for desktop - much more spacing for less compression
    let currentX = 60;
    const centerY = 120;
    const spacing = BUILDING_SPACING;

    BUILDING_ORDER.forEach((building) => {
      if (building.type === "source") {
        buildingPositions[building.id] = { x: currentX, y: centerY - SOURCE_HEIGHT / 2 };
        currentX += SOURCE_WIDTH + spacing;
      } else {
        buildingPositions[building.id] = { x: currentX, y: centerY - BUILDING_HEIGHT / 2 };
        currentX += BUILDING_WIDTH + spacing;
      }
    });

    // Add steel source (for compute line, positioned above) - proper vertical spacing
    const computeLineX = buildingPositions["computeLine"]?.x || 0;
    buildingPositions["steelSource"] = {
      x: computeLineX,
      y: centerY - BUILDING_HEIGHT / 2 - SOURCE_HEIGHT - VERTICAL_SPACING / 2,
    };
    
    // Add launchOpsResource source (positioned below launchOps) - proper vertical spacing
    const launchOpsX = buildingPositions["launchOps"]?.x || 0;
    buildingPositions["launchOpsResource"] = {
      x: launchOpsX,
      y: centerY + BUILDING_HEIGHT / 2 + VERTICAL_SPACING / 2,
    };
  }

  const getBuildingUtilization = (buildingId: string): number => {
    if (buildingId === "siliconSource" || buildingId === "steelSource") return 1; // Sources always active
    const machineIdMap: Record<string, MachineId> = {
      chipFab: "chipFab",
      computeLine: "computeLine",
      podFactory: "podFactory",
      launchOps: "launchOps",
    };
    const machineId = machineIdMap[buildingId];
    if (machineId) {
      const machine = machines[machineId];
      if (machine) return getMachineUtilization(machine, resources, simState.constraints);
    }
    return 0;
  };

  const getBuildingStatus = (buildingId: string): { isStarved: boolean; isConstrained: boolean } => {
    if (buildingId === "siliconSource" || buildingId === "steelSource") {
      return { isStarved: false, isConstrained: false };
    }
    const machineIdMap: Record<string, MachineId> = {
      chipFab: "chipFab",
      computeLine: "computeLine",
      podFactory: "podFactory",
      launchOps: "launchOps",
    };
    const machineId = machineIdMap[buildingId];
    if (machineId) {
      const machine = machines[machineId];
      if (machine) {
        const utilization = getMachineUtilization(machine, resources, simState.constraints);
        const isStarved = utilization < 0.1 && machine.lines > 0;
        const isConstrained = utilization > 0.8;
        return { isStarved, isConstrained };
      }
    }
    return { isStarved: false, isConstrained: false };
  };

  const renderConduit = (flow: typeof RESOURCE_FLOWS[0]) => {
    const fromPos = buildingPositions[flow.from];
    const toPos = buildingPositions[flow.to];
    if (!fromPos || !toPos) return null;

    const throughput = getResourceThroughput(flow.resource, simState);
    const speed = Math.max(throughput / 100, 0.15);
    // Show only active connectors (dim inactive to 20% opacity)
    const opacity = throughput > 0 ? 1.0 : 0.2;

    // Calculate path - handle both horizontal and vertical layouts
    const fromIsSource = flow.from.includes("Source");
    const toIsSource = flow.to.includes("Source");
    
    let startX: number, startY: number, endX: number, endY: number;
    
    if (isMobile) {
      // Vertical layout: conduits go down
      const fromOffsetY = fromIsSource ? SOURCE_HEIGHT : BUILDING_HEIGHT;
      startX = fromPos.x + (fromIsSource ? SOURCE_WIDTH / 2 : BUILDING_WIDTH / 2);
      startY = fromPos.y + fromOffsetY;
      endX = toPos.x + (toIsSource ? SOURCE_WIDTH / 2 : BUILDING_WIDTH / 2);
      endY = toPos.y;
    } else {
      // Horizontal layout: conduits go right
      const fromOffsetX = fromIsSource ? SOURCE_WIDTH : BUILDING_WIDTH;
      const fromOffsetY = fromIsSource ? SOURCE_HEIGHT / 2 : BUILDING_HEIGHT / 2;
      const toOffsetY = toIsSource ? SOURCE_HEIGHT / 2 : BUILDING_HEIGHT / 2;
      startX = fromPos.x + fromOffsetX;
      startY = fromPos.y + fromOffsetY;
      endX = toPos.x;
      endY = toPos.y + toOffsetY;
    }

    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.sqrt(dx * dx + dy * dy);

    const key = `${flow.from}-${flow.to}`;
    const baseOffset = packetOffsetsRef.current[key] || 0;

    return (
      <g key={`conduit-${flow.from}-${flow.to}`}>
        {/* Conduit base (clean thin outline) */}
        <line
          x1={startX}
          y1={startY}
          x2={endX}
          y2={endY}
          stroke={flow.color}
          strokeWidth="2"
          opacity={opacity}
          strokeLinecap="round"
        />
        
        {/* Animated resource packets */}
        {Array.from({ length: PACKET_COUNT }).map((_, i) => {
          const packetOffset = (baseOffset + (i * (100 / PACKET_COUNT))) % 100;
          const packetX = startX + (dx * packetOffset / 100);
          const packetY = startY + (dy * packetOffset / 100);
          
          return (
            <circle
              key={`packet-${i}`}
              cx={packetX}
              cy={packetY}
              r={PACKET_RADIUS}
              fill={flow.color}
              opacity={opacity}
            />
          );
        })}
      </g>
    );
  };

  const renderBuilding = (building: typeof BUILDING_ORDER[0]) => {
    const pos = buildingPositions[building.id];
    if (!pos) return null;

    const utilization = getBuildingUtilization(building.id);
    const { isStarved, isConstrained } = getBuildingStatus(building.id);
    const isSelected = selectedNodeId === building.id;
    
    // Check if pods are ready for launch (highlight Launch Ops)
    const podsReady = building.id === "launchOps" && (simState.resources.pods?.buffer || 0) > 0;
    const isHighlighted = highlightNodeId === building.id;

    let BuildingComponent: React.ComponentType<BuildingSpriteProps> | null = null;
    if (building.id === "siliconSource") {
      BuildingComponent = SiliconSourceBuilding;
    } else if (building.id === "steelSource") {
      BuildingComponent = SteelSourceBuilding;
    } else if (building.id === "chipFab") {
      BuildingComponent = ChipFabBuilding;
    } else if (building.id === "computeLine") {
      BuildingComponent = ComputeLineBuilding;
    } else if (building.id === "podFactory") {
      BuildingComponent = PodFactoryBuilding;
    } else if (building.id === "launchOps") {
      BuildingComponent = LaunchOpsBuilding;
    } else {
      return null;
    }
    
    if (!BuildingComponent) return null;

    const width = building.type === "source" ? SOURCE_WIDTH : BUILDING_WIDTH;
    const height = building.type === "source" ? SOURCE_HEIGHT : BUILDING_HEIGHT;

    return (
      <g
        key={building.id}
        transform={`translate(${pos.x}, ${pos.y})`}
        onClick={() => onSelectNode?.(building.id)}
        className="cursor-pointer"
      >
        <BuildingComponent
          utilization={utilization}
          isStarved={isStarved}
          isConstrained={isConstrained}
          width={width}
          height={height}
          isHighlighted={podsReady}
        />
        {/* Clean thin outlines with color accents - no glow */}
        {isSelected && (
          <rect
            x="-1"
            y="-1"
            width={width + 2}
            height={height + 2}
            fill="none"
            stroke="#60a5fa"
            strokeWidth="2"
            rx="4"
          />
        )}
        {isHighlighted && (
          <rect
            x="-2"
            y="-2"
            width={width + 4}
            height={height + 4}
            fill="none"
            stroke="#f97316"
            strokeWidth="2"
            rx="4"
          />
        )}
        {/* Label and subtitle below building (or to the right on mobile) */}
        {isMobile ? (
          <>
            <text
              x={width + 15}
              y={height / 2 - 4}
              textAnchor="start"
              className="text-xs fill-gray-300 font-semibold"
            >
              {building.label}
            </text>
            {building.subtitle && (
              <text
                x={width + 15}
                y={height / 2 + 10}
                textAnchor="start"
                className="text-[10px] fill-gray-400"
              >
                {building.subtitle}
              </text>
            )}
          </>
        ) : (
          <>
            <text
              x={width / 2}
              y={height + 25}
              textAnchor="middle"
              className="text-sm fill-gray-300 font-semibold"
            >
              {building.label}
            </text>
            {building.subtitle && (
              <text
                x={width / 2}
                y={height + 42}
                textAnchor="middle"
                className="text-xs fill-gray-400"
              >
                {building.subtitle}
              </text>
            )}
          </>
        )}
      </g>
    );
  };

  const [isExpanded, setIsExpanded] = useState(false); // Collapsed by default
  
  // Calculate SVG dimensions based on layout - ensure all buildings are visible
  const maxX = Math.max(...Object.values(buildingPositions).map(p => p.x + (p.x === buildingPositions["siliconSource"]?.x ? SOURCE_WIDTH : BUILDING_WIDTH)), 0);
  const svgWidth = isMobile ? 100 : Math.max(maxX + 200, 2000); // Minimum 2000px width for scrollability
  const svgHeight = isMobile ? 600 : 320;
  
  if (!isExpanded) {
    return (
      <div className="fixed bottom-0 left-0 right-0 h-8 bg-gray-900/95 border-t border-gray-700 z-20" style={{ marginLeft: isMobile ? '0' : '280px' }}>
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full h-full flex items-center justify-center text-xs text-gray-400 hover:text-white transition"
        >
          Show Factory Flow ▼
        </button>
      </div>
    );
  }
  
  return (
    <div className="fixed bottom-0 left-0 right-0 h-[320px] bg-gray-900/95 border-t border-gray-700 z-20" style={{ marginLeft: isMobile ? '0' : '280px' }}>
      <div className="w-full h-full overflow-x-auto overflow-y-hidden">
      {/* Collapse button */}
      <button
        onClick={() => setIsExpanded(false)}
        className="absolute top-2 right-2 text-xs text-gray-400 hover:text-white transition z-30 bg-gray-800/80 px-2 py-1 rounded"
      >
        Hide Factory Flow ▲
      </button>
      
      <svg
        width={svgWidth}
        height={svgHeight}
        className="block"
        style={{ minWidth: `${svgWidth}px` }}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="none"
      >
        {/* Render conduits first (behind buildings) - only show active ones */}
        {RESOURCE_FLOWS.map(renderConduit)}

        {/* Factory Flow label */}
        <text
          x={svgWidth / 2}
          y="20"
          textAnchor="middle"
          className="text-sm fill-gray-300 font-semibold"
        >
          Factory Flow: From Ground Materials to Orbit
        </text>
        
        {/* Render buildings */}
        {BUILDING_ORDER.map(renderBuilding)}
        {/* Steel source with subtitle */}
        {buildingPositions["steelSource"] && renderBuilding({ id: "steelSource", type: "source" as const, label: "Steel", subtitle: "Infinite source" })}
        
        {/* Rocket launch animations */}
        {launchAnimations.map((anim) => {
          const launchPos = buildingPositions["launchOps"];
          if (!launchPos) return null;
          
          const elapsed = (Date.now() - anim.startTime) / 1000;
          const progress = Math.min(1, elapsed / 3); // 3 second animation
          
          if (progress >= 1) return null;
          
          // Rocket rises from launch pad
          const startX = launchPos.x + BUILDING_WIDTH / 2;
          const startY = launchPos.y + BUILDING_HEIGHT;
          const endY = startY - 100 * progress; // Rise 100px over 3 seconds
          
          return (
            <g key={anim.id} opacity={1 - progress}>
              <path
                d={`M${startX} ${startY} L${startX - 3} ${endY} L${startX + 3} ${endY} Z`}
                fill="#cbd5e1"
                stroke="#94a3b8"
                strokeWidth="1"
              />
              <circle cx={startX} cy={endY} r="2" fill="#facc15" />
            </g>
          );
        })}
      </svg>
      </div>
    </div>
  );
}

