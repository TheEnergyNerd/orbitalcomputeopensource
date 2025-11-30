"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { getMachineUtilization } from "../lib/sim/engine";
import type { MachineId, ResourceId } from "../lib/sim/model";
import { formatSigFigs, formatDecimal } from "../lib/utils/formatNumber";

export default function FactorySystemsPanel() {
  const { simState } = useSandboxStore();

  if (!simState) {
    return <div className="text-xs text-gray-500">Loading...</div>;
  }

  const { machines, resources, constraints } = simState;

  // Calculate bottlenecks and starved factories
  const bottlenecks: Array<{ id: string; name: string }> = [];
  const starved: Array<{ id: string; name: string }> = [];
  const underpowered: boolean = constraints.powerUsedMW > constraints.powerCapacityMW;
  const overCapacity: boolean = 
    constraints.coolingUsedMW > constraints.coolingCapacityMW ||
    constraints.workforceUsed > constraints.workforceTotal;

  Object.entries(machines).forEach(([machineId, machine]) => {
    if (machine.lines === 0) return;
    
    const utilization = getMachineUtilization(machine, resources, constraints);
    const isStarved = utilization < 0.1 && machine.lines > 0;
    const isConstrained = utilization > 0.8;
    
    if (isStarved) {
      starved.push({ id: machineId, name: machine.name });
    } else if (isConstrained) {
      bottlenecks.push({ id: machineId, name: machine.name });
    }
  });

  return (
    <div className="space-y-4">
      {/* A. Systems Status */}
      <div>
        <h3 className="text-xs font-semibold text-gray-300 mb-2 uppercase">Systems Status</h3>
        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">Power:</span>
              <span className="text-white">
                {formatDecimal(constraints.powerUsedMW, 1)} / {formatDecimal(constraints.powerCapacityMW, 1)} MW
              </span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  constraints.powerUsedMW > constraints.powerCapacityMW ? "bg-red-500" : "bg-green-500"
                }`}
                style={{ width: `${Math.min(100, (constraints.powerUsedMW / constraints.powerCapacityMW) * 100)}%` }}
              />
            </div>
          </div>
          
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">Cooling:</span>
              <span className="text-white">
                {formatDecimal(constraints.coolingUsedMW, 1)} / {formatDecimal(constraints.coolingCapacityMW, 1)} MW
              </span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  constraints.coolingUsedMW > constraints.coolingCapacityMW ? "bg-red-500" : "bg-blue-500"
                }`}
                style={{ width: `${Math.min(100, (constraints.coolingUsedMW / constraints.coolingCapacityMW) * 100)}%` }}
              />
            </div>
          </div>
          
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">Workforce:</span>
              <span className="text-white">
                {constraints.workforceUsed} / {constraints.workforceTotal}
              </span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  constraints.workforceUsed > constraints.workforceTotal ? "bg-red-500" : "bg-yellow-500"
                }`}
                style={{ width: `${Math.min(100, (constraints.workforceUsed / constraints.workforceTotal) * 100)}%` }}
              />
            </div>
          </div>
          
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">Floor Space:</span>
              <span className="text-white">
                {constraints.gridOccupied.flat().filter(Boolean).length} / {constraints.gridWidth * constraints.gridHeight} cells
              </span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gray-500 transition-all"
                style={{ width: `${(constraints.gridOccupied.flat().filter(Boolean).length / (constraints.gridWidth * constraints.gridHeight)) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* B. Resource Health */}
      <div>
        <h3 className="text-xs font-semibold text-gray-300 mb-2 uppercase">Resource Health</h3>
        <div className="space-y-1">
          {Object.entries(resources).map(([resourceId, resource]) => {
            const netRate = resource.prodPerMin - resource.consPerMin;
            const rateColor = netRate > 0 ? "text-cyan-400" : netRate < 0 ? "text-red-400" : "text-gray-400";
            return (
              <div key={resourceId} className="flex justify-between text-xs">
                <span className="text-gray-300">{resource.name}:</span>
                <span className="text-white">{formatDecimal(resource.buffer, 0)}</span>
                <span className={rateColor}>
                  [{netRate > 0 ? "+" : ""}{formatDecimal(netRate, 1)}/min]
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* C. Warnings */}
      <div>
        <h3 className="text-xs font-semibold text-gray-300 mb-2 uppercase">Warnings</h3>
        <div className="space-y-1 text-xs">
          {bottlenecks.length > 0 && (
            <div className="text-orange-400">
              <strong>Bottlenecks:</strong> {bottlenecks.map(b => b.name).join(", ")}
            </div>
          )}
          {starved.length > 0 && (
            <div className="text-red-400">
              <strong>Starved:</strong> {starved.map(s => s.name).join(", ")}
            </div>
          )}
          {underpowered && (
            <div className="text-red-400">
              <strong>Underpowered:</strong> Power capacity exceeded
            </div>
          )}
          {overCapacity && (
            <div className="text-red-400">
              <strong>Over Capacity:</strong> Cooling or workforce exceeded
            </div>
          )}
          {bottlenecks.length === 0 && starved.length === 0 && !underpowered && !overCapacity && (
            <div className="text-green-400">All systems operational</div>
          )}
        </div>
      </div>
    </div>
  );
}

