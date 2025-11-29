"use client";

import { useState } from "react";
import { useSandboxStore } from "../store/sandboxStore";
import { getMachineUtilization } from "../lib/sim/engine";
import type { MachineId, ResourceId } from "../lib/sim/model";
import { FACTORY_NODES, type FactoryNodeId } from "../lib/factory/factoryLayout";
import { classifyNode, getStatusColor, getNetRateColor, type NodeStatus } from "../lib/ui/semantics";
import { formatSigFigs, formatDecimal } from "../lib/utils/formatNumber";
import MachineCard from "./MachineCard";

interface FactorySidebarProps {
  selectedNodeId: FactoryNodeId | null;
  onSelectNode: (nodeId: FactoryNodeId | null) => void;
}

/**
 * FactorySidebar - HUD for factory view
 * Shows: Factory summary, Selected node detail, Collapsible machines list
 */
export default function FactorySidebar({ selectedNodeId, onSelectNode }: FactorySidebarProps) {
  const { simState, updateMachineLines, timeScale } = useSandboxStore();
  const [machinesExpanded, setMachinesExpanded] = useState(false);

  if (!simState) {
    return <div className="text-xs text-gray-500">Loading simulation state...</div>;
  }

  const { machines, resources } = simState;

  // Calculate bottlenecks and overproduced
  const bottlenecks: Array<{ id: ResourceId; name: string; severity: number }> = [];
  const overproduced: Array<{ id: ResourceId; name: string; netRate: number }> = [];
  
  for (const [resourceId, resource] of Object.entries(resources)) {
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
  const launchesPerMonth = (resources.launches?.prodPerMin ?? 0) * 60 * 24 * 30;

  // Get selected node details
  const selectedNode = selectedNodeId ? FACTORY_NODES.find(n => n.id === selectedNodeId) : null;
  let selectedNodeDetails: {
    type: 'machine' | 'storage' | 'source' | 'launch';
    name: string;
    utilization?: number;
    lines?: number;
    buffer?: number;
    capacity?: number;
    outputRate?: number;
    inputs?: Array<{ resource: ResourceId; needed: number; available: number }>;
    netRate?: number;
  } | null = null;

  if (selectedNode) {
    if (selectedNode.type === 'machine') {
      const machineId = selectedNode.id as MachineId;
      const machine = machines[machineId];
      if (machine) {
        const utilization = getMachineUtilization(machine, resources);
        const speedMultiplier = 1 + (machine.upgrades.speedLevel * 0.2);
        const outputRate = machine.baseOutputPerLine * speedMultiplier * machine.lines;
        
        const inputs = Object.entries(machine.inputRates).map(([resourceId, ratePerLine]) => {
          const resource = resources[resourceId as ResourceId];
          return {
            resource: resourceId as ResourceId,
            needed: (ratePerLine ?? 0) * machine.lines,
            available: resource?.prodPerMin ?? 0,
          };
        });

        selectedNodeDetails = {
          type: 'machine',
          name: selectedNode.label,
          utilization,
          lines: machine.lines,
          outputRate,
          inputs,
        };
      }
    } else if (selectedNode.type === 'storage') {
      const resourceMap: Record<string, ResourceId> = {
        'methaneTank': 'methane',
        'loxTank': 'lox',
        'fuelTank': 'fuel',
      };
      const resourceId = resourceMap[selectedNode.id];
      if (resourceId) {
        const resource = resources[resourceId];
        selectedNodeDetails = {
          type: 'storage',
          name: selectedNode.label,
          buffer: resource?.buffer ?? 0,
          capacity: 1000,
          netRate: (resource?.prodPerMin ?? 0) - (resource?.consPerMin ?? 0),
        };
      }
    } else if (selectedNode.type === 'source') {
      const resourceMap: Record<string, ResourceId> = {
        'siliconSource': 'silicon',
        'steelSource': 'steel',
      };
      const resourceId = resourceMap[selectedNode.id];
      if (resourceId) {
        const resource = resources[resourceId];
        selectedNodeDetails = {
          type: 'source',
          name: selectedNode.label,
          buffer: resource?.buffer ?? 0,
          netRate: resource?.prodPerMin ?? 0,
        };
      }
    } else {
      selectedNodeDetails = {
        type: 'launch',
        name: selectedNode.label,
      };
    }
  }

  return (
    <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
      {/* Breadcrumb */}
      <div className="text-[10px] text-gray-500 mb-2">
        Factory → {selectedNode ? selectedNode.label : "Overview"}
      </div>

      {/* Factory Health Summary */}
      <div className="p-3 rounded-lg border border-gray-700 bg-gray-800/50">
        <div className="text-xs font-semibold text-gray-300 mb-2">Factory Health</div>
        
        {bottlenecks.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] text-red-400 mb-1">Bottlenecks:</div>
            {bottlenecks.slice(0, 3).map(b => (
              <div key={b.id} className="text-[10px] text-gray-400 ml-2">
                • {b.name}
              </div>
            ))}
          </div>
        )}

        {overproduced.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] text-green-400 mb-1">Overproduced:</div>
            {overproduced.slice(0, 3).map(o => (
              <div key={o.id} className="text-[10px] text-gray-400 ml-2">
                • {o.name} (+{formatSigFigs(o.netRate, 1)}/min)
              </div>
            ))}
          </div>
        )}

        <div className="text-[10px] text-gray-400 mt-2">
          Launches: {formatSigFigs(launchesPerMonth, 1)}/mo
        </div>
      </div>

      {/* Compact Resource List */}
      <div className="space-y-1">
        <div className="text-xs font-semibold text-gray-300 mb-2">Resources</div>
        {(Object.keys(resources) as ResourceId[]).map(resourceId => {
          const resource = resources[resourceId];
          if (!resource) return null;
          
          const netRate = resource.prodPerMin - resource.consPerMin;
          const status: NodeStatus = {
            state: 'healthy',
            utilization: resource.consPerMin > 0 ? resource.prodPerMin / resource.consPerMin : 0,
            buffer: resource.buffer,
          };
          const classified = classifyNode(status);
          const statusColor = getStatusColor(classified);

          return (
            <div
              key={resourceId}
              className="flex items-center justify-between text-[10px] py-1 px-2 rounded border border-gray-700/50 bg-gray-800/30"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: statusColor }}
                />
                <span className="text-gray-300">{resource.name}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-400">
                <span>{formatDecimal(resource.buffer, 0)}</span>
                <span style={{ color: getNetRateColor(netRate) }}>
                  {netRate >= 0 ? '+' : ''}{formatSigFigs(netRate, 2)}/min
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Node Detail */}
      {selectedNodeDetails ? (
        <div className="p-3 rounded-lg border border-accent-blue/50 bg-gray-800/50">
          <div className="text-xs font-semibold text-accent-blue mb-2">
            {selectedNodeDetails.name}
          </div>
          <div className="text-[10px] text-gray-400 mb-2 capitalize">
            {selectedNodeDetails.type}
          </div>

          {selectedNodeDetails.type === 'machine' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">Lines:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateMachineLines(selectedNode!.id as MachineId, Math.max(0, (selectedNodeDetails.lines ?? 0) - 1))}
                    className="px-1.5 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 rounded"
                  >
                    -
                  </button>
                  <span className="text-[10px] text-white">{selectedNodeDetails.lines}</span>
                  <button
                    onClick={() => updateMachineLines(selectedNode!.id as MachineId, (selectedNodeDetails.lines ?? 0) + 1)}
                    className="px-1.5 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 rounded"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="text-[10px] text-gray-400">
                Utilization: <span className="text-white">{formatDecimal((selectedNodeDetails.utilization ?? 0) * 100, 0)}%</span>
              </div>
              <div className="text-[10px] text-gray-400">
                Output: <span className="text-white">{formatSigFigs(selectedNodeDetails.outputRate ?? 0, 1)}/min</span>
              </div>
              {selectedNodeDetails.inputs && selectedNodeDetails.inputs.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-700">
                  <div className="text-[10px] text-gray-400 mb-1">Inputs:</div>
                  {selectedNodeDetails.inputs.map(input => (
                    <div key={input.resource} className="text-[10px] text-gray-500 ml-2">
                      {input.resource}: {formatSigFigs(input.available, 1)}/{formatSigFigs(input.needed, 1)}/min
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedNodeDetails.type === 'storage' && (
            <div className="space-y-1">
              <div className="text-[10px] text-gray-400">
                Buffer: <span className="text-white">{formatDecimal(selectedNodeDetails.buffer ?? 0, 0)}</span> / {selectedNodeDetails.capacity}
              </div>
              <div className="text-[10px] text-gray-400">
                Net Rate: <span style={{ color: getNetRateColor(selectedNodeDetails.netRate ?? 0) }}>
                  {selectedNodeDetails.netRate && selectedNodeDetails.netRate >= 0 ? '+' : ''}{formatSigFigs(selectedNodeDetails.netRate ?? 0, 2)}/min
                </span>
              </div>
            </div>
          )}

          {selectedNodeDetails.type === 'source' && (
            <div className="text-[10px] text-gray-400">
              Buffer: {formatDecimal(selectedNodeDetails.buffer ?? 0, 0)}
            </div>
          )}
        </div>
      ) : (
        <div className="p-3 rounded-lg border border-gray-700/50 bg-gray-800/30 text-[10px] text-gray-500 text-center">
          Click a building in the factory map to inspect it.
        </div>
      )}

      {/* Collapsible Machines List */}
      <details
        open={machinesExpanded}
        onToggle={(e) => setMachinesExpanded(e.currentTarget.open)}
        className="mt-4"
      >
        <summary className="text-xs font-semibold text-gray-300 cursor-pointer mb-2">
          Machines ({Object.keys(machines).length}) — Advanced
        </summary>
        <div className="space-y-2 mt-2">
          {(Object.keys(machines) as MachineId[]).map((machineId) => {
            const machine = machines[machineId];
            const utilization = getMachineUtilization(machine, resources);
            return (
              <MachineCard
                key={machineId}
                machine={machine}
                utilization={utilization}
                onChangeLines={(lines) => updateMachineLines(machineId, lines)}
              />
            );
          })}
        </div>
      </details>
    </div>
  );
}

