"use client";

import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";

export type TabId = "overview" | "world" | "economics" | "physics" | "scenarios";

// Simple cn utility for className merging
function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

interface SimulationTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  scenarioMode: ScenarioMode;
  onScenarioChange: (scenario: ScenarioMode) => void;
}

export default function SimulationTabs({
  activeTab,
  onTabChange,
  scenarioMode,
  onScenarioChange,
}: SimulationTabsProps) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "SYSTEM OVERVIEW" },
    { id: "world", label: "WORLD VIEW" },
    { id: "economics", label: "ECONOMICS" },
    { id: "physics", label: "PHYSICS & ENGINEERING" },
    { id: "scenarios", label: "SCENARIOS" },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "whitespace-nowrap rounded-xl border px-4 py-2 text-center text-xs font-medium transition-all uppercase tracking-wide",
              activeTab === tab.id
                ? "border-emerald-400 bg-emerald-500/10 text-emerald-400"
                : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600 hover:text-white"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
