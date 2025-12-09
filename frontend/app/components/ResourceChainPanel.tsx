"use client";

import { useSandboxStore } from "../store/sandboxStore";
import type { ResourceId, FlowEdge } from "../lib/sim/model";
import { formatSigFigs } from "../lib/utils/formatNumber";

interface ResourceNodeProps {
  resourceId: ResourceId;
  name: string;
  units: string;
  buffer: number;
  prodPerMin: number;
  consPerMin: number;
  isBottleneck: boolean;
  bottleneckSeverity: number;
}

function ResourceNode({ resourceId, name, units, buffer, prodPerMin, consPerMin, isBottleneck, bottleneckSeverity }: ResourceNodeProps) {
  const delta = prodPerMin - consPerMin;
  const hasProduction = prodPerMin > 0;
  
  return (
    <div className={`p-2 rounded border transition-all ${
      isBottleneck 
        ? bottleneckSeverity > 50 
          ? "bg-red-500/20 border-red-500/50 animate-pulse" 
          : "bg-orange-500/20 border-orange-500/50"
        : delta > 0 
          ? "bg-gray-800/50 border-gray-700" 
          : "bg-gray-800 border-gray-700"
    }`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-semibold ${
          isBottleneck ? "text-red-400" : "text-gray-300"
        }`}>
          {name}
        </span>
        {isBottleneck && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-red-500/30 text-red-300">
            ⚠
          </span>
        )}
      </div>
      
      <div className="space-y-0.5 text-[10px]">
        <div className="flex justify-between text-gray-400">
          <span>Buf:</span>
          <span className="text-white font-mono">
            {formatSigFigs(buffer)} {units}
          </span>
        </div>
        {hasProduction && (
          <div className="flex justify-between text-gray-400">
            <span>Rate:</span>
            <span className={`font-mono ${
              isBottleneck ? "text-red-400" : "text-green-400"
            }`}>
              {formatSigFigs(prodPerMin - consPerMin, 1)}/min
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface FlowArrowProps {
  from: ResourceId;
  to: ResourceId;
  flowRate: number;
}

function FlowArrow({ from, to, flowRate }: FlowArrowProps) {
  return (
    <div className="flex items-center justify-center py-1 relative">
      <svg className="w-full h-8" viewBox="0 0 100 20" preserveAspectRatio="none">
        <defs>
          <marker
            id={`arrowhead-${from}-${to}`}
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="#60a5fa" />
          </marker>
        </defs>
        <line
          x1="10"
          y1="10"
          x2="90"
          y2="10"
          stroke="#60a5fa"
          strokeWidth="2"
          markerEnd={`url(#arrowhead-${from}-${to})`}
        />
        {/* Animated dots */}
        {flowRate > 0 && (
          <circle
            r="3"
            fill="#60a5fa"
            className="animate-flow"
            style={{
              animation: `flow ${Math.max(1, 10 / flowRate)}s linear infinite`,
            }}
          >
            <animateMotion
              dur={`${Math.max(1, 10 / flowRate)}s`}
              repeatCount="indefinite"
            >
              <mpath href={`#path-${from}-${to}`} />
            </animateMotion>
          </circle>
        )}
        <path
          id={`path-${from}-${to}`}
          d="M 10 10 L 90 10"
          fill="none"
          stroke="none"
        />
      </svg>
    </div>
  );
}

export default function ResourceChainPanel() {
  const { simState } = useSandboxStore();
  
  if (!simState) {
    return <div className="text-xs text-gray-500">Loading simulation state...</div>;
  }

  const { resources, flows } = simState;

  // Calculate bottlenecks
  const bottlenecks = new Map<ResourceId, number>();
  for (const [resourceId, resource] of Object.entries(resources)) {
    const delta = resource.prodPerMin - resource.consPerMin;
    if (delta < 0 && resource.consPerMin > 0) {
      bottlenecks.set(resourceId as ResourceId, Math.abs(delta));
    }
  }

  // Define resource chain order (only valid ResourceId types)
  const chainOrder: ResourceId[] = [
    'silicon',
    'chips',
    'steel',
    'pods',
    'launches',
  ];

  // Filter to only show resources that exist in state
  const visibleResources = chainOrder.filter(id => resources[id]);

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-300 mb-2 uppercase tracking-wide">
        Resources
      </div>
      
      {visibleResources.map((resourceId, index) => {
        const resource = resources[resourceId];
        if (!resource) return null;

        const isBottleneck = bottlenecks.has(resourceId);
        const bottleneckSeverity = bottlenecks.get(resourceId) ?? 0;

        return (
          <ResourceNode
            key={resourceId}
            resourceId={resourceId}
            name={resource.name}
            units={resource.units}
            buffer={resource.buffer}
            prodPerMin={resource.prodPerMin}
            consPerMin={resource.consPerMin}
            isBottleneck={isBottleneck}
            bottleneckSeverity={bottleneckSeverity}
          />
        );
      })}
    </div>
  );
}

