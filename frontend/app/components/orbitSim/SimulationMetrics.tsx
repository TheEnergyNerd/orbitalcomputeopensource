"use client";

import React, { useMemo } from "react";
import { getDebugStateEntries, scenarioModeToKey } from "../../lib/orbitSim/debugState";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";

interface SimulationMetricsProps {
  timeline: YearStep[];
  scenarioMode?: string;
  currentYear?: number;
}

// Mini sparkline component - no axes, just the trend
const Sparkline = ({ 
  groundData, 
  mixData, 
  groundColor = '#ef4444', 
  mixColor = '#10b981' 
}: { 
  groundData: number[]; 
  mixData: number[]; 
  groundColor?: string; 
  mixColor?: string;
}) => {
  const height = 60;
  const width = 100; // Use percentage-based width
  const padding = 4;
  
  // Combine all values to get scale (allow zeros but filter null/NaN)
  const allValues = [...groundData, ...mixData].filter(v => v != null && !isNaN(v));
  if (allValues.length === 0) return <svg width="100%" height={height} style={{ display: 'block' }} />;
  
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  // Add padding only if there's actual range
  const range = max - min;
  const padding = range > 0 ? range * 0.1 : Math.max(1, max * 0.1); // 10% padding, or 10% of max if all values are the same
  const scaledMin = Math.max(0, min - padding); // Don't go below 0 for display
  const scaledMax = max + padding;
  const scaledRange = scaledMax - scaledMin || 1;
  
  // Convert data to SVG path using percentage-based coordinates
  const toPath = (data: number[]) => {
    if (data.length === 0) return '';
    const points = data.map((v, i) => {
      const xPercent = padding + (i / Math.max(1, data.length - 1)) * (100 - padding * 2);
      // Normalize value to scaled range
      const normalized = (v - scaledMin) / scaledRange;
      const yPercent = 100 - padding - normalized * (100 - padding * 2);
      return `${xPercent},${yPercent}`;
    });
    return `M ${points.join(' L ')}`;
  };

  // Debug: log data if empty or suspicious
  if (allValues.length === 0 || (mixData.length > 0 && mixData.every(v => v === 0))) {
    console.warn('[Sparkline] Empty or zero data:', { groundData, mixData, allValues });
  }

  return (
    <svg width="100%" height={height} style={{ display: 'block' }} viewBox="0 0 100 60" preserveAspectRatio="none">
      {/* Ground line - dashed */}
      {groundData.length > 0 && groundData.some(v => v != null && !isNaN(v)) && (
        <path
          d={toPath(groundData)}
          fill="none"
          stroke={groundColor}
          strokeWidth="1.5"
          strokeDasharray="3 2"
          strokeLinecap="round"
          strokeOpacity="0.8"
        />
      )}
      {/* Mix line - solid */}
      {mixData.length > 0 && mixData.some(v => v != null && !isNaN(v)) && (
        <path
          d={toPath(mixData)}
          fill="none"
          stroke={mixColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeOpacity="1"
        />
      )}
    </svg>
  );
};

// Single metric card
const MetricCard = ({ 
  title, 
  groundValue, 
  mixValue, 
  sparkGround, 
  sparkMix, 
  savings, 
  unit = '' 
}: { 
  title: string; 
  groundValue: string; 
  mixValue: string; 
  sparkGround: number[]; 
  sparkMix: number[]; 
  savings: number; 
  unit?: string;
}) => {
  const savingsPositive = savings > 0;
  
  return (
    <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/90 to-slate-800/80 p-5 w-full">
      {/* Title */}
      <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-4">
        {title}
      </div>
      
      {/* Sparkline */}
      <div className="mb-4">
        <Sparkline groundData={sparkGround} mixData={sparkMix} />
      </div>
      
      {/* Values row */}
      <div className="flex justify-between items-end gap-4">
        {/* Ground */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-4 h-0.5 bg-red-500 rounded" />
            <span className="text-slate-500 text-[11px]">Ground</span>
          </div>
          <div className="text-red-500 text-lg font-semibold">
            {groundValue}{unit}
          </div>
        </div>
        
        {/* Mix */}
        <div className="text-center">
          <div className="flex items-center gap-1.5 mb-1 justify-center">
            <div className="w-4 h-0.5 bg-green-500 rounded" />
            <span className="text-slate-500 text-[11px]">Mix</span>
          </div>
          <div className="text-green-500 text-lg font-semibold">
            {mixValue}{unit}
          </div>
        </div>
        
        {/* Savings */}
        <div className="text-right">
          <div className="text-slate-500 text-[11px] mb-1">
            Savings
          </div>
          <div className={`text-base font-semibold ${savingsPositive ? 'text-green-500' : 'text-red-500'}`}>
            {savingsPositive ? '↓' : '↑'} {Math.abs(savings).toFixed(0)}%
          </div>
        </div>
      </div>
    </div>
  );
};

// Format helpers
const formatCost = (v: number) => `$${v.toFixed(0)}`;
const formatLatency = (v: number) => `${v.toFixed(0)}`;
const formatOpex = (v: number) => `$${(v / 1e6).toFixed(0)}`;
const formatCarbon = (v: number) => {
  // v is in kg, convert to tons
  const tons = v / 1000;
  if (tons >= 1e12) return `${(tons / 1e12).toFixed(1)}T`;
  if (tons >= 1e9) return `${(tons / 1e9).toFixed(0)}B`;
  if (tons >= 1e6) return `${(tons / 1e6).toFixed(0)}M`;
  if (tons >= 1e3) return `${(tons / 1e3).toFixed(0)}k`;
  return `${tons.toFixed(0)}`;
};

/**
 * SimulationMetrics - Clean sparkline cards for key metrics
 * Replaces the old MetricsGrid with a simpler, more compact design
 */
export default function SimulationMetrics({ 
  timeline, 
  scenarioMode, 
  currentYear 
}: SimulationMetricsProps) {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = useMemo(() => {
    return getDebugStateEntries(scenarioKey).sort((a, b) => a.year - b.year);
  }, [scenarioKey]);

  // Extract time series for sparklines - ensure data is aligned by year
  const years = entries.map(e => e.year);
  
  const costGround = entries.map(e => e.cost_per_compute_ground ?? 0);
  const costMix = entries.map(e => e.cost_per_compute_mix ?? 0);
  
  // Latency from timeline (not in debug state) - align with entries by year
  const latencyGround = entries.map(e => {
    const timelineStep = timeline.find(s => s.year === e.year);
    return timelineStep?.latencyGroundMs ?? 120;
  });
  const latencyMix = entries.map(e => {
    const timelineStep = timeline.find(s => s.year === e.year);
    return timelineStep?.latencyMixMs ?? 120;
  });
  
  // OPEX: Use all-ground baseline for ground, mix for actual
  const opexGround = entries.map(e => {
    const val = e.annual_opex_ground_all_ground ?? e.annual_opex_ground ?? 0;
    return val;
  });
  const opexMix = entries.map(e => {
    const val = e.annual_opex_mix ?? 0;
    return val;
  });
  
  // Carbon: Ground should be "all ground" counterfactual, Mix should be actual
  const carbonGround = entries.map(e => {
    const val = e.annual_carbon_ground_all_ground ?? 0;
    return val;
  });
  const carbonMix = entries.map(e => {
    const val = e.annual_carbon_mix ?? 0;
    return val;
  });
  
  // Debug: Log OPEX and Carbon data to check if values are present
  React.useEffect(() => {
    if (entries.length > 0) {
      const lastEntry = entries[entries.length - 1];
      console.log('[SimulationMetrics] Data check:', {
        opexGround: lastEntry.annual_opex_ground_all_ground,
        opexMix: lastEntry.annual_opex_mix,
        carbonGround: lastEntry.annual_carbon_ground_all_ground,
        carbonMix: lastEntry.annual_carbon_mix,
        opexGroundArray: opexGround.slice(-5),
        opexMixArray: opexMix.slice(-5),
        carbonGroundArray: carbonGround.slice(-5),
        carbonMixArray: carbonMix.slice(-5),
      });
    }
  }, [entries, opexGround, opexMix, carbonGround, carbonMix]);
  
  // Get current values
  const currentEntry = entries.find(e => e.year === currentYear) || entries[entries.length - 1];
  const currentTimelineStep = timeline.find(s => s.year === currentYear) || timeline[timeline.length - 1];
  
  if (!currentEntry || !currentTimelineStep) {
    return null;
  }
  
  // Calculate savings percentages
  const costSavings = currentEntry.cost_per_compute_ground > 0
    ? ((currentEntry.cost_per_compute_ground - currentEntry.cost_per_compute_mix) / currentEntry.cost_per_compute_ground) * 100
    : 0;
  
  const latencySavings = currentTimelineStep.latencyGroundMs > 0
    ? ((currentTimelineStep.latencyGroundMs - currentTimelineStep.latencyMixMs) / currentTimelineStep.latencyGroundMs) * 100
    : 0;
  
  const opexSavings = currentEntry.annual_opex_ground_all_ground > 0
    ? ((currentEntry.annual_opex_ground_all_ground - currentEntry.annual_opex_mix) / currentEntry.annual_opex_ground_all_ground) * 100
    : 0;
  
  const carbonSavings = currentEntry.annual_carbon_ground_all_ground > 0
    ? ((currentEntry.annual_carbon_ground_all_ground - currentEntry.annual_carbon_mix) / currentEntry.annual_carbon_ground_all_ground) * 100
    : 0;

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
        <MetricCard
          title="Cost / Compute"
          groundValue={formatCost(currentEntry.cost_per_compute_ground ?? 0)}
          mixValue={formatCost(currentEntry.cost_per_compute_mix ?? 0)}
          sparkGround={costGround}
          sparkMix={costMix}
          savings={costSavings}
          unit="/PFLOP"
        />
        
        <MetricCard
          title="Latency"
          groundValue={formatLatency(currentTimelineStep.latencyGroundMs ?? 120)}
          mixValue={formatLatency(currentTimelineStep.latencyMixMs ?? 120)}
          sparkGround={latencyGround}
          sparkMix={latencyMix}
          savings={latencySavings}
          unit="ms"
        />
        
        <MetricCard
          title="Annual OPEX"
          groundValue={formatOpex(currentEntry.annual_opex_ground_all_ground ?? 0)}
          mixValue={formatOpex(currentEntry.annual_opex_mix ?? 0)}
          sparkGround={opexGround}
          sparkMix={opexMix}
          savings={opexSavings}
          unit="M"
        />
        
        <MetricCard
          title="Carbon"
          groundValue={formatCarbon(currentEntry.annual_carbon_ground_all_ground ?? 0)}
          mixValue={formatCarbon(currentEntry.annual_carbon_mix ?? 0)}
          sparkGround={carbonGround}
          sparkMix={carbonMix}
          savings={carbonSavings}
          unit=" tCO₂"
        />
      </div>
    </div>
  );
}

