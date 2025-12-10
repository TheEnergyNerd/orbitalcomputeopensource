"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import KpiCard from "./KpiCard";
import DeploymentTimelineChart from "./DeploymentTimelineChart";
import DualClassStackChart from "./DualClassStackChart";
import PowerComputeScatter from "./PowerComputeScatter";
import StrategyPhaseDiagram from "./StrategyPhaseDiagram";
import GlobalKPIStrip from "./GlobalKPIStrip";
import OrbitLayer from "./OrbitLayer";
import AiRouterPanelV2 from "./AiRouterPanelV2";
import ConstellationEditorV2 from "./ConstellationEditorV2";
import YearCounter from "../YearCounter";
import MobileMenu from "../MobileMenu";
import type { SurfaceType } from "../SurfaceTabs";
import type { ComputeStrategy, LaunchStrategy } from "../../lib/orbitSim/simulationConfig";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";
import type { StrategyMode } from "../../lib/orbitSim/satelliteClasses";
import { formatDecimal } from "../../lib/utils/formatNumber";

// Simple cn utility for className merging
function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Map ComputeStrategy to StrategyMode
 */
function mapComputeStrategyToStrategyMode(strategy: ComputeStrategy): StrategyMode {
  switch (strategy) {
    case "edge_heavy": return "LATENCY";
    case "bulk_heavy": return "COST";
    case "green_heavy": return "CARBON";
    case "balanced": 
    default: return "BALANCED";
  }
}

/**
 * Build strategy map from timeline
 */
function getStrategyByYear(timeline: YearStep[]): Map<number, StrategyMode> {
  const strategyMap = new Map<number, StrategyMode>();
  timeline.forEach(step => {
    // Try to infer from yearPlan if available, otherwise default to BALANCED
    strategyMap.set(step.year, "BALANCED");
  });
  return strategyMap;
}

/**
 * Top Row - Strategy card (left) + Utilization + Deploy buttons (right)
 */
function TopRow({
  currentYear,
  currentPlan,
  onUpdatePlan,
}: {
  currentYear: number;
  currentPlan: { deploymentIntensity: number; computeStrategy: ComputeStrategy; launchStrategy: LaunchStrategy };
  onUpdatePlan: (patch: Partial<{ deploymentIntensity: number; computeStrategy: ComputeStrategy; launchStrategy: LaunchStrategy }>) => void;
}) {
  const computeOptions: { id: ComputeStrategy; label: string; desc: string }[] = [
    { id: "edge_heavy", label: "Latency-first", desc: "Edge-heavy pods; fastest, priciest" },
    { id: "bulk_heavy", label: "Cost-first", desc: "Bulk pods; cheapest, high latency" },
    { id: "green_heavy", label: "Carbon-first", desc: "Green pods; lowest tCO₂" },
    { id: "balanced", label: "Balanced", desc: "Mix of all three" },
  ];

  const launchOptions: { id: LaunchStrategy; label: string; desc: string }[] = [
    { id: "heavy", label: "Heavy lift", desc: "Max payload, highest carbon" },
    { id: "medium", label: "Reusable", desc: "Balanced reusable workhorse" },
    { id: "light", label: "Light & cheap", desc: "Small launches, flexible" },
  ];

  return (
    <div className="flex flex-col lg:flex-row items-stretch lg:items-start justify-between gap-4 lg:gap-6">
      {/* Left: strategy card */}
      <div className="w-full sm:w-[440px] md:w-[500px] lg:w-[560px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-800 bg-slate-950/80 px-3 sm:px-4 py-3" data-tutorial-strategy-card>
        <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">
          Strategy for {currentYear}
        </div>

        <div className="text-xs text-slate-400 mb-1">Compute strategy</div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {computeOptions.map(opt => (
            <button
              key={opt.id}
              onClick={() => onUpdatePlan({ computeStrategy: opt.id })}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-xs transition-all",
                currentPlan.computeStrategy === opt.id
                  ? "border-emerald-400 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-900/60"
              )}
            >
              <div className="font-medium text-slate-100">{opt.label}</div>
              <div className="text-[10px] text-slate-400">{opt.desc}</div>
            </button>
          ))}
        </div>

        <div className="h-px bg-slate-800 my-2" />

        <div className="text-xs text-slate-400 mb-1">Launch strategy</div>
        <div className="flex flex-wrap gap-2">
          {launchOptions.map(opt => (
            <button
              key={opt.id}
              onClick={() => onUpdatePlan({ launchStrategy: opt.id })}
              className={cn(
                "flex-1 rounded-xl border px-3 py-2 text-left text-xs transition-all",
                currentPlan.launchStrategy === opt.id
                  ? "border-emerald-400 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-900/60"
              )}
            >
              <div className="font-medium text-slate-100">{opt.label}</div>
              <div className="text-[10px] text-slate-400">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: buttons moved to YearCounter component */}
      <div className="flex-1" />
    </div>
  );
}

