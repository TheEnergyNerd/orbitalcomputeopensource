"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { useSimStore } from "../store/simStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { useEffect, useState } from "react";

export default function SandboxVisualizations() {
  const { orbitalComputeUnits, groundDCReduction, isMostlySpaceMode, sandboxMode } = useSandboxStore();
  const { getDeployedUnits } = useOrbitalUnitsStore();
  const state = useSimStore((s) => s.state);
  const [isSurgeActive, setIsSurgeActive] = useState(false);
  const [showExpandedCharts, setShowExpandedCharts] = useState(false);
  const [isVisible, setIsVisible] = useState(false); // Start hidden by default
  const [metrics, setMetrics] = useState({
    latency: 45,
    energyCost: 1000,
    carbon: 500,
    coolingCost: 400,
    baselineLatency: 45,
    baselineEnergy: 1000,
    baselineCarbon: 500,
    baselineCooling: 400,
    launchCarbon: 0,
    dailyLaunchCarbon: 0,
  });

  // Listen for surge events
  useEffect(() => {
    const handleSurgeEvent = () => {
      setIsSurgeActive(true);
      // Surge lasts 5 seconds, then shows improvement after orbital capacity is added
      setTimeout(() => setIsSurgeActive(false), 5000);
    };
    window.addEventListener("surge-event" as any, handleSurgeEvent);
    return () => window.removeEventListener("surge-event" as any, handleSurgeEvent);
  }, []);

  useEffect(() => {
    if (!state) return;

    // Calculate ACTUAL deployed capacity (not just slider values)
    const deployedUnits = getDeployedUnits();
    const deployedOrbitalCapacity = deployedUnits.reduce((sum, unit) => sum + unit.powerOutputMw, 0);
    
    // Realistic baseline: ~42 GW (42,000 MW) operational today
    const BASE_GROUND_CAPACITY_GW = 42;
    const baseGroundCapacity = BASE_GROUND_CAPACITY_GW * 1000; // Convert to MW
    const remainingGroundCapacity = baseGroundCapacity * (1 - groundDCReduction / 100);
    
    // Total capacity = deployed orbital + remaining ground
    const totalCapacity = deployedOrbitalCapacity + remainingGroundCapacity;
    
    // Orbit share based on actual deployments
    const orbitShare = totalCapacity > 0 ? (deployedOrbitalCapacity / totalCapacity) : 0;
    
    // Capacity ratio: how much capacity we have vs baseline (42 GW)
    const capacityRatio = totalCapacity / baseGroundCapacity;
    
    // Realistic baseline metrics (scaled to 42 GW baseline)
    const baselineLatency = 45;
    const baselineEnergyPerGW = 50; // $/MWh per GW
    const baselineEnergy = baselineEnergyPerGW * BASE_GROUND_CAPACITY_GW * 8760; // Annual cost in $M
    const baselineCarbonPerGW = 350; // kg CO2/MWh per GW
    const baselineCarbon = baselineCarbonPerGW * BASE_GROUND_CAPACITY_GW * 8760 / 1000; // Annual in metric tons
    const baselineCooling = baselineEnergy * 0.4;
    
    // Launch carbon intensity: ~150 kg CO2 per kg payload to LEO
    // Average satellite: ~260 kg, so ~39,000 kg CO2 per satellite
    // For a LEO pod (50 satellites): ~1,950,000 kg CO2 = 1,950 metric tons
    const launchCarbonPerSatellite = 39000; // kg CO2
    const satellitesPerUnit = 50; // LEO pods have 50 satellites
    const totalLaunchCarbon = deployedUnits.length * satellitesPerUnit * launchCarbonPerSatellite / 1000; // metric tons
    
    // During surge: show stress (higher latency, energy, carbon)
    const surgeMultiplier = isSurgeActive ? 1.5 : 1.0;
    
    // Latency decreases as orbit share increases (global coverage)
    // During surge without orbital capacity, latency spikes
    const minLatency = 5;
    let newLatency = baselineLatency - (baselineLatency - minLatency) * orbitShare;
    if (isSurgeActive && orbitShare < 0.1) {
      // Surge stress: latency spikes if no orbital capacity
      newLatency = baselineLatency * surgeMultiplier;
    } else if (isSurgeActive && orbitShare >= 0.1) {
      // Surge with orbital capacity: shows improvement
      newLatency = Math.max(minLatency, newLatency * 0.7); // 30% better during surge
    }

    // Energy cost: orbital uses solar (near $0/MWh), ground uses grid
    const orbitalEnergyPerGW = 0;
    const groundEnergyPerGW = baselineEnergyPerGW;
    const orbitalEnergy = orbitalEnergyPerGW * (deployedOrbitalCapacity / 1000) * 8760;
    const groundEnergy = groundEnergyPerGW * (remainingGroundCapacity / 1000) * 8760;
    
    let newEnergy = (orbitalEnergy + groundEnergy) * capacityRatio;
    if (isSurgeActive && orbitShare < 0.1) {
      newEnergy = baselineEnergy * surgeMultiplier * capacityRatio;
    }

    // Carbon: orbital is near-zero (solar), ground has emissions
    const orbitalCarbon = 0;
    const groundCarbonPerGW = baselineCarbonPerGW;
    const groundCarbon = groundCarbonPerGW * (remainingGroundCapacity / 1000) * 8760 / 1000;
    let operationalCarbon = groundCarbon * capacityRatio;
    if (isSurgeActive && orbitShare < 0.1) {
      operationalCarbon = baselineCarbon * surgeMultiplier * capacityRatio;
    }
    // Add launch carbon (amortized over 7-year lifetime)
    const dailyLaunchCarbon = totalLaunchCarbon / (7 * 365); // Amortize over 7 years
    const newCarbon = operationalCarbon + dailyLaunchCarbon;

    // Cooling cost decreases (orbit has no cooling)
    // Only applies to remaining ground capacity
    const newCooling = baselineCooling * (1 - orbitShare) * (remainingGroundCapacity / baseGroundCapacity);

    setMetrics({
      latency: newLatency,
      energyCost: newEnergy,
      carbon: newCarbon,
      coolingCost: newCooling,
      baselineLatency,
      baselineEnergy,
      baselineCarbon,
      baselineCooling,
      launchCarbon: totalLaunchCarbon,
      dailyLaunchCarbon: dailyLaunchCarbon,
    });
  }, [orbitalComputeUnits, groundDCReduction, state, isSurgeActive, sandboxMode]);

  const latencyImprovement = ((metrics.baselineLatency - metrics.latency) / metrics.baselineLatency * 100);
  const energyImprovement = ((metrics.baselineEnergy - metrics.energyCost) / metrics.baselineEnergy * 100);
  const carbonImprovement = ((metrics.baselineCarbon - metrics.carbon) / metrics.baselineCarbon * 100);
  const coolingImprovement = ((metrics.baselineCooling - metrics.coolingCost) / metrics.baselineCooling * 100);

  if (!isVisible) {
    return (
      <div className="fixed bottom-[280px] left-6 z-30">
        <button
          onClick={() => setIsVisible(true)}
          className="px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 text-dark-bg rounded-lg text-sm font-semibold transition-all shadow-lg z-50"
          title="Show Improvements vs Ground-Only"
        >
          ▶ Show Improvements
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-[280px] left-6 right-6 sm:right-[420px] z-30 max-h-[40vh] overflow-y-auto">
      <div className={`panel-glass rounded-xl p-4 sm:p-6 shadow-2xl border-2 border-white/20 ${isSurgeActive ? 'border-accent-orange' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Improvements vs Ground-Only</h3>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setIsVisible(false)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs font-semibold transition-all"
              title="Hide panel"
            >
              ✕
            </button>
            {sandboxMode === "freeplay" && (
              <button
                onClick={() => setShowExpandedCharts(!showExpandedCharts)}
                className="px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 text-dark-bg rounded-lg text-sm font-semibold transition-all shadow-lg"
                title="Show additional metrics including launch carbon"
              >
                {showExpandedCharts ? "▼ Less Charts" : "▶ More Charts"}
              </button>
            )}
            {isSurgeActive && (
              <div className="px-3 py-1 bg-accent-orange/20 border border-accent-orange rounded text-xs text-accent-orange font-semibold animate-pulse">
                ⚠️ SURGE ACTIVE
              </div>
            )}
          </div>
        </div>
        
        {/* Comparison Charts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {/* Latency Chart */}
          <ComparisonChart
            title="Latency"
            current={metrics.latency}
            baseline={metrics.baselineLatency}
            unit="ms"
            improvement={latencyImprovement}
            color="accent-blue"
            lowerIsBetter={true}
          />
          
          {/* Energy Chart */}
          <ComparisonChart
            title="Energy Cost"
            current={metrics.energyCost}
            baseline={metrics.baselineEnergy}
            unit="$/MWh"
            improvement={energyImprovement}
            color="accent-orange"
            lowerIsBetter={true}
          />
          
          {/* Carbon Chart */}
          <ComparisonChart
            title="Carbon Emissions"
            current={metrics.carbon}
            baseline={metrics.baselineCarbon}
            unit="kg"
            improvement={carbonImprovement}
            color="accent-green"
            lowerIsBetter={true}
          />
          
          {/* Cooling Chart */}
          <ComparisonChart
            title="Cooling Cost"
            current={metrics.coolingCost}
            baseline={metrics.baselineCooling}
            unit="$/yr"
            improvement={coolingImprovement}
            color="accent-blue"
            lowerIsBetter={true}
          />
        </div>

        {/* Expanded Charts (Freeplay only) */}
        {sandboxMode === "freeplay" && showExpandedCharts && (
          <div className="mt-4 pt-4 border-t border-gray-700/50">
            <h4 className="text-base font-bold text-white mb-3">Additional Metrics</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ComparisonChart
                title="Launch Carbon (Total)"
                current={metrics.launchCarbon}
                baseline={0}
                unit="metric tons"
                improvement={0}
                color="accent-orange"
                lowerIsBetter={true}
              />
              <ComparisonChart
                title="Daily Launch Carbon (Amortized)"
                current={metrics.dailyLaunchCarbon}
                baseline={0}
                unit="metric tons/day"
                improvement={0}
                color="accent-orange"
                lowerIsBetter={true}
              />
            </div>
            {metrics.launchCarbon > 0 && (
              <div className="mt-3 p-3 bg-accent-orange/10 border border-accent-orange/30 rounded-lg text-xs text-gray-300">
                <div className="font-semibold text-accent-orange mb-1">Launch Carbon Impact</div>
                <div className="text-gray-400">
                  Total launch emissions: {metrics.launchCarbon.toFixed(0)} metric tons CO₂
                  <br />
                  Daily amortized: {metrics.dailyLaunchCarbon.toFixed(2)} metric tons/day (over 7-year lifetime)
                  <br />
                  <span className="text-gray-500 italic">
                    Note: Launch carbon is a one-time cost amortized over the satellite lifetime.
                    Operational carbon savings typically offset launch emissions within 2-3 years.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Summary Stats */}
        <div className="mt-4 pt-4 border-t border-gray-700/50">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <StatCard label="Latency ↓" value={`${latencyImprovement.toFixed(0)}%`} color="accent-blue" />
            <StatCard label="Energy ↓" value={`${energyImprovement.toFixed(0)}%`} color="accent-orange" />
            <StatCard label="Carbon ↓" value={`${carbonImprovement.toFixed(0)}%`} color="accent-green" />
            <StatCard label="Cooling ↓" value={`${coolingImprovement.toFixed(0)}%`} color="accent-blue" />
          </div>
        </div>

        {/* Logistics Challenge Info */}
        <div className="mt-4 pt-4 border-t border-gray-700/50">
          <div className="text-sm text-gray-200 mb-2 font-bold">🚀 Launch Logistics</div>
          <div className="grid grid-cols-3 gap-2 text-xs mb-3">
            <div className="bg-gray-800/70 rounded p-2 border border-gray-700/50">
              <div className="text-gray-300 font-medium">Cost per Sat</div>
              <div className="text-accent-orange font-bold text-sm">$500K-$2M</div>
            </div>
            <div className="bg-gray-800/70 rounded p-2 border border-gray-700/50">
              <div className="text-gray-300 font-medium">Launch Time</div>
              <div className="text-accent-blue font-bold text-sm">6-12 months</div>
            </div>
            <div className="bg-gray-800/70 rounded p-2 border border-gray-700/50">
              <div className="text-gray-300 font-medium">Orbital Lifetime</div>
              <div className="text-accent-green font-bold text-sm">5-7 years</div>
            </div>
          </div>
          
          {/* Cost Comparison */}
          {orbitalComputeUnits > 0 && (
            <div className="bg-gray-800/50 rounded p-3 mb-2">
              <div className="text-sm text-gray-200 mb-2 font-bold">💰 Cost Comparison</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Satellite Launch Cost:</span>
                  <span className="text-accent-orange font-semibold">
                    ${(orbitalComputeUnits * 50 * 1_000_000).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Equivalent Energy to Launch:</span>
                  <span className="text-accent-blue font-semibold">
                    ${(orbitalComputeUnits * 50 * 1_000_000 / 0.10).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-gray-700/50">
                  <span className="text-gray-300 font-semibold">Energy Cost Ratio:</span>
                  <span className="text-accent-green font-semibold">
                    {((orbitalComputeUnits * 50 * 1_000_000 / 0.10) / (orbitalComputeUnits * 50 * 1_000_000)).toFixed(0)}x
                  </span>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2 italic">
                Launching {orbitalComputeUnits * 50} satellites costs ~${(orbitalComputeUnits * 50 * 1_000_000).toLocaleString()}, 
                equivalent to ${((orbitalComputeUnits * 50 * 1_000_000) / 0.10 / 1_000_000).toFixed(1)}M kWh of energy at $0.10/kWh
              </div>
            </div>
          )}
          
          <div className="text-xs text-gray-500 mt-2 italic">
            Each orbital compute unit represents ~50 satellites. Deployment requires significant upfront investment and time.
          </div>
        </div>

        {/* Preset Logistics & Costs */}
        <div className="mt-4 pt-4 border-t border-gray-700/50">
          <div className="text-sm text-gray-200 mb-3 font-bold">📊 Scenario Logistics & Costs</div>
          <div className="space-y-2 text-xs">
            <PresetLogisticsCard
              name="All Earth"
              orbitalUnits={0}
              groundReduction={0}
              description="100% ground-based compute"
            />
            <PresetLogisticsCard
              name="Hybrid"
              orbitalUnits={30}
              groundReduction={0}
              description="30% orbital, 70% ground"
            />
            <PresetLogisticsCard
              name="Orbit-Dominant 2060"
              orbitalUnits={75}
              groundReduction={20}
              description="75% orbital, 20% ground"
            />
            <PresetLogisticsCard
              name="100% Orbit"
              orbitalUnits={100}
              groundReduction={100}
              description="Fully orbital compute infrastructure"
            />
          </div>
        </div>

        {/* Mostly Space Mode Indicator */}
        {isMostlySpaceMode && (
          <div className="mt-4 p-3 bg-accent-blue/20 border border-accent-blue/50 rounded-lg">
            <div className="text-sm font-semibold text-accent-blue">
              🌌 Mostly Space Compute Mode Active
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Orbital compute dominates. Ground infrastructure fading.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PresetLogisticsCard({ 
  name, 
  orbitalUnits, 
  groundReduction, 
  description 
}: { 
  name: string; 
  orbitalUnits: number; 
  groundReduction: number; 
  description: string;
}) {
  const satellitesPerUnit = 50;
  const costPerUnit = 50_000_000; // $50M per LEO pod
  const totalSatellites = orbitalUnits * satellitesPerUnit;
  const totalCost = orbitalUnits * costPerUnit;
  const buildTimeDays = orbitalUnits * 180; // 6 months per unit
  
  const formatTime = (days: number) => {
    if (days >= 365) {
      const years = Math.floor(days / 365);
      const months = Math.floor((days % 365) / 30);
      if (months > 0) {
        return `${years}y ${months}mo`;
      }
      return `${years}y`;
    } else if (days >= 30) {
      const months = Math.floor(days / 30);
      return `${months}mo`;
    }
    return `${days}d`;
  };

  return (
    <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="text-sm font-semibold text-white">{name}</div>
          <div className="text-xs text-gray-400">{description}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-gray-500">Units:</div>
          <div className="text-accent-blue font-semibold">{orbitalUnits}</div>
        </div>
        <div>
          <div className="text-gray-500">Satellites:</div>
          <div className="text-accent-blue font-semibold">{totalSatellites.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-gray-500">Total Cost:</div>
          <div className="text-accent-orange font-semibold">
            ${(totalCost / 1_000_000).toFixed(0)}M
          </div>
        </div>
        <div>
          <div className="text-gray-500">Build Time:</div>
          <div className="text-accent-green font-semibold">{formatTime(buildTimeDays)}</div>
        </div>
      </div>
    </div>
  );
}

function ComparisonChart({ 
  title, 
  current, 
  baseline, 
  unit, 
  improvement, 
  color,
  lowerIsBetter 
}: { 
  title: string; 
  current: number; 
  baseline: number; 
  unit: string; 
  improvement: number; 
  color: string;
  lowerIsBetter: boolean;
}) {
  const maxValue = Math.max(baseline, current) * 1.1;
  const baselinePercent = (baseline / maxValue) * 100;
  const currentPercent = (current / maxValue) * 100;
  
  const colorClasses = {
    "accent-blue": "bg-accent-blue",
    "accent-green": "bg-accent-green",
    "accent-orange": "bg-accent-orange",
  };

  return (
      <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-gray-200 font-medium">{title}</span>
        <span className={`font-bold text-base ${improvement > 0 ? 'text-accent-green' : 'text-gray-400'}`}>
          {improvement > 0 ? '↓' : ''} {Math.abs(improvement).toFixed(0)}%
        </span>
      </div>
      
      {/* Bar Chart */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-300 font-medium w-20">Baseline:</span>
          <div className="flex-1 bg-gray-800 rounded h-5 relative border border-gray-700">
            <div 
              className="bg-gray-600 h-full rounded"
              style={{ width: `${baselinePercent}%` }}
            />
            <span className="absolute right-2 top-0.5 text-xs text-white font-semibold">{baseline.toFixed(0)} {unit}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-300 font-medium w-20">Current:</span>
          <div className="flex-1 bg-gray-800 rounded h-5 relative border border-gray-700">
            <div 
              className={`${colorClasses[color as keyof typeof colorClasses]} h-full rounded`}
              style={{ width: `${currentPercent}%` }}
            />
            <span className="absolute right-2 top-0.5 text-xs text-white font-bold">{current.toFixed(0)} {unit}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorClasses = {
    "accent-blue": "text-accent-blue",
    "accent-green": "text-accent-green",
    "accent-orange": "text-accent-orange",
  };

  return (
    <div className="text-center p-2 bg-gray-800/70 rounded border border-gray-700/50">
      <div className="text-xs text-gray-300 font-medium">{label}</div>
      <div className={`text-base font-bold ${colorClasses[color as keyof typeof colorClasses]}`}>
        {value}
      </div>
    </div>
  );
}

function VisualizationCard({ title, value, trend, color }: { title: string; value: string; trend: "up" | "down"; color: string }) {
  const colorClasses = {
    "accent-blue": "text-accent-blue",
    "accent-green": "text-accent-green",
    "accent-orange": "text-accent-orange",
  };

  return (
    <div className="text-center">
      <div className="text-xs text-gray-400 mb-1">{title}</div>
      <div className={`text-lg font-bold ${colorClasses[color as keyof typeof colorClasses]}`}>
        {value}
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {trend === "down" ? "↓" : "↑"}
      </div>
    </div>
  );
}


