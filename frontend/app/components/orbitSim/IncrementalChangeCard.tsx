"use client";

import { useSimpleModeStore } from "../../store/simpleModeStore";
import { formatDecimal } from "../../lib/utils/formatNumber";
import { useMemo, useRef, useEffect, useState } from "react";
import type { OrbitStats } from "../../lib/orbitSim/orbitStats";
import YearComputeChart from "./YearComputeChart";
import DeploymentTimelineChart from "./DeploymentTimelineChart";
import { useSimulationStore } from "../../store/simulationStore";

/**
 * Deployment Progress Card
 * Shows incremental impact of the last launch batch using canonical stats
 * Collapsible, 50% width, expandable
 */
export default function IncrementalChangeCard() {
  const [isExpanded, setIsExpanded] = useState(false);
  const { simulationHistory, metrics, yearSeries } = useSimpleModeStore();
  const { timeline } = useSimulationStore();
  const { history, lastDelta } = simulationHistory || { history: [], lastDelta: {} };

  // Get current and previous snapshots
  const after = lastDelta.after;
  const before = lastDelta.before;
  const hasLaunches = history.length > 1;

  if (!hasLaunches || !after || !metrics) {
    return (
      <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
        <div className="text-sm font-semibold text-gray-300 mb-2">Deployment Progress</div>
        <div className="text-xs text-gray-500 mb-2 italic">
          How the last launches changed the future trajectory of orbit vs a pure-ground world
        </div>
        <div className="text-xs text-gray-400">Launch some pods to see incremental impact</div>
      </div>
    );
  }

  // Calculate mission context
  const podsDeployed = after.podsTotal;
  const orbitShare = after.orbitSharePct;
  const groundStats = after.ground;
  const mixStats = after.mix;
  const beforeMixStats = before?.mix;

  // Calculate deltas correctly
  const costDeltaVsGround = mixStats.costPerCompute - groundStats.costPerCompute;
  const costDeltaVsLast = beforeMixStats ? mixStats.costPerCompute - beforeMixStats.costPerCompute : null;

  const opexDeltaVsGround = mixStats.annualOpex - groundStats.annualOpex;
  const opexDeltaVsLast = beforeMixStats ? mixStats.annualOpex - beforeMixStats.annualOpex : null;

  const latencyDeltaVsGround = mixStats.latencyMs - groundStats.latencyMs;
  const latencyDeltaVsLast = beforeMixStats ? mixStats.latencyMs - beforeMixStats.latencyMs : null;

  const carbonDeltaVsGround = mixStats.carbonTons - groundStats.carbonTons;
  const carbonDeltaVsLast = beforeMixStats ? mixStats.carbonTons - beforeMixStats.carbonTons : null;

  // Format helpers
  const formatCost = (v: number) => {
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}k`;
    return `$${v.toFixed(2)}`;
  };

  const formatOpex = (v: number) => {
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
    return `$${v.toFixed(0)}`;
  };

  const formatCarbon = (v: number) => {
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
    return `${v.toFixed(0)}`;
  };

  // Mission context message
  const getMissionMessage = () => {
    const improvements = [];
    if (opexDeltaVsGround < 0) improvements.push('cheaper OPEX');
    if (latencyDeltaVsGround < 0) improvements.push('lower latency');
    if (carbonDeltaVsGround < 0) improvements.push('less carbon');
    
    if (improvements.length === 0) {
      return `Your last launches deployed ${podsDeployed} pods (${formatDecimal(orbitShare, 1)}% orbit share).`;
    }
    
    return `Your last launches changed orbital economics by ${improvements.join(', ')}.`;
  };

  // Sparkline component with fixed Y-axis scaling
  const SparklineMetric = ({
    label,
    getValue,
    formatValue,
    formatDelta,
    isLowerBetter = true,
    deltaVsGround,
    deltaVsLast,
  }: {
    label: string;
    getValue: (stats: OrbitStats) => number;
    formatValue: (v: number) => string;
    formatDelta: (d: number) => string;
    isLowerBetter?: boolean;
    deltaVsGround: number;
    deltaVsLast: number | null;
  }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const width = 300; // Wider canvas
    const height = 60; // Taller canvas

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || history.length < 2) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Get values
      const groundValue = getValue(groundStats); // Constant ground baseline
      const mixValues = history.map(h => getValue(h.mix));

      // CRITICAL FIX: Lock Y-axis to full domain (ground to max mix)
      const minValue = Math.min(groundValue, ...mixValues);
      const maxValue = Math.max(groundValue, ...mixValues);
      
      // Add padding to prevent lines from touching edges
      const padding = (maxValue - minValue) * 0.1 || 1;
      const range = (maxValue - minValue) + (padding * 2) || 1;
      const yMin = minValue - padding;

      // Draw grid lines
      ctx.strokeStyle = '#374151'; // gray-700
      ctx.lineWidth = 0.5;
      const gridLines = 3;
      for (let i = 0; i <= gridLines; i++) {
        const y = (height / gridLines) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw ground line (red, constant) - FIXED: uses full domain
      ctx.strokeStyle = '#ef4444'; // red-500
      ctx.lineWidth = 2;
      ctx.beginPath();
      const groundY = height - ((groundValue - yMin) / range) * height;
      ctx.moveTo(0, groundY);
      ctx.lineTo(width, groundY);
      ctx.stroke();

      // Draw mix line (green, over history)
      const filteredHistory = history.filter((snapshot, idx) => {
        if (idx === 0) return true;
        const prevValue = getValue(history[idx - 1].mix);
        const currValue = getValue(snapshot.mix);
        return Math.abs(currValue - prevValue) > (Math.abs(prevValue) * 0.001);
      });
      
      ctx.strokeStyle = '#10b981'; // green-500
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const pointCount = filteredHistory.length;
      filteredHistory.forEach((snapshot, idx) => {
        const value = getValue(snapshot.mix);
        const normalized = (value - yMin) / range;
        const x = pointCount > 1 ? (width / (pointCount - 1)) * idx : width / 2;
        const y = height - (normalized * height);

        if (idx === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw points for mix line
      ctx.fillStyle = '#10b981';
      filteredHistory.forEach((snapshot, idx) => {
        const value = getValue(snapshot.mix);
        const normalized = (value - yMin) / range;
        const x = pointCount > 1 ? (width / (pointCount - 1)) * idx : width / 2;
        const y = height - (normalized * height);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }, [history, groundStats]);

    const isBetterVsGround = isLowerBetter ? deltaVsGround < 0 : deltaVsGround > 0;
    const isBetterVsLast = deltaVsLast !== null
      ? (isLowerBetter ? deltaVsLast < 0 : deltaVsLast > 0)
      : null;

    return (
      <div className="flex flex-col bg-gray-900/30 rounded p-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-gray-300">{label}</span>
          <div className="flex gap-4 text-xs">
            <span className="text-red-400">Ground: {formatValue(getValue(groundStats))}</span>
            <span className="text-green-400">Mix: {formatValue(getValue(mixStats))}</span>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full h-16 mb-3"
        />
        <div className="grid grid-cols-2 gap-3">
          <div className={`text-xs ${
            isBetterVsGround ? 'text-green-400' : 'text-red-400'
          }`}>
            <div className="font-semibold mb-1">Δ vs Ground:</div>
            <div>{deltaVsGround >= 0 ? '+' : ''}{formatDelta(deltaVsGround)} {isBetterVsGround ? '(↓ better)' : '(↑ worse)'}</div>
          </div>
          {deltaVsLast !== null && (
            <div className={`text-xs ${
              isBetterVsLast ? 'text-green-400' : 'text-red-400'
            }`}>
              <div className="font-semibold mb-1">Δ vs Last Launch:</div>
              <div>{deltaVsLast >= 0 ? '+' : ''}{formatDelta(deltaVsLast)} {isBetterVsLast ? '(↓ better)' : '(↑ worse)'}</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-lg p-4" style={{ width: '50%', minWidth: '400px' }}>
      {/* Header with expand/collapse */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1">
          <div className="text-sm font-semibold text-cyan-400 mb-1">
            {getMissionMessage()}
          </div>
          <div className="text-xs text-gray-500 italic">
            {podsDeployed} pods deployed • {formatDecimal(orbitShare, 1)}% orbit share
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="ml-4 px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition"
        >
          {isExpanded ? '−' : '+'}
        </button>
      </div>

      {!isExpanded && (
        <div className="text-xs text-gray-400">
          Click + to see detailed metrics and charts
        </div>
      )}

      {isExpanded && (
        <>
          {/* WIDE LAYOUT: 2 columns for metrics */}
          <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Left Column */}
        <div className="space-y-4">
          <SparklineMetric
            label="Cost/Compute"
            getValue={(s) => s.costPerCompute}
            formatValue={(v) => formatCost(v)}
            formatDelta={(d) => formatCost(Math.abs(d))}
            isLowerBetter={true}
            deltaVsGround={costDeltaVsGround}
            deltaVsLast={costDeltaVsLast}
          />
          <SparklineMetric
            label="OPEX"
            getValue={(s) => s.annualOpex}
            formatValue={(v) => formatOpex(v)}
            formatDelta={(d) => formatOpex(Math.abs(d))}
            isLowerBetter={true}
            deltaVsGround={opexDeltaVsGround}
            deltaVsLast={opexDeltaVsLast}
          />
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          <SparklineMetric
            label="Latency"
            getValue={(s) => s.latencyMs}
            formatValue={(v) => `${v.toFixed(1)} ms`}
            formatDelta={(d) => `${Math.abs(d).toFixed(1)} ms`}
            isLowerBetter={true}
            deltaVsGround={latencyDeltaVsGround}
            deltaVsLast={latencyDeltaVsLast}
          />
          <SparklineMetric
            label="Carbon"
            getValue={(s) => s.carbonTons}
            formatValue={(v) => `${formatCarbon(v)} tCO₂`}
            formatDelta={(d) => `${formatCarbon(Math.abs(d))} tCO₂`}
            isLowerBetter={true}
            deltaVsGround={carbonDeltaVsGround}
            deltaVsLast={carbonDeltaVsLast}
          />
        </div>
      </div>

              {/* Deployment Timeline Section - Full width below */}
              {timeline && timeline.length > 0 && (
                <div className="pt-3 border-t border-gray-700">
                  <div className="text-xs font-semibold text-gray-300 mb-2">Deployment Horizon</div>
                  <div className="text-[10px] text-gray-500 mb-2 italic">
                    Horizon: {timeline[0].year}–{timeline[timeline.length - 1].year} ({timeline.length} deployments, 1/year)
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-1">
                      <DeploymentTimelineChart timeline={timeline} />
                    </div>
                    <div className="flex-1 flex flex-col justify-center space-y-1 text-xs text-gray-400">
                      {(() => {
                        const lastStep = timeline[timeline.length - 1];
                        const totalCompute = lastStep.orbitalComputeTwh + lastStep.netGroundComputeTwh;
                        const orbitSharePercent = totalCompute > 0
                          ? (lastStep.orbitalComputeTwh / totalCompute) * 100
                          : 0;

                        return (
                          <>
                            <div>
                              Year {lastStep.year}: Orbit share{" "}
                              <span className="text-white font-semibold">{orbitSharePercent.toFixed(1)}%</span>
                            </div>
                            <div>
                              Orbital: <span className="text-green-400 font-semibold">{formatDecimal(lastStep.orbitalComputeTwh, 0)} TWh/yr</span>
                            </div>
                            <div>
                              Ground: <span className="text-red-400 font-semibold">{formatDecimal(lastStep.netGroundComputeTwh, 0)} TWh/yr</span>
                            </div>
                            <div>
                              Deployments: <span className="text-white font-semibold">{lastStep.deploymentsCompleted}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
        </>
      )}
    </div>
  );
}