/**
 * Metrics Grid - 2x2 KPI cards (left) + tall Compute over time chart (right)
 */
function MetricsGrid({ timeline }: { timeline: YearStep[] }) {
  const forecastBands = useSimulationStore((s) => s.forecastBands);
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)] gap-3 sm:gap-4">
      {/* Left: 4 small cards in 2x2 grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 auto-rows-[180px] sm:auto-rows-[210px]">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 py-2">
          <KpiCard
            title="Cost / Compute"
            timeline={timeline}
            groundKey="costPerComputeGround"
            mixKey="costPerComputeMix"
            unitsFormatter={(v) => `$${v.toFixed(0)}`}
            isLowerBetter={true}
            forecastBands={forecastBands || undefined}
            forecastKey="costPerCompute"
          />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 py-2">
          <KpiCard
            title="Latency"
            timeline={timeline}
            groundKey="latencyGroundMs"
            mixKey="latencyMixMs"
            unitsFormatter={(v) => `${v.toFixed(1)} ms`}
            isLowerBetter={true}
            forecastBands={forecastBands || undefined}
            forecastKey="latency"
          />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 py-2">
              <KpiCard
                title="Annual OPEX"
                timeline={timeline}
                groundKey="opexGround"
                mixKey="opexMix"
                unitsFormatter={(v) => `$${(v / 1_000_000).toFixed(0)}M`}
                isLowerBetter={true}
                showBothCurves={true}
                savingsKey="opexSavings"
              />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 py-2">
              <KpiCard
                title="Carbon"
                timeline={timeline}
                groundKey="carbonGround"
                mixKey="carbonMix"
                unitsFormatter={(v) => `${(v / 1000).toFixed(0)}k tCO₂`}
                isLowerBetter={true}
                showBothCurves={true}
                savingsKey="carbonSavings"
                forecastBands={forecastBands || undefined}
                forecastKey="carbon"
              />
        </div>
      </div>

      {/* Right: tall horizon card */}
      <div className="h-full min-h-[300px] sm:min-h-[360px] rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3">
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Compute over time (Class A + Class B)
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Stacked area: Class A (teal, bottom) + Class B (cyan, top)
        </div>
        <div className="h-[250px] sm:h-[300px] md:h-[360px]">
          <DualClassStackChart timeline={timeline} strategyByYear={getStrategyByYear(timeline)} />
        </div>
      </div>
    </div>
  );
}

/**
 * Deployment Progress Card - Bottom banner
 */
function DeploymentProgressCard({ timeline }: { timeline: YearStep[] }) {
  if (!timeline || timeline.length === 0) return null;

  const last = timeline[timeline.length - 1];
  const opexSavings = last.opexSavings || 0;
  const carbonSavings = last.carbonSavings || 0;

  const formatMillions = (v: number) => (v / 1_000_000).toFixed(1);
  const formatThousands = (v: number) => (v / 1000).toFixed(0);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3">
      <div className="text-xs font-semibold text-slate-100 mb-1">
        Deployment Progress
      </div>
      <div className="text-[11px] text-slate-500 mb-2">
        How the last launches changed orbit vs a pure-ground world.
      </div>
      <div className="mt-2 text-[11px] text-slate-300 flex flex-wrap gap-4">
        <span>Year: {last.year}</span>
        <span>Orbital share: {(last.orbitalShare * 100).toFixed(0)}%</span>
        <span>Cost savings vs all-ground: ${formatMillions(opexSavings)}M/yr</span>
        <span>tCO₂ avoided: {formatThousands(carbonSavings)}k tCO₂/yr</span>
      </div>
    </div>
  );
}

/**
 * Simple Mode View - Clean Overview panel
 * Shows per-year decision controls: intensity, compute strategy, launch strategy
 */
