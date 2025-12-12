"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import SimulationMetrics from "./SimulationMetrics";
import DeploymentTimelineChart from "./DeploymentTimelineChart";
import DualClassStackChart from "./DualClassStackChart";
import PowerComputeScatter from "./PowerComputeScatter";
import PowerComputeFrontier from "./PowerComputeFrontier";
import OpexStreamgraph from "./OpexStreamgraph";
import CarbonRiver from "./CarbonRiver";
import ConstraintDial from "./ConstraintDial";
import StoryPanel from "./StoryPanel";
import StrategyPhaseDiagram from "./StrategyPhaseDiagram";
import SolarAvailabilityChart from "./SolarAvailabilityChart";
import GlobalKPIStrip from "./GlobalKPIStrip";
import OrbitLayer from "./OrbitLayer";
import AiRouterPanelV2 from "./AiRouterPanelV2";
import YearCounter from "../YearCounter";
import MobileMenu from "../MobileMenu";
import ScenarioMenu from "./ScenarioMenu";
import { checkAutomaticEvents } from "../../lib/orbitSim/automaticEvents";
import type { SurfaceType } from "../SurfaceTabs";
import type { ComputeStrategy, LaunchStrategy, ScenarioMode } from "../../lib/orbitSim/simulationConfig";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";
import type { StrategyMode } from "../../lib/orbitSim/satelliteClasses";
import { formatDecimal } from "../../lib/utils/formatNumber";
import { exportDebugData, getDebugState, getDebugStateEntry, scenarioModeToKey } from "../../lib/orbitSim/debugState";
import { useTutorialStore } from "../../store/tutorialStore";

// Simple cn utility for className merging
function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

// Help button component for mobile menu
function HelpButtonInMenu({ onClose }: { onClose: () => void }) {
  const { startTutorial } = useTutorialStore();
  
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startTutorial();
        onClose();
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition pointer-events-auto relative z-[201]"
      style={{ zIndex: 201 }}
    >
      Help / Tutorial
    </button>
  );
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

