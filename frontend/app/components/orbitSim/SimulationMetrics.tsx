"use client";

import React, { useMemo, useState, useEffect } from "react";
import { getDebugStateEntries, scenarioModeToKey } from "../../lib/orbitSim/debugState";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";
import { ExportAllChartsButton } from "./ChartExportButton";
import type { SLAConfig } from "../../lib/model/orbitalPhysics";

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
  
  // FIX: Calculate domain to ensure proper visual separation when values are far apart
  // When orbital and ground start 8x apart, we need to ensure the domain shows this clearly
  const allValues = [...validGround, ...validMix];
  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  
  // CRITICAL: When values are very different (e.g., 8x apart), we need to ensure
  // the domain doesn't compress them visually. Use absolute padding based on the
  // larger value, not just relative padding.
  const ratio = dataMax / Math.max(dataMin, 0.01);
  
  // For large ratios (values far apart), use absolute padding to ensure visual separation
  // For small ratios (values close), use relative padding
  let minDomain: number;
  let maxDomain: number;
  
  // CRITICAL FIX: When values are far apart, ensure proper visual separation
  // The issue is that absolute padding can compress small values to near-zero
  // Instead, use a minimum domain range to ensure both values are visible
  if (ratio > 3) {
    // Values are far apart: ensure minimum visual separation
    // Use a minimum range of 30% of max to ensure small values are visible
    const minRange = dataMax * 0.30; // Minimum range is 30% of max
    const actualRange = dataMax - dataMin;
    const useRange = Math.max(minRange, actualRange);
    
    // Center the domain around the data, but ensure min is not too compressed
    const center = (dataMin + dataMax) / 2;
    minDomain = Math.max(0, center - useRange / 2);
    maxDomain = center + useRange / 2;
    
    // Add 10% padding on both sides
    const padding = useRange * 0.10;
    minDomain = Math.max(0, minDomain - padding);
    maxDomain = maxDomain + padding;
  } else {
    // Values are close: use relative padding
    const dataRange = dataMax - dataMin;
    const paddingFactor = 0.2;
    minDomain = Math.max(0, dataMin - dataRange * paddingFactor);
    maxDomain = dataMax + dataRange * paddingFactor;
  }
  
  const effectiveRange = maxDomain - minDomain || 1;
  const min = minDomain;
  const max = maxDomain;
  const range = effectiveRange;
  
  // Convert data to SVG path using the calculated domain
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
  formatFn,
  chartId
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
  chartId?: string;
}) => {
  const savingsPositive = savings > 0;
  
  return (
    <div 
      data-chart={chartId}
      style={{
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

// Calculate GPU-hour pricing from PFLOP-year cost
const calculateGpuHourFromPflopYear = (
  costPerPflopYear: number,
  sla: SLAConfig = {
    availabilityTarget: 0.999,
    maxLatencyToGroundMs: 50,
    minBandwidthGbps: 10,
    maxRecoveryTimeMinutes: 15,
    creditPerViolationPct: 25
  }
): number => {
  if (costPerPflopYear == null || isNaN(costPerPflopYear) || costPerPflopYear <= 0) return 0;
  
  const pflopsPerGpu = 2.0;
  const utilizationTarget = 0.85;
  const operatorMarginPct = 0.20; // 20% margin
  const hoursPerYear = 8760;
  
  const costPerGpuYear = costPerPflopYear * pflopsPerGpu;
  const effectiveHours = hoursPerYear * utilizationTarget;
  const basePerHour = costPerGpuYear / effectiveHours;
  
  // Add SLA costs
  const nines = -Math.log10(1 - sla.availabilityTarget);
  const sparesRatio = 1 + 0.05 * nines;
  const violationProb = 1 - sla.availabilityTarget;
  const expectedCreditPerHour = violationProb * sla.creditPerViolationPct / 100;
  const slaRiskBuffer = basePerHour * expectedCreditPerHour * 2;
  
  const totalCostPerHour = basePerHour * sparesRatio + slaRiskBuffer;
  const margin = totalCostPerHour * operatorMarginPct;
  const pricePerGpuHour = totalCostPerHour + margin;
  
  return pricePerGpuHour;
};

const formatGpuHour = (v: number | null | undefined) => {
  if (v == null || isNaN(v) || v <= 0) return '$--/hr';
  return `$${v.toFixed(2)}/hr`;
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
  
  // Calculate GPU-hour pricing from PFLOP-year costs
  // Standard SLA: 99.9% availability, 15min recovery, 25% credit
  const standardSLA: SLAConfig = {
    availabilityTarget: 0.999,
    maxLatencyToGroundMs: 50,
    minBandwidthGbps: 10,
    maxRecoveryTimeMinutes: 15,
    creditPerViolationPct: 25
  };
  
  const costGround = years.map(y => {
    const entry = entries.find(e => e.year === y);
    const pflopYearCost = safeNum(entry?.physics_cost_per_pflop_year_ground);
    return calculateGpuHourFromPflopYear(pflopYearCost, standardSLA);
  });
  const costMix = years.map(y => {
    const entry = entries.find(e => e.year === y);
    // CRITICAL FIX: Use orbital cost for mix, not mix cost, to show orbital vs ground comparison
    // In early years, mix = ground (no orbital deployment), so use orbital cost directly
    const pflopYearCost = safeNum(entry?.physics_cost_per_pflop_year_orbit ?? entry?.physics_cost_per_pflop_year_mix);
    return calculateGpuHourFromPflopYear(pflopYearCost, standardSLA);
  });
  
  // Debug: Log first year values to console (temporary)
  if (costGround.length > 0 && costMix.length > 0 && typeof window !== 'undefined') {
    const firstYear = years[0];
    const firstGround = costGround[0];
    const firstMix = costMix[0];
    // Only log once per render to avoid spam
    if (!(window as any).__gpuHourDebugLogged) {
      console.log(`[GPU-HOUR DEBUG] Year ${firstYear}: Ground=$${firstGround.toFixed(2)}/hr, Mix/Orbit=$${firstMix.toFixed(2)}/hr, Ratio=${(firstMix / firstGround).toFixed(2)}x`);
      (window as any).__gpuHourDebugLogged = true;
      setTimeout(() => { (window as any).__gpuHourDebugLogged = false; }, 1000);
    }
  }
  
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
  
  // Safe current values - convert to GPU-hour pricing
  const currentCostGroundPflop = safeNum(currentEntry.physics_cost_per_pflop_year_ground);
  const currentCostMixPflop = safeNum(currentEntry.physics_cost_per_pflop_year_mix);
  const currentCostGround = calculateGpuHourFromPflopYear(currentCostGroundPflop, standardSLA);
  const currentCostMix = calculateGpuHourFromPflopYear(currentCostMixPflop, standardSLA);
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
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <ExportAllChartsButton />
        </div>
        <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '16px',
      }}>
        <MetricCard
          title="$/GPU-Hour (Standard SLA)"
          chartId="gpu-hour-pricing-spark"
          groundValue={formatGpuHour(currentCostGround)}
          mixValue={formatGpuHour(currentCostMix)}
          sparkGround={costGround}
          sparkMix={costMix}
          savings={costSavings}
          years={years}
          onHover={setTooltip}
          formatFn={formatGpuHour}
        />
        
        <MetricCard
          title="Latency"
            chartId="latency-spark"
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
            chartId="opex-spark"
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
            chartId="carbon-spark"
          groundValue={formatCarbon(currentCarbonGround)}
          mixValue={formatCarbon(currentCarbonMix)}
          sparkGround={carbonGround}
          sparkMix={carbonMix}
          savings={carbonSavings}
          years={years}
          onHover={setTooltip}
          formatFn={formatCarbon}
        />
        </div>
        
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
