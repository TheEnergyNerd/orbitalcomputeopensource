"use client";

import React, { useMemo, useState, useEffect } from "react";
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
  mixColor = '#10b981',
  years,
  onHover,
  formatFn
}: { 
  groundData: number[]; 
  mixData: number[]; 
  groundColor?: string; 
  mixColor?: string;
  years?: number[];
  onHover?: (hoverState: { year: number; groundValue: number; mixValue: number; x: number; y: number; formatFn?: (v: number) => string } | null) => void;
  formatFn?: (v: number) => string;
}) => {
  const height = 80;  // Taller for better visibility
  const width = 280;
  const padding = 8;
  const [hoverState, setHoverState] = useState<{ index: number; x: number; y: number } | null>(null);
  
  // Filter valid values
  const validGround = groundData.filter(v => v != null && !isNaN(v) && isFinite(v));
  const validMix = mixData.filter(v => v != null && !isNaN(v) && isFinite(v));
  
  // If no valid data, show placeholder
  if (validGround.length === 0 && validMix.length === 0) {
    return (
      <svg width={width} height={height} style={{ display: 'block' }}>
        <text x={width/2} y={height/2} textAnchor="middle" fill="#64748b" fontSize="12">No data</text>
      </svg>
    );
  }
  
  // Calculate scale from all values
  const allValues = [...validGround, ...validMix];
  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  
  // Add padding to range so lines don't touch edges
  // Also ensure minimum range so close values are still visible
  const dataRange = dataMax - dataMin;
  const minRange = dataMax * 0.2; // At least 20% of max value as range
  const effectiveRange = Math.max(dataRange, minRange);
  const rangePadding = effectiveRange * 0.15;
  
  const min = dataMin - rangePadding;
  const max = dataMax + rangePadding;
  const range = max - min || 1;
  
  // Convert data to SVG path
  const toPath = (data: number[]) => {
    if (data.length === 0) return '';
    const filtered = data.filter(v => v != null && !isNaN(v) && isFinite(v));
    if (filtered.length === 0) return '';
    
    const points = filtered.map((v, i) => {
      const x = padding + (i / Math.max(1, filtered.length - 1)) * (width - padding * 2);
      const y = height - padding - ((v - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${points.join(' L ')}`;
  };

  const groundPath = toPath(groundData);
  const mixPath = toPath(mixData);

  // Handle mouse move
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Convert x to data index
    const plotWidth = width - padding * 2;
    const relativeX = x - padding;
    const index = Math.round((relativeX / plotWidth) * (groundData.length - 1));
    const clampedIndex = Math.max(0, Math.min(groundData.length - 1, index));
    
    if (clampedIndex >= 0 && clampedIndex < groundData.length) {
      const groundValue = groundData[clampedIndex];
      const mixValue = mixData[clampedIndex];
      const year = years?.[clampedIndex] ?? clampedIndex + 2025;
      
      setHoverState({ index: clampedIndex, x: e.clientX, y: e.clientY });
      
      if (onHover && !isNaN(groundValue) && !isNaN(mixValue)) {
        onHover({
          year,
          groundValue,
          mixValue,
          x: e.clientX,
          y: e.clientY,
          formatFn
        });
      }
    }
  };

  const handleMouseLeave = () => {
    setHoverState(null);
    if (onHover) {
      onHover(null);
    }
  };

  // Calculate hover position for visual indicator
  const hoverX = hoverState ? padding + (hoverState.index / Math.max(1, groundData.length - 1)) * (width - padding * 2) : null;
  const hoverGroundValue = hoverState !== null ? groundData[hoverState.index] : null;
  const hoverMixValue = hoverState !== null ? mixData[hoverState.index] : null;

  return (
    <svg 
      width={width} 
      height={height} 
      style={{ display: 'block', cursor: 'crosshair' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Ground line - dashed red, brighter and thicker for visibility */}
      {groundPath && (
        <path
          d={groundPath}
          fill="none"
          stroke="#ff7070"
          strokeWidth="2.5"
          strokeDasharray="12 6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.95"
        />
      )}
      {/* Mix line - solid green (drawn on top) */}
      {mixPath && (
        <path
          d={mixPath}
          fill="none"
          stroke={mixColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      
      {/* Hover indicator - vertical line and dots */}
      {hoverX !== null && hoverGroundValue !== null && hoverMixValue !== null && 
       !isNaN(hoverGroundValue) && !isNaN(hoverMixValue) && isFinite(hoverGroundValue) && isFinite(hoverMixValue) && (
        <>
          {/* Vertical line */}
          <line
            x1={hoverX}
            y1={padding}
            x2={hoverX}
            y2={height - padding}
            stroke="rgba(255, 255, 255, 0.3)"
            strokeWidth="1"
            strokeDasharray="4,4"
          />
          
          {/* Ground dot */}
          <circle
            cx={hoverX}
            cy={height - padding - ((hoverGroundValue - min) / range) * (height - padding * 2)}
            r="4"
            fill="#ff7070"
            stroke="#fff"
            strokeWidth="1.5"
          />
          
          {/* Mix dot */}
          <circle
            cx={hoverX}
            cy={height - padding - ((hoverMixValue - min) / range) * (height - padding * 2)}
            r="4"
            fill={mixColor}
            stroke="#fff"
            strokeWidth="1.5"
          />
        </>
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
  unit = '',
  tooltip,
  years,
  onHover,
  formatFn
}: {
  title: string;
  groundValue: string; 
  mixValue: string; 
  sparkGround: number[]; 
  sparkMix: number[]; 
  savings: number; 
  unit?: string;
  tooltip?: string;
  years?: number[];
  onHover?: (hoverState: { year: number; groundValue: number; mixValue: number; x: number; y: number; formatFn?: (v: number) => string } | null) => void;
  formatFn?: (v: number) => string;
}) => {
  const savingsPositive = savings > 0;
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.8))',
      border: '1px solid rgba(0, 240, 255, 0.2)',
      borderRadius: '12px',
      padding: '20px',
      minWidth: '320px',
    }}>
      {/* Title */}
      <div style={{
        color: '#94a3b8',
        fontSize: '13px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}>
        <span>{title}</span>
        {tooltip && (
          <span 
            title={tooltip}
            style={{
              color: '#64748b',
              fontSize: '10px',
              cursor: 'help',
              opacity: 0.7,
            }}
          >
            ⓘ
          </span>
        )}
      </div>
      
      {/* Sparkline */}
      <div style={{ marginBottom: '16px' }}>
        <Sparkline 
          groundData={sparkGround} 
          mixData={sparkMix}
          years={years}
          formatFn={formatFn}
          onHover={onHover}
        />
      </div>
      
      {/* Values row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: '16px',
      }}>
        {/* Ground */}
        <div>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px',
            marginBottom: '4px',
          }}>
            <div style={{
              width: '20px',
              height: '2px',
              background: '#ef4444',
              borderRadius: '1px',
              opacity: 0.8,
            }} />
            <span style={{ color: '#64748b', fontSize: '11px' }}>Ground</span>
          </div>
          <div style={{ color: '#ef4444', fontSize: '20px', fontWeight: 600, fontFamily: 'monospace' }}>
            {groundValue}
          </div>
        </div>
        
        {/* Mix */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px',
            marginBottom: '4px',
            justifyContent: 'center',
          }}>
            <div style={{
              width: '20px',
              height: '3px',
              background: '#10b981',
              borderRadius: '1px',
            }} />
            <span style={{ color: '#64748b', fontSize: '11px' }}>Mix</span>
          </div>
          <div style={{ color: '#10b981', fontSize: '20px', fontWeight: 600, fontFamily: 'monospace' }}>
            {mixValue}
          </div>
        </div>
        
        {/* Savings */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '4px' }}>
            Savings
          </div>
          <div style={{ 
            color: savingsPositive ? '#10b981' : '#ef4444', 
            fontSize: '18px', 
            fontWeight: 600,
            fontFamily: 'monospace',
          }}>
            {savingsPositive ? '↓' : '↑'} {Math.abs(savings).toFixed(0)}%
          </div>
        </div>
      </div>
    </div>
  );
};

// Format helpers
const formatCost = (v: number | null | undefined) => {
  if (v == null || isNaN(v)) return '$--';
  return `$${v.toFixed(0)}/PFLOP`;
};

const formatComputePerDollar = (costPerPFLOP: number | null | undefined) => {
  if (costPerPFLOP == null || isNaN(costPerPFLOP) || costPerPFLOP <= 0) return '--';
  const computePerBillion = 1e9 / costPerPFLOP;
  if (computePerBillion >= 1e6) {
    return `${(computePerBillion / 1e6).toFixed(1)}M PFLOPs/$1B`;
  } else if (computePerBillion >= 1e3) {
    return `${(computePerBillion / 1e3).toFixed(0)}K PFLOPs/$1B`;
  }
  return `${computePerBillion.toFixed(0)} PFLOPs/$1B`;
};

const formatLatency = (v: number | null | undefined) => {
  if (v == null || isNaN(v)) return '--ms';
  return `${v.toFixed(0)}ms`;
};

const formatOpex = (v: number | null | undefined) => {
  if (v == null || isNaN(v)) return '$--';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
};

const formatCarbon = (v: number | null | undefined) => {
  if (v == null || isNaN(v)) return '--';
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}T tCO₂`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B tCO₂`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M tCO₂`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k tCO₂`;
  return `${v.toFixed(0)} tCO₂`;
};

// Safe number helper
const safeNum = (v: number | null | undefined, fallback = 0) => {
  if (v == null || isNaN(v) || !isFinite(v)) return fallback;
  return v;
};

// Main component
export default function SimulationMetrics({ 
  timeline, 
  scenarioMode, 
  currentYear 
}: SimulationMetricsProps) {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const [sandboxParams, setSandboxParams] = useState<unknown>(null);
  const [tooltip, setTooltip] = useState<{ 
    year: number; 
    groundValue: number; 
    mixValue: number; 
    x: number; 
    y: number;
    formatFn?: (v: number) => string;
  } | null>(null);
  
  useEffect(() => {
    const checkSandbox = () => {
      if (typeof window !== 'undefined') {
        setSandboxParams((window as { __physicsSandboxParams?: unknown }).__physicsSandboxParams || null);
      }
    };
    checkSandbox();
    const interval = setInterval(checkSandbox, 100);
    window.addEventListener('physics-sandbox-applied', checkSandbox);
    return () => {
      clearInterval(interval);
      window.removeEventListener('physics-sandbox-applied', checkSandbox);
    };
  }, []);
  
  // Force re-render when timeline changes by using timeline length as a dependency
  const timelineLength = timeline.length;
  const lastTimelineYear = timeline.length > 0 ? timeline[timeline.length - 1]?.year : null;
  
  const entries = useMemo(() => {
    return getDebugStateEntries(scenarioKey).sort((a, b) => a.year - b.year);
  }, [scenarioKey, sandboxParams, timelineLength, lastTimelineYear, currentYear]);

  // Extract time series for sparklines
  const years = entries.map(e => e.year);
  
  const costGround = years.map(y => {
    const entry = entries.find(e => e.year === y);
    return safeNum(entry?.cost_per_compute_ground);
  });
  const costMix = years.map(y => {
    const entry = entries.find(e => e.year === y);
    return safeNum(entry?.cost_per_compute_mix);
  });
  
  const latencyGround = years.map(y => {
    const entry = entries.find(e => e.year === y);
    const timelineStep = timeline.find(s => s.year === y);
    return safeNum(timelineStep?.latencyGroundMs ?? entry?.latency_ground_ms);
  });
  const latencyMix = years.map(y => {
    const entry = entries.find(e => e.year === y);
    const timelineStep = timeline.find(s => s.year === y);
    return safeNum(timelineStep?.latencyMixMs ?? entry?.latency_mix_ms);
  });
  
  const opexGround = years.map(y => {
    const entry = entries.find(e => e.year === y);
    return safeNum(entry?.annual_opex_ground_all_ground ?? entry?.annual_opex_ground);
  });
  const opexMix = years.map(y => {
    const entry = entries.find(e => e.year === y);
    return safeNum(entry?.annual_opex_mix);
  });
  
  // Carbon: Ground should be "all ground" counterfactual, Mix should be actual
  const carbonGround = years.map(y => {
    const entry = entries.find(e => e.year === y);
    return safeNum(entry?.annual_carbon_ground_all_ground);
  });
  const carbonMix = years.map(y => {
    const entry = entries.find(e => e.year === y);
    return safeNum(entry?.annual_carbon_mix);
  });
  
  // Current values (use last year if currentYear not found)
  const currentEntry = currentYear 
    ? entries.find(e => e.year === currentYear) || entries[entries.length - 1]
    : entries[entries.length - 1];
  
  if (!currentEntry) {
    return (
      <div style={{ color: '#64748b', padding: '20px' }}>No data available</div>
    );
  }
  
  // Safe current values
  const currentCostGround = safeNum(currentEntry.cost_per_compute_ground);
  const currentCostMix = safeNum(currentEntry.cost_per_compute_mix);
  const currentLatencyGround = safeNum(timeline.find(s => s.year === currentEntry.year)?.latencyGroundMs ?? currentEntry.latency_ground_ms);
  const currentLatencyMix = safeNum(timeline.find(s => s.year === currentEntry.year)?.latencyMixMs ?? currentEntry.latency_mix_ms);
  const currentOpexGround = safeNum(currentEntry.annual_opex_ground_all_ground ?? currentEntry.annual_opex_ground);
  const currentOpexMix = safeNum(currentEntry.annual_opex_mix);
  const currentCarbonGround = safeNum(currentEntry.annual_carbon_ground_all_ground);
  const currentCarbonMix = safeNum(currentEntry.annual_carbon_mix);
  
  // Calculate savings percentages (avoid division by zero)
  const costSavings = currentCostGround > 0 
    ? ((currentCostGround - currentCostMix) / currentCostGround) * 100 
    : 0;
  const latencySavings = currentLatencyGround > 0 
    ? ((currentLatencyGround - currentLatencyMix) / currentLatencyGround) * 100 
    : 0;
  const opexSavings = currentOpexGround > 0 
    ? ((currentOpexGround - currentOpexMix) / currentOpexGround) * 100 
    : 0;
  const carbonSavings = currentCarbonGround > 0 
    ? ((currentCarbonGround - currentCarbonMix) / currentCarbonGround) * 100 
    : 0;

  return (
    <div 
      data-tutorial-metrics-panel
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '16px',
      }}>
        <MetricCard
          title="Compute Per Dollar"
          groundValue={formatComputePerDollar(currentCostGround)}
          mixValue={formatComputePerDollar(currentCostMix)}
          sparkGround={costGround.map(c => c > 0 ? 1e9 / c : 0)}
          sparkMix={costMix.map(c => c > 0 ? 1e9 / c : 0)}
          savings={costSavings}
          years={years}
          onHover={setTooltip}
          formatFn={(v) => formatComputePerDollar(1e9 / (v > 0 ? v : 1))}
        />
        
        <MetricCard
          title="Latency"
          groundValue={formatLatency(currentLatencyGround)}
          mixValue={formatLatency(currentLatencyMix)}
          sparkGround={latencyGround}
          sparkMix={latencyMix}
          savings={latencySavings}
          years={years}
          onHover={setTooltip}
          formatFn={formatLatency}
        />
        
        <MetricCard
          title="Annual OPEX"
          groundValue={formatOpex(currentOpexGround)}
          mixValue={formatOpex(currentOpexMix)}
          sparkGround={opexGround}
          sparkMix={opexMix}
          savings={opexSavings}
          tooltip="Includes deployment and replacement costs (CAPEX + OPEX)"
          years={years}
          onHover={setTooltip}
          formatFn={formatOpex}
        />
        
        <MetricCard
          title="Carbon"
          groundValue={formatCarbon(currentCarbonGround)}
          mixValue={formatCarbon(currentCarbonMix)}
          sparkGround={carbonGround}
          sparkMix={carbonMix}
          savings={carbonSavings}
          years={years}
          onHover={setTooltip}
          formatFn={formatCarbon}
        />
        
        {/* Tooltip */}
        {tooltip && tooltip.formatFn && (
          <div
            style={{
              position: 'fixed',
              left: tooltip.x + 10,
              top: tooltip.y - 50,
              zIndex: 1000,
              padding: '8px 12px',
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(100, 116, 139, 0.3)',
              borderRadius: '6px',
              fontSize: '12px',
              pointerEvents: 'none',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '4px' }}>
              {tooltip.year}
            </div>
            <div style={{ color: '#ff7070', marginBottom: '2px' }}>
              Ground: {tooltip.formatFn(tooltip.groundValue)}
            </div>
            <div style={{ color: '#10b981' }}>
              Mix: {tooltip.formatFn(tooltip.mixValue)}
            </div>
          </div>
        )}
    </div>
  );
}
