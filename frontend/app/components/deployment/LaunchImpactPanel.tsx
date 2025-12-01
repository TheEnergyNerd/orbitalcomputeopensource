"use client";

import { useSandboxStore } from "../../store/sandboxStore";
import { calculateMetricsDelta, type MetricsDelta } from "../../lib/deployment/metrics";
import { formatSigFigs, formatDecimal } from "../../lib/utils/formatNumber";

export default function LaunchImpactPanel() {
  const { lastLaunchMetrics } = useSandboxStore();

  if (!lastLaunchMetrics) {
    return (
      <div className="panel">
        <h3 className="text-sm font-semibold text-white mb-3">This Launch Changed</h3>
        <div className="text-xs text-gray-400 text-center py-8">
          Launch pods to see impact
        </div>
      </div>
    );
  }

  const delta = calculateMetricsDelta(lastLaunchMetrics.before, lastLaunchMetrics.after);

  const MetricBox = ({ 
    title, 
    before, 
    after, 
    delta, 
    deltaPercent, 
    unit,
    isImprovement 
  }: {
    title: string;
    before: number;
    after: number;
    delta: number;
    deltaPercent?: number;
    unit: string;
    isImprovement: boolean;
  }) => {
    const deltaColor = isImprovement ? "text-green-400" : delta < 0 ? "text-red-400" : "text-gray-400";
    const borderColor = isImprovement ? "border-green-500/50" : delta < 0 ? "border-red-500/50" : "border-gray-700";
    
    return (
      <div className={`panel border-2 ${borderColor}`}>
        <div className="text-xs font-semibold text-white mb-2">{title}</div>
        
        {/* Before/After values */}
        <div className="space-y-1 text-[10px] mb-3">
          <div className="flex justify-between">
            <span className="text-gray-400">Before:</span>
            <span className="text-white">{formatSigFigs(before, 3)} {unit}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">After:</span>
            <span className="text-white">{formatSigFigs(after, 3)} {unit}</span>
          </div>
        </div>
        
        {/* Mini bar with markers */}
        <div className="relative h-4 bg-gray-800 rounded mb-2">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gray-500" style={{ left: '20%' }} />
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500" style={{ left: '80%' }} />
          <div className="text-[8px] text-gray-500 absolute left-1 top-0.5">G</div>
          <div className="text-[8px] text-cyan-400 absolute right-1 top-0.5">M</div>
        </div>
        
        {/* Delta */}
        <div className="flex justify-end">
          <span className={`text-sm font-bold ${deltaColor}`}>
            {delta < 0 ? "" : "+"}{formatDecimal(delta, 2)} {unit}
            {deltaPercent !== undefined && (
              <span className="ml-1">
                ({deltaPercent < 0 ? "" : "+"}{formatDecimal(deltaPercent, 1)}%)
              </span>
            )}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="panel">
        <h3 className="text-sm font-semibold text-white mb-3">
          This Launch Changed
        </h3>
        <div className="text-[10px] text-gray-400 mb-3">
          Launched {formatDecimal(lastLaunchMetrics.podsLaunched, 0)} pods
        </div>
      </div>
      
      <MetricBox
        title="Cost per Compute"
        before={delta.costPerTFLOP.before}
        after={delta.costPerTFLOP.after}
        delta={delta.costPerTFLOP.delta}
        deltaPercent={delta.costPerTFLOP.deltaPercent}
        unit="$/TFLOP-yr"
        isImprovement={delta.costPerTFLOP.delta < 0}
      />
      
      <MetricBox
        title="Annual OPEX"
        before={delta.annualOpex.before}
        after={delta.annualOpex.after}
        delta={delta.annualOpex.delta}
        deltaPercent={delta.annualOpex.deltaPercent}
        unit="$/yr"
        isImprovement={delta.annualOpex.delta < 0}
      />
      
      <MetricBox
        title="Latency"
        before={delta.latencyMs.before}
        after={delta.latencyMs.after}
        delta={delta.latencyMs.delta}
        unit="ms"
        isImprovement={delta.latencyMs.delta < 0}
      />
      
      <MetricBox
        title="Carbon"
        before={delta.carbonTonsPerYear.before}
        after={delta.carbonTonsPerYear.after}
        delta={delta.carbonTonsPerYear.delta}
        unit="t/yr"
        isImprovement={delta.carbonTonsPerYear.delta < 0}
      />
    </div>
  );
}