export default function SimpleModeView() {
  const {
    config,
    yearPlans,
    timeline,
    selectedYearIndex,
    yearTransition,
    deployNextYear,
    extendYears,
    updateCurrentPlan,
    setForecastBands,
  } = useSimulationStore();
  
  const [constellationEditorOpen, setConstellationEditorOpen] = useState(false);
  const [aiRouterOpen, setAiRouterOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hasShownMobileMenuHint, setHasShownMobileMenuHint] = useState(false);

  const selectedStep = timeline[selectedYearIndex] || timeline[timeline.length - 1];
  const currentYearIndex = yearPlans.length - 1;
  const currentPlan = yearPlans[currentYearIndex] || {
    deploymentIntensity: 1.0,
    computeStrategy: "balanced" as ComputeStrategy,
    launchStrategy: "medium" as LaunchStrategy,
  };

  const currentYear = selectedStep?.year || config.startYear;
  const prevOrbitalShare = useRef<number>(0);
  const [newPodsThisStep, setNewPodsThisStep] = useState(0);

  // Calculate new pods deployed this step and trigger launch animations ONLY on deploy
  useEffect(() => {
    // Only trigger launches when yearTransition happens (user clicked deploy)
    if (yearTransition && timeline.length > 0) {
      const current = timeline[timeline.length - 1];
      const previous = timeline.length > 1 ? timeline[timeline.length - 2] : null;
      if (previous) {
        const podsDiff = current.podsTotal - previous.podsTotal;
        if (podsDiff > 0) {
          setNewPodsThisStep(podsDiff);
          setTimeout(() => setNewPodsThisStep(0), 1000);
          
          // Trigger launch event for SandboxGlobe to detect
          // This ensures launches animate immediately when deploying
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('controls-changed', { 
              detail: { podsDelta: podsDiff, orbitalShare: current.orbitalShare }
            }));
          }
        }
      }
    }
  }, [yearTransition, timeline]);

  // Launch sites (hardcoded for now - could be derived from Cesium viewer)
  const launchSites = useMemo(() => {
    // Launch sites for OrbitLayer
    return [
      { id: "cape-canaveral", name: "Cape Canaveral", lat: 28.5623, lon: -80.5774 },
      { id: "boca-chica", name: "Boca Chica", lat: 25.9971, lon: -97.1554 },
      { id: "vandenberg", name: "Vandenberg", lat: 34.7420, lon: -120.5724 },
    ];
  }, []);

  const currentOrbitalShare = selectedStep?.orbitalShare || 0;
  const [chartsCollapsed, setChartsCollapsed] = useState(false);

  // Expose simulation state to window for SandboxGlobe to detect launches
  useEffect(() => {
    if (typeof window !== "undefined" && selectedStep) {
      const podsTotal = selectedStep.podsTotal || 0;
      const orbitalShare = selectedStep.orbitalShare || 0;
      
      // Calculate launches per year from the simulation
      // Use rocket profile to determine pods per launch
      const currentPlan = yearPlans[yearPlans.length - 1];
      const rocketType = currentPlan?.launchStrategy || "medium";
      // Approximate pods per launch: heavy=8, medium=4, light=2
      const podsPerLaunchMap: Record<string, number> = {
        heavy: 8,
        medium: 4,
        light: 2,
      };
      const podsPerLaunch = podsPerLaunchMap[rocketType] || 4;
      const launchesPerYear = podsTotal > 0 ? Math.ceil(podsTotal / podsPerLaunch) : 0;
      
      (window as any).__orbitSimState = {
        podsInOrbit: podsTotal,
        orbitalShare: orbitalShare,
        launchesPerYear: launchesPerYear,
        timeline: timeline,
      };
    }
  }, [selectedStep, timeline, currentOrbitalShare, yearPlans]);

  // Update prevOrbitalShare after transition
  useEffect(() => {
    if (yearTransition) {
      const timer = setTimeout(() => {
        prevOrbitalShare.current = currentOrbitalShare;
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [yearTransition, currentOrbitalShare]);

  // Don't auto-open mobile menu - user should manually open it


  // Listen for tutorial button clicks from YearCounter
  useEffect(() => {
    const handleOpenAiRouter = () => {
      setConstellationEditorOpen(false); // Close constellation if open
      setAiRouterOpen(true);
    };
    const handleOpenConstellation = () => {
      setAiRouterOpen(false); // Close AI Router if open
      setConstellationEditorOpen(true);
    };
    const handleCloseAiRouter = () => setAiRouterOpen(false);
    const handleCloseConstellation = () => setConstellationEditorOpen(false);

    const handleCloseMobileMenu = () => {
      setMobileMenuOpen(false);
    };

    window.addEventListener('open-ai-router', handleOpenAiRouter);
    window.addEventListener('open-constellation', handleOpenConstellation);
    window.addEventListener('close-ai-router', handleCloseAiRouter);
    window.addEventListener('close-constellation', handleCloseConstellation);
    window.addEventListener('close-mobile-menu', handleCloseMobileMenu);

    return () => {
      window.removeEventListener('open-ai-router', handleOpenAiRouter);
      window.removeEventListener('open-constellation', handleOpenConstellation);
      window.removeEventListener('close-ai-router', handleCloseAiRouter);
      window.removeEventListener('close-constellation', handleCloseConstellation);
      window.removeEventListener('close-mobile-menu', handleCloseMobileMenu);
    };
  }, []);

  return (
    <>
      {/* Mobile Menu Button - visible on mobile, hidden on desktop (strategy card is always visible on desktop) */}
      <button
        onClick={() => {
          console.log('[SimpleModeView] Menu button clicked, opening menu');
          setMobileMenuOpen(true);
        }}
        className="fixed top-[104px] sm:top-[112px] left-4 z-[160] p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 shadow-lg pointer-events-auto lg:hidden"
        aria-label="Open menu"
        data-tutorial-mobile-menu-button
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile Menu */}
      <MobileMenu isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)}>
        {/* Strategy Card */}
        <div className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-3 sm:px-4 py-3" data-tutorial-strategy-card>
          <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">
            Strategy for {currentYear}
          </div>

          <div className="text-xs text-slate-400 mb-1">Compute strategy</div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              { id: "edge_heavy", label: "Latency-first", desc: "Edge-heavy pods; fastest, priciest" },
              { id: "bulk_heavy", label: "Cost-first", desc: "Bulk pods; cheapest, high latency" },
              { id: "green_heavy", label: "Carbon-first", desc: "Green pods; lowest tCO₂" },
              { id: "balanced", label: "Balanced", desc: "Mix of all three" },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => {
                  updateCurrentPlan({ computeStrategy: opt.id as any });
                  setMobileMenuOpen(false);
                }}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left text-xs transition-all",
                  currentPlan.computeStrategy === opt.id
                    ? "border-emerald-400 bg-emerald-500/10"
                    : "border-slate-700 bg-slate-900/60"
                )}
              >
                <div className="font-medium text-slate-100">{opt.label}</div>
                <div className="text-[10px] text-slate-400">{opt.desc}</div>
              </button>
            ))}
          </div>

          <div className="h-px bg-slate-800 my-2" />

          <div className="text-xs text-slate-400 mb-1">Launch strategy</div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "heavy", label: "Heavy lift", desc: "Max payload, highest carbon" },
              { id: "medium", label: "Reusable", desc: "Balanced reusable workhorse" },
              { id: "light", label: "Light & cheap", desc: "Small launches, flexible" },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => {
                  updateCurrentPlan({ launchStrategy: opt.id as any });
                  setMobileMenuOpen(false);
                }}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2 text-left text-xs transition-all",
                  currentPlan.launchStrategy === opt.id
                    ? "border-emerald-400 bg-emerald-500/10"
                    : "border-slate-700 bg-slate-900/60"
                )}
              >
                <div className="font-medium text-slate-100">{opt.label}</div>
                <div className="text-[10px] text-slate-400">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* AI Router and Constellation Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConstellationEditorOpen(false);
              setAiRouterOpen(true);
              setMobileMenuOpen(false);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition pointer-events-auto relative"
            data-tutorial-ai-router-button
            style={{ zIndex: 500, position: 'relative' }}
          >
            AI Router
          </button>
          <button
            onClick={() => {
              setAiRouterOpen(false);
              setConstellationEditorOpen(true);
              setMobileMenuOpen(false);
            }}
            className="hidden lg:block w-full px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition border border-slate-700"
            data-tutorial-constellation-button
          >
            Constellation
          </button>
        </div>
      </MobileMenu>

      {/* AI Panels */}
      <AiRouterPanelV2 isOpen={aiRouterOpen} onClose={() => {
        setAiRouterOpen(false);
      }} />
      <ConstellationEditorV2 isOpen={constellationEditorOpen} onClose={() => {
        setConstellationEditorOpen(false);
      }} />

      {/* Orbit Layer - Rocket launches (only animations, no 2D ring) */}
      <OrbitLayer
        launchSites={launchSites}
        newPodsThisStep={newPodsThisStep}
        orbitalShare={currentOrbitalShare}
        prevOrbitalShare={prevOrbitalShare.current}
      />

      {/* Year transition overlay */}
      {yearTransition && (
        <div className="pointer-events-none fixed top-6 right-6 z-40">
          <div className="rounded-xl bg-black/80 px-4 py-2 text-sm font-mono text-emerald-200 shadow-lg animate-year-slide">
            {yearTransition.fromYear} → {yearTransition.toYear}
          </div>
        </div>
      )}

      {/* Global KPI Strip - Fixed below SurfaceTabs */}
      {timeline && timeline.length > 0 && (
        <div className="fixed top-12 sm:top-14 left-0 right-0 z-50 pointer-events-none overflow-x-auto">
          <GlobalKPIStrip 
            timeline={timeline} 
            currentYear={currentYear}
            strategyByYear={getStrategyByYear(timeline)}
          />
        </div>
      )}

      {/* Top: Strategy + Utilization Controls - only content blocks events, hidden on mobile */}
      <div className="fixed top-[104px] sm:top-[112px] left-0 right-0 z-30 pointer-events-none hidden lg:block">
        <div className="px-2 sm:px-4 md:px-6 pointer-events-auto w-full max-w-full overflow-x-auto">
          <TopRow
            currentYear={currentYear}
            currentPlan={currentPlan}
            onUpdatePlan={updateCurrentPlan}
          />
        </div>
      </div>

      {/* Globe area - full screen */}
      <div className="h-screen" style={{ pointerEvents: 'none' }} />

      {/* Charts - collapsible bottom panel */}
      <div className={`fixed bottom-0 left-0 right-0 pointer-events-auto bg-slate-950/95 backdrop-blur-sm border-t border-slate-800 transition-all duration-300 ${chartsCollapsed ? 'max-h-[60px] overflow-hidden' : 'max-h-[50vh] overflow-y-auto'}`} style={{ zIndex: 35 }} data-tutorial-metrics-panel>
        <div className="flex flex-col gap-4 sm:gap-6 px-3 sm:px-6 pb-8 sm:pb-6 pt-4 overflow-x-auto">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Simulation Metrics</h3>
            <button 
              onClick={() => setChartsCollapsed(!chartsCollapsed)}
              className="text-xs text-slate-400 hover:text-white transition"
            >
              {chartsCollapsed ? '▼ Expand' : '▲ Collapse'}
            </button>
          </div>
          {/* Metrics grid */}
          {!chartsCollapsed && timeline && timeline.length > 0 && (
            <>
              <MetricsGrid timeline={timeline} />
              
              {/* Power vs Compute Frontier */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3">
                <div className="text-xs font-semibold text-slate-100 mb-1">
                  Power → Compute Frontier
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
                  Animated scatter: Teal = Class A dominated, Cyan = Class B dominated
                </div>
                <div className="h-[250px] sm:h-[300px]">
                  <PowerComputeScatter 
                    timeline={timeline} 
                    currentYear={currentYear}
                    strategyByYear={getStrategyByYear(timeline)}
                  />
                </div>
              </div>

              {/* Strategy Phase Diagram */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3">
                <div className="text-xs font-semibold text-slate-100 mb-1">
                  Strategy Phase Diagram
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
                  Timeline with Cost/Compute, Carbon/Compute, Latency/Compute derivatives
                </div>
                <div className="h-[320px]">
                  <StrategyPhaseDiagram 
                    timeline={timeline} 
                    strategyByYear={getStrategyByYear(timeline)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Deployment Progress */}
          {!chartsCollapsed && timeline && timeline.length > 0 && (
            <DeploymentProgressCard timeline={timeline} />
          )}
        </div>
      </div>
    </>
  );
}