export function getStrategyByYear(timeline: YearStep[], yearPlans?: Array<{ computeStrategy: ComputeStrategy; launchStrategy: LaunchStrategy; deploymentIntensity: number }>): Map<number, StrategyMode> {
  const strategyMap = new Map<number, StrategyMode>();
  
  if (!yearPlans || yearPlans.length === 0) {
    timeline.forEach(step => {
      strategyMap.set(step.year, "BALANCED");
    });
    return strategyMap;
  }
  
  timeline.forEach((step, index) => {
    if (yearPlans[index]) {
      const strategy = mapComputeStrategyToStrategyMode(yearPlans[index].computeStrategy);
      strategyMap.set(step.year, strategy);
    } else if (yearPlans.length > 0) {
      const lastPlan = yearPlans[yearPlans.length - 1];
      const strategy = mapComputeStrategyToStrategyMode(lastPlan.computeStrategy);
      strategyMap.set(step.year, strategy);
    } else {
      strategyMap.set(step.year, "BALANCED");
    }
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

        {/* Scenario Menu - Inside strategy card, at the bottom */}
        <div className="mt-3 pt-3 border-t border-slate-800">
          <ScenarioMenu />
        </div>
      </div>

      {/* Right: buttons moved to YearCounter component */}
      <div className="flex-1" />
    </div>
  );
}

/**
 * Metrics Grid - Clean sparkline cards for key metrics
 * Uses new SimulationMetrics component with SVG sparklines
 */
function MetricsGrid({ timeline, yearPlans, config }: { timeline: YearStep[]; yearPlans?: Array<{ computeStrategy: ComputeStrategy; launchStrategy: LaunchStrategy; deploymentIntensity: number }>; config: { scenarioMode?: string } }) {
  const currentYear = timeline.length > 0 ? timeline[timeline.length - 1].year : 2025;
  
  return (
    <div className="w-full">
      <SimulationMetrics 
        timeline={timeline}
        scenarioMode={config.scenarioMode}
        currentYear={currentYear}
      />
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
        <span suppressHydrationWarning>Year: {last.year}</span>
        <span suppressHydrationWarning>Orbital share: {(last.orbitalShare * 100).toFixed(0)}%</span>
        <span suppressHydrationWarning>Cost savings vs all-ground: ${formatMillions(opexSavings)}M/yr</span>
        <span suppressHydrationWarning>tCO₂ avoided: {formatThousands(carbonSavings)}k tCO₂/yr</span>
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
    updateConfig,
    setForecastBands,
  } = useSimulationStore();
  
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
  const [isClient, setIsClient] = useState(false);
  const [highlightedYear, setHighlightedYear] = useState<number | undefined>(currentYear);
  
  // Only render scenario diagnostics on client to avoid hydration errors
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Listen for jumpToYear events from StoryPanel
  useEffect(() => {
    const handleJumpToYear = (event: CustomEvent<{ year: number }>) => {
      const targetYear = event.detail.year;
      setHighlightedYear(targetYear);
      // Try to find and update selected year index if possible
      const yearIndex = timeline.findIndex(step => step.year === targetYear);
      if (yearIndex !== -1) {
        // Note: We can't directly set selectedYearIndex from here,
        // but the highlightedYear state will update the charts
      }
    };

    window.addEventListener('jumpToYear', handleJumpToYear as EventListener);
    return () => {
      window.removeEventListener('jumpToYear', handleJumpToYear as EventListener);
    };
  }, [timeline]);

  // Check automatic events when year advances
  useEffect(() => {
    if (timeline && timeline.length > 0) {
      const currentStep = timeline[timeline.length - 1];
      const year = currentStep.year;
      
      // Check and trigger automatic events
      checkAutomaticEvents(timeline, year);
    }
  }, [timeline]);

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
  const [chartsCollapsed, setChartsCollapsed] = useState(true); // Auto-collapsed by default

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
      setAiRouterOpen(true);
    };
    const handleCloseAiRouter = () => setAiRouterOpen(false);

    const handleCloseMobileMenu = () => {
      setMobileMenuOpen(false);
    };

    window.addEventListener('open-ai-router', handleOpenAiRouter);
    window.addEventListener('close-ai-router', handleCloseAiRouter);
    window.addEventListener('close-mobile-menu', handleCloseMobileMenu);

    return () => {
      window.removeEventListener('open-ai-router', handleOpenAiRouter);
      window.removeEventListener('close-ai-router', handleCloseAiRouter);
      window.removeEventListener('close-mobile-menu', handleCloseMobileMenu);
    };
  }, []);

  return (
    <>
      {/* Mobile Menu Button - visible on mobile, hidden on desktop (strategy card is always visible on desktop) */}
      <button
        onClick={() => {
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
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  updateCurrentPlan({ computeStrategy: opt.id as any });
                  setMobileMenuOpen(false);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left text-xs transition-all pointer-events-auto relative z-[201]",
                  currentPlan.computeStrategy === opt.id
                    ? "border-emerald-400 bg-emerald-500/10"
                    : "border-slate-700 bg-slate-900/60"
                )}
                style={{ zIndex: 201 }}
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
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  updateCurrentPlan({ launchStrategy: opt.id as any });
                  setMobileMenuOpen(false);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className={cn(
                  "pointer-events-auto relative z-[201] flex-1 rounded-xl border px-3 py-2 text-left text-xs transition-all",
                  currentPlan.launchStrategy === opt.id
                    ? "border-emerald-400 bg-emerald-500/10"
                    : "border-slate-700 bg-slate-900/60"
                )}
                style={{ zIndex: 201 }}
              >
                <div className="font-medium text-slate-100">{opt.label}</div>
                <div className="text-[10px] text-slate-400">{opt.desc}</div>
              </button>
            ))}
          </div>

          {/* Scenario Menu - Inside mobile strategy card */}
          <div className="mt-3 pt-3 border-t border-slate-800">
            <ScenarioMenu />
          </div>
        </div>

        {/* Help Button - Below strategy card in mobile menu */}
        <div className="mt-4 pt-4 border-t border-slate-800">
          <HelpButtonInMenu onClose={() => setMobileMenuOpen(false)} />
        </div>

      </MobileMenu>

      {/* AI Panels */}
      <AiRouterPanelV2 isOpen={aiRouterOpen} onClose={() => {
        setAiRouterOpen(false);
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

      {/* Export Debug Data Button - Debug only */}
      <div className="fixed top-12 sm:top-14 right-4 z-[60] pointer-events-auto">
        <button
          onClick={() => exportDebugData()}
          className="px-3 py-1.5 bg-purple-600/80 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition shadow-lg border border-purple-500/50"
          title="Export debug state as JSON"
        >
          📥 Export Debug
        </button>
      </div>


      {/* Top: Strategy + Utilization Controls - only content blocks events, hidden on mobile */}
      <div className="fixed top-[104px] sm:top-[112px] left-0 right-0 z-20 pointer-events-none hidden lg:block">
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
      <div className={`fixed bottom-0 left-0 right-0 pointer-events-auto bg-slate-950/95 backdrop-blur-sm border-t border-slate-800 transition-all duration-300 ${chartsCollapsed ? 'max-h-[60px] overflow-hidden' : 'max-h-[70vh] overflow-y-auto'}`} style={{ zIndex: 1000 }} data-tutorial-metrics-panel>
        {/* Header with collapse button - absolutely positioned at top right, always clickable */}
        <div className="absolute top-0 left-0 right-0 bg-slate-950/95 backdrop-blur-sm flex items-center justify-between px-3 sm:px-6 py-3 border-b border-slate-800/50" style={{ zIndex: 1001, pointerEvents: 'auto' }}>
          <h3 className="text-sm font-semibold text-white">Simulation Metrics</h3>
          <div className="flex items-center gap-3" style={{ pointerEvents: 'auto' }}>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                e.nativeEvent.stopImmediatePropagation();
                setChartsCollapsed(!chartsCollapsed);
              }}
              className="text-xs text-slate-400 hover:text-white transition px-4 py-2 rounded-md hover:bg-slate-800 border border-slate-700 hover:border-slate-600 bg-slate-900/80"
              style={{ zIndex: 1002, pointerEvents: 'auto', position: 'relative' }}
              type="button"
              aria-label={chartsCollapsed ? 'Expand metrics panel' : 'Collapse metrics panel'}
            >
              {chartsCollapsed ? '▼ Expand' : '▲ Collapse'}
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-4 sm:gap-6 px-3 sm:px-6 pb-8 sm:pb-6 pt-16 overflow-x-auto">
          {/* Metrics Grid - Only show when not collapsed */}
          {!chartsCollapsed && timeline && timeline.length > 0 && (
            <>
              <MetricsGrid timeline={timeline} yearPlans={yearPlans} config={config} />
              
              {/* Scenario Diagnostics */}
              {isClient && (() => {
                const lastStep = timeline[timeline.length - 1];
                if (!lastStep) return null;
                
                const scenarioMode = (lastStep as any).scenario_mode || config.scenarioMode || "BASELINE";
                const launchCostPerKg = (lastStep as any).launch_cost_per_kg;
                const failureRate = (lastStep as any).failure_rate_effective;
                const maintenanceUtil = (lastStep as any).maintenance_utilization_percent;
                const backhaulUtil = (lastStep as any).backhaul_utilization_percent;
                const orbitCarbon = (lastStep as any).orbit_carbon_intensity;
                const orbitCost = (lastStep as any).orbit_cost_per_compute;
                const orbitComputeShare = (lastStep as any).orbit_compute_share;
                const orbitEnergyShare = (lastStep as any).orbit_energy_share_twh;
                
                if (scenarioMode && (launchCostPerKg !== undefined || failureRate !== undefined)) {
                  return (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3">
                      <div className="text-xs font-semibold text-slate-100 mb-2">
                        Scenario Diagnostics: {scenarioMode === "ORBITAL_BEAR" ? "Orbital Bear" : scenarioMode === "ORBITAL_BULL" ? "Orbital Bull" : "Baseline"}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] sm:text-[11px]">
                        {launchCostPerKg !== undefined && (
                          <div>
                            <div className="text-slate-400">Launch $/kg</div>
                            <div className="text-slate-100 font-medium">${launchCostPerKg.toFixed(0)}</div>
                          </div>
                        )}
                        {failureRate !== undefined && (
                          <div>
                            <div className="text-slate-400">Failure rate</div>
                            <div className="text-slate-100 font-medium">{(failureRate * 100).toFixed(1)}% / yr</div>
                          </div>
                        )}
                        {maintenanceUtil !== undefined && (
                          <div>
                            <div className="text-slate-400">Maintenance load</div>
                            <div className="text-slate-100 font-medium">{maintenanceUtil.toFixed(0)}% of capacity</div>
                          </div>
                        )}
                        {backhaulUtil !== undefined && (
                          <div>
                            <div className="text-slate-400">Backhaul utilization</div>
                            <div className="text-slate-100 font-medium">{(backhaulUtil * 100).toFixed(0)}%</div>
                          </div>
                        )}
                        {orbitCarbon !== undefined && (
                          <div>
                            <div className="text-slate-400">Orbit carbon intensity</div>
                            <div className="text-slate-100 font-medium">{orbitCarbon.toFixed(0)} kg CO₂/TWh</div>
                          </div>
                        )}
                        {orbitCost !== undefined && (
                          <div>
                            <div className="text-slate-400">Orbit cost/compute</div>
                            <div className="text-slate-100 font-medium">${orbitCost.toFixed(0)}</div>
                          </div>
                        )}
                        {orbitComputeShare !== undefined && (
                          <div>
                            <div className="text-slate-400">Orbit compute share</div>
                            <div className="text-slate-100 font-medium">{(orbitComputeShare * 100).toFixed(1)}%</div>
                          </div>
                        )}
                        {orbitEnergyShare !== undefined && (
                          <div>
                            <div className="text-slate-400">Orbit energy share</div>
                            <div className="text-slate-100 font-medium">{(orbitEnergyShare * 100).toFixed(1)}%</div>
                          </div>
                        )}
                      </div>
                      {scenarioMode === "ORBITAL_BEAR" && (
                        <div className="mt-2 text-[10px] text-slate-500 italic">
                          Scenario: Orbital bear (high launch costs, high failure, weak autonomy)
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}
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
