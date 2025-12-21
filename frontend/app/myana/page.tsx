"use client";

import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

// ============================================================================
// TYPES
// ============================================================================

interface Trajectory {
  values: Map<number, number>;
  interpolation: 'linear' | 'exponential';
  
  get(year: number): number;
}

class TrajectoryImpl implements Trajectory {
  values: Map<number, number>;
  interpolation: 'linear' | 'exponential';
  
  constructor(values: Record<number, number>, interpolation: 'linear' | 'exponential' = 'linear') {
    this.values = new Map(Object.entries(values).map(([k, v]) => [Number(k), v]));
    this.interpolation = interpolation;
  }
  
  get(year: number): number {
    const years = Array.from(this.values.keys()).sort((a, b) => a - b);
    
    // Before first year
    if (year <= years[0]) return this.values.get(years[0])!;
    
    // After last year
    if (year >= years[years.length - 1]) return this.values.get(years[years.length - 1])!;
    
    // Find surrounding years
    for (let i = 0; i < years.length - 1; i++) {
      if (year >= years[i] && year <= years[i + 1]) {
        const y1 = years[i];
        const y2 = years[i + 1];
        const v1 = this.values.get(y1)!;
        const v2 = this.values.get(y2)!;
        
        if (this.interpolation === 'exponential') {
          const t = (year - y1) / (y2 - y1);
          return v1 * Math.pow(v2 / v1, t);
        } else {
          const t = (year - y1) / (y2 - y1);
          return v1 + (v2 - v1) * t;
        }
      }
    }
    
    return this.values.get(years[0])!;
  }
}

interface OrbitalShell {
  name: string;
  altitudeKm: number;
  sunlightFraction: number;
  radiationMultiplier: number;
  latencyMs: number;
  maxSatellites: number;
  enabled: boolean;
}

interface SimulationParams {
  startYear: number;
  endYear: number;
  launchCostPerKg: Trajectory;
  launchCadence: Trajectory;
  satellitePowerKW: Trajectory;
  specificPowerWPerKg: Trajectory;
  satelliteCostPerW: Trajectory;
  satelliteLifespanYears: number;
  computeEfficiencyGFLOPSPerW: Trajectory;
  eccOverhead: number;
  radiationHardeningLevel: 'commercial' | 'space-rated' | 'rad-hard';
  radiatorEmissivity: number;
  maxOperatingTempC: number;
  radiatorMassPerM2: number;
  shells: OrbitalShell[];
  laserLinkCapacityGbps: Trajectory;
  groundStationCount: Trajectory;
  backhaulUtilization: number;
  groundPUE: number;
  groundInterconnectYears: number;
  groundCapacityFactor: number;
  targetCapacityGW: number;
}

interface YearlyResult {
  year: number;
  orbitalCostPerPFLOP: number;
  groundCostPerPFLOP: number;
  crossover: boolean;
  bindingConstraint: string;
  totalCapacityGW: number;
  radiatorUtilization: number;
  backhaulUtilization: number;
  fleetSize: number;
  launchesPerYear: number;
  totalPFLOPs: number;
}

interface SimulationResults {
  yearly: YearlyResult[];
  crossoverYear: number | null;
  bindingConstraints: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STEFAN_BOLTZMANN = 5.67e-8; // W/m²/K⁴
const T_SPACE_K = 3; // Deep space temperature
const SOLAR_CONSTANT_W_M2 = 1361; // AM0 solar constant
const SPEED_OF_LIGHT_KM_S = 299792; // km/s

// ============================================================================
// CALCULATIONS
// ============================================================================

// 1. Thermal constraint (Stefan-Boltzmann)
function maxPowerPerSatellite(radiatorAreaM2: number, tempK: number, emissivity: number): number {
  return emissivity * STEFAN_BOLTZMANN * radiatorAreaM2 * (Math.pow(tempK, 4) - Math.pow(T_SPACE_K, 4));
}

// 2. Radiator sizing (independent of solar)
function radiatorAreaRequired(heatWatts: number, tempK: number, emissivity: number): number {
  return heatWatts / (emissivity * STEFAN_BOLTZMANN * (Math.pow(tempK, 4) - Math.pow(T_SPACE_K, 4)));
}

// 3. Compute output
function computePFLOPs(powerW: number, efficiencyGFLOPSPerW: number, eccOverhead: number, utilization: number): number {
  return powerW * efficiencyGFLOPSPerW * (1 - eccOverhead) * utilization / 1e6;
}

// 4. Cost per PFLOP
function costPerPFLOP(totalCost: number, totalPFLOPs: number): number {
  if (totalPFLOPs === 0) return Infinity;
  return totalCost / totalPFLOPs;
}

// 5. Learning curves
function wrightLaw(baseCost: number, cumulativeUnits: number, learningRate: number): number {
  const b = Math.log(1 - learningRate) / Math.log(2);
  return baseCost * Math.pow(cumulativeUnits, b);
}

function mooresLaw(baseEfficiency: number, years: number, doublingTime: number): number {
  return baseEfficiency * Math.pow(2, years / doublingTime);
}

// 6. Fleet dynamics
function steadyStateFleet(targetCapacityGW: number, satellitePowerKW: number, lifespanYears: number, failureRate: number) {
  const targetCapacityW = targetCapacityGW * 1e9;
  const satellitePowerW = satellitePowerKW * 1000;
  const fleetSize = targetCapacityW / satellitePowerW;
  const endOfLifePerYear = fleetSize / lifespanYears;
  const failuresPerYear = fleetSize * failureRate;
  const replacementsPerYear = endOfLifePerYear + failuresPerYear;
  return { fleetSize, replacementsPerYear, launchesPerYear: replacementsPerYear };
}

// 7. Latency
function orbitalLatency(altitudeKm: number, hops: number = 1, switchDelayMs: number = 0.1): number {
  const upDownMs = 2 * altitudeKm / SPEED_OF_LIGHT_KM_S * 1000;
  return upDownMs + hops * switchDelayMs;
}

// 8. Ground cost calculation
function calculateGroundCost(params: SimulationParams, year: number, efficiencyGFLOPSPerW: number): number {
  // Simplified ground model: gas turbine + infrastructure
  const targetPowerW = params.targetCapacityGW * 1e9;
  
  // Capex: $13.80/W (from McCalip's model)
  const capexPerW = 13.80;
  const totalCapex = capexPerW * targetPowerW;
  
  // Opex: fuel costs
  const hoursPerYear = 8760;
  const energyMWh = params.targetCapacityGW * hoursPerYear * params.groundCapacityFactor;
  const generationMWh = energyMWh * params.groundPUE;
  const fuelCostPerMWh = 7000 * 4.30 / 1000; // 7000 BTU/kWh * $4.30/MMBtu
  const fuelCost = fuelCostPerMWh * generationMWh;
  
  // Total cost over 5 years
  const totalCost = totalCapex + fuelCost * 5;
  
  // Compute delivered (accounting for PUE)
  const computePowerW = targetPowerW / params.groundPUE; // IT power
  const totalPFLOPs = computePFLOPs(computePowerW, efficiencyGFLOPSPerW, 0, params.groundCapacityFactor) * 5; // 5 years
  
  return costPerPFLOP(totalCost, totalPFLOPs);
}

// 9. Run simulation
function runSimulation(params: SimulationParams): SimulationResults {
  const results: YearlyResult[] = [];
  let cumulativeSatellites = 0;
  
  for (let year = params.startYear; year <= params.endYear; year++) {
    const launchCost = params.launchCostPerKg.get(year);
    const efficiency = params.computeEfficiencyGFLOPSPerW.get(year);
    const satPowerKW = params.satellitePowerKW.get(year);
    const specificPower = params.specificPowerWPerKg.get(year);
    const satCostPerW = params.satelliteCostPerW.get(year);
    const laserCapacity = params.laserLinkCapacityGbps.get(year);
    const groundStations = params.groundStationCount.get(year);
    
    // Calculate per-shell metrics
    const shellResults = params.shells
      .filter(s => s.enabled)
      .map(shell => {
        // Thermal constraint
        const maxTempK = params.maxOperatingTempC + 273.15;
        const heatWatts = satPowerKW * 1000; // All power becomes heat
        const requiredRadiatorAreaM2 = radiatorAreaRequired(heatWatts, maxTempK, params.radiatorEmissivity);
        const maxPowerFromRadiator = maxPowerPerSatellite(requiredRadiatorAreaM2, maxTempK, params.radiatorEmissivity);
        const actualPowerKW = Math.min(satPowerKW, maxPowerFromRadiator / 1000);
        
        // Compute per satellite
        const powerW = actualPowerKW * 1000;
        const pflopsPerSat = computePFLOPs(powerW, efficiency, params.eccOverhead, shell.sunlightFraction);
        
        // Costs per satellite
        const massKg = powerW / specificPower;
        const launchCostPerSat = massKg * launchCost;
        const hardwareCostPerSat = powerW * satCostPerW;
        const totalCostPerSat = launchCostPerSat + hardwareCostPerSat;
        
        // Fleet sizing for this shell (distribute target capacity)
        const shellWeight = shell.enabled ? 1 : 0;
        const totalWeight = params.shells.filter(s => s.enabled).length;
        const shellTargetGW = params.targetCapacityGW * (shellWeight / totalWeight);
        const { fleetSize, launchesPerYear } = steadyStateFleet(
          shellTargetGW,
          actualPowerKW,
          params.satelliteLifespanYears,
          0.04 * shell.radiationMultiplier // Failure rate scales with radiation
        );
        
        // Backhaul capacity
        const linksPerSat = 4; // Typical
        const backhaulCapacityGbps = fleetSize * linksPerSat * laserCapacity;
        const computeOutputGbps = fleetSize * pflopsPerSat * 1e12 * 0.1 / 1e9; // 0.1 bits per FLOP
        const backhaulUtil = Math.min(1, computeOutputGbps / backhaulCapacityGbps);
        
        // Radiator utilization
        const radiatorUtil = heatWatts / maxPowerFromRadiator;
        
        return {
          shell,
          actualPowerKW,
          pflopsPerSat,
          totalCostPerSat,
          fleetSize,
          launchesPerYear,
          backhaulUtil,
          radiatorUtil,
          totalPFLOPs: pflopsPerSat * fleetSize,
          totalCost: totalCostPerSat * fleetSize,
        };
      });
    
    // Aggregate across shells
    const totalPFLOPs = shellResults.reduce((sum, s) => sum + s.totalPFLOPs, 0);
    const totalCost = shellResults.reduce((sum, s) => sum + s.totalCost, 0);
    const totalFleetSize = shellResults.reduce((sum, s) => sum + s.fleetSize, 0);
    const totalLaunches = shellResults.reduce((sum, s) => sum + s.launchesPerYear, 0);
    const avgRadiatorUtil = shellResults.reduce((sum, s) => sum + s.radiatorUtil, 0) / shellResults.length;
    const avgBackhaulUtil = shellResults.reduce((sum, s) => sum + s.backhaulUtil, 0) / shellResults.length;
    
    const orbitalCostPerPFLOP = costPerPFLOP(totalCost, totalPFLOPs);
    const groundCostPerPFLOP = calculateGroundCost(params, year, efficiency);
    
    // Identify binding constraint
    let bindingConstraint = 'none';
    if (avgRadiatorUtil > 0.95) bindingConstraint = 'thermal';
    else if (avgBackhaulUtil > 0.95) bindingConstraint = 'backhaul';
    else if (totalLaunches > params.launchCadence.get(year)) bindingConstraint = 'launch_capacity';
    else bindingConstraint = 'economic';
    
    results.push({
      year,
      orbitalCostPerPFLOP,
      groundCostPerPFLOP,
      crossover: orbitalCostPerPFLOP < groundCostPerPFLOP,
      bindingConstraint,
      totalCapacityGW: shellResults.reduce((sum, s) => sum + s.actualPowerKW * s.fleetSize / 1e6, 0),
      radiatorUtilization: avgRadiatorUtil,
      backhaulUtilization: avgBackhaulUtil,
      fleetSize: totalFleetSize,
      launchesPerYear: totalLaunches,
      totalPFLOPs,
    });
    
    cumulativeSatellites += totalFleetSize;
  }
  
  const crossoverYear = results.find(r => r.crossover)?.year || null;
  const bindingConstraints = Array.from(new Set(results.map(r => r.bindingConstraint)));
  
  return {
    yearly: results,
    crossoverYear,
    bindingConstraints,
  };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MyanaPage() {
  // Default trajectories
  const [launchCostTraj] = useState<Trajectory>(new TrajectoryImpl({
    2025: 1500,
    2030: 500,
    2035: 200,
    2040: 100,
  }, 'exponential'));
  
  const [efficiencyTraj] = useState<Trajectory>(new TrajectoryImpl({
    2025: 3.1,
    2030: 6.2,
    2035: 12.4,
    2040: 42.0,
  }, 'exponential'));
  
  const [satPowerTraj] = useState<Trajectory>(new TrajectoryImpl({
    2025: 27,
    2030: 50,
    2035: 100,
    2040: 138,
  }, 'exponential'));
  
  const [specificPowerTraj] = useState<Trajectory>(new TrajectoryImpl({
    2025: 36.5,
    2030: 50,
    2035: 75,
    2040: 100,
  }, 'linear'));
  
  const [satCostTraj] = useState<Trajectory>(new TrajectoryImpl({
    2025: 22,
    2030: 20,
    2035: 18,
    2040: 15,
  }, 'linear'));
  
  const [laserCapacityTraj] = useState<Trajectory>(new TrajectoryImpl({
    2025: 100,
    2030: 150,
    2035: 200,
    2040: 250,
  }, 'linear'));
  
  const [groundStationTraj] = useState<Trajectory>(new TrajectoryImpl({
    2025: 50,
    2030: 100,
    2035: 150,
    2040: 200,
  }, 'linear'));
  
  const [launchCadenceTraj] = useState<Trajectory>(new TrajectoryImpl({
    2025: 100,
    2030: 300,
    2035: 600,
    2040: 1200,
  }, 'exponential'));
  
  // Parameters
  const [targetCapacityGW, setTargetCapacityGW] = useState(1);
  const [satelliteLifespanYears, setSatelliteLifespanYears] = useState(6);
  const [eccOverhead, setEccOverhead] = useState(0.15);
  const [radiationHardeningLevel, setRadiationHardeningLevel] = useState<'commercial' | 'space-rated' | 'rad-hard'>('space-rated');
  const [radiatorEmissivity, setRadiatorEmissivity] = useState(0.9);
  const [maxOperatingTempC, setMaxOperatingTempC] = useState(75);
  const [radiatorMassPerM2, setRadiatorMassPerM2] = useState(3);
  const [backhaulUtilization, setBackhaulUtilization] = useState(0.8);
  const [groundPUE, setGroundPUE] = useState(1.3);
  const [groundInterconnectYears, setGroundInterconnectYears] = useState(5);
  const [groundCapacityFactor, setGroundCapacityFactor] = useState(0.85);
  
  // Orbital shells
  const [shells, setShells] = useState<OrbitalShell[]>([
    { name: 'LEO 340km', altitudeKm: 340, sunlightFraction: 0.60, radiationMultiplier: 1.2, latencyMs: 2.3, maxSatellites: 100000, enabled: false },
    { name: 'LEO 550km', altitudeKm: 550, sunlightFraction: 0.98, radiationMultiplier: 1.0, latencyMs: 3.7, maxSatellites: 500000, enabled: true },
    { name: 'LEO 1100km', altitudeKm: 1100, sunlightFraction: 0.95, radiationMultiplier: 1.5, latencyMs: 7.3, maxSatellites: 200000, enabled: false },
    { name: 'MEO 8000km', altitudeKm: 8000, sunlightFraction: 0.85, radiationMultiplier: 3.0, latencyMs: 53, maxSatellites: 50000, enabled: false },
    { name: 'MEO 20000km', altitudeKm: 20000, sunlightFraction: 0.80, radiationMultiplier: 5.0, latencyMs: 133, maxSatellites: 20000, enabled: false },
  ]);
  
  // Simulation parameters
  const params: SimulationParams = useMemo(() => ({
    startYear: 2025,
    endYear: 2040,
    launchCostPerKg: launchCostTraj,
    launchCadence: launchCadenceTraj,
    satellitePowerKW: satPowerTraj,
    specificPowerWPerKg: specificPowerTraj,
    satelliteCostPerW: satCostTraj,
    satelliteLifespanYears,
    computeEfficiencyGFLOPSPerW: efficiencyTraj,
    eccOverhead,
    radiationHardeningLevel,
    radiatorEmissivity,
    maxOperatingTempC,
    radiatorMassPerM2,
    shells,
    laserLinkCapacityGbps: laserCapacityTraj,
    groundStationCount: groundStationTraj,
    backhaulUtilization,
    groundPUE,
    groundInterconnectYears,
    groundCapacityFactor,
    targetCapacityGW,
  }), [
    launchCostTraj, launchCadenceTraj, satPowerTraj, specificPowerTraj, satCostTraj,
    satelliteLifespanYears, efficiencyTraj, eccOverhead, radiationHardeningLevel,
    radiatorEmissivity, maxOperatingTempC, radiatorMassPerM2, shells,
    laserCapacityTraj, groundStationTraj, backhaulUtilization,
    groundPUE, groundInterconnectYears, groundCapacityFactor, targetCapacityGW,
  ]);
  
  // Run simulation
  const results = useMemo(() => runSimulation(params), [params]);
  
  // Chart data
  const trajectoryData = useMemo(() => 
    results.yearly.map(r => ({
      year: r.year,
      orbital: r.orbitalCostPerPFLOP,
      ground: r.groundCostPerPFLOP,
      crossover: r.crossover,
    })), [results]
  );
  
  const constraintData = useMemo(() =>
    results.yearly.map(r => ({
      year: r.year,
      thermal: r.radiatorUtilization * 100,
      backhaul: r.backhaulUtilization * 100,
    })), [results]
  );
  
  const Slider = ({ label, value, onChange, min, max, step = 1, unit = '', help = '' }: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    help?: string;
  }) => (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-semibold text-gray-700">{label}</label>
        <span className="text-sm font-mono font-semibold text-gray-900">
          {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
      {help && <div className="text-xs text-gray-500 mt-1">{help}</div>}
    </div>
  );
  
  return (
    <div className="min-h-screen bg-white text-gray-900" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <a href="/" className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block">← Back</a>
          <h1 className="text-4xl font-bold text-gray-900 mb-3 leading-tight">
            Orbital Compute Economics:<br />
            Trajectory-Based Analysis
          </h1>
          <p className="text-lg text-gray-600">
            When does orbital compute become cost-competitive?<br />
            Model by Myana — $/PFLOP trajectory analysis (2025-2040)
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="border border-gray-300 rounded-lg p-6 bg-blue-50">
            <div className="text-sm text-gray-600 mb-1">Crossover Year</div>
            <div className="text-3xl font-bold text-gray-900 font-mono">
              {results.crossoverYear ? results.crossoverYear : 'Not in timeframe'}
            </div>
            {results.crossoverYear && (
              <div className="text-xs text-gray-500 mt-1">
                Orbital becomes cheaper than ground
              </div>
            )}
          </div>
          
          <div className="border border-gray-300 rounded-lg p-6 bg-green-50">
            <div className="text-sm text-gray-600 mb-1">2025 $/PFLOP (Orbital)</div>
            <div className="text-3xl font-bold text-gray-900 font-mono">
              ${(results.yearly[0]?.orbitalCostPerPFLOP || 0).toFixed(0)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              vs Ground: ${(results.yearly[0]?.groundCostPerPFLOP || 0).toFixed(0)}
            </div>
          </div>
          
          <div className="border border-gray-300 rounded-lg p-6 bg-purple-50">
            <div className="text-sm text-gray-600 mb-1">2040 $/PFLOP (Orbital)</div>
            <div className="text-3xl font-bold text-gray-900 font-mono">
              ${(results.yearly[results.yearly.length - 1]?.orbitalCostPerPFLOP || 0).toFixed(0)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              vs Ground: ${(results.yearly[results.yearly.length - 1]?.groundCostPerPFLOP || 0).toFixed(0)}
            </div>
          </div>
        </div>

        {/* Trajectory Chart */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Cost Trajectory: $/PFLOP (2025-2040)</h2>
          <div className="border border-gray-300 rounded-lg p-6 bg-white">
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trajectoryData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="year" 
                    stroke="#6b7280"
                    style={{ fontSize: '12px', fontFamily: 'ui-monospace, monospace' }}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    style={{ fontSize: '12px', fontFamily: 'ui-monospace, monospace' }}
                    label={{ value: '$/PFLOP', angle: -90, position: 'insideLeft', style: { fill: '#6b7280', fontSize: '12px' } }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      color: '#111827',
                      fontFamily: 'ui-monospace, monospace'
                    }}
                    formatter={(value: number) => [`$${value.toFixed(0)}/PFLOP`, '']}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', color: '#6b7280', paddingTop: '20px' }} />
                  <Line 
                    type="monotone" 
                    dataKey="ground" 
                    stroke="#ef4444" 
                    strokeWidth={3}
                    name="Ground"
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="orbital" 
                    stroke="#2563eb" 
                    strokeWidth={3}
                    name="Orbital"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Constraint Dashboard */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Binding Constraints</h2>
          <div className="border border-gray-300 rounded-lg p-6 bg-white">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={constraintData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="year" 
                    stroke="#6b7280"
                    style={{ fontSize: '12px', fontFamily: 'ui-monospace, monospace' }}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    style={{ fontSize: '12px', fontFamily: 'ui-monospace, monospace' }}
                    label={{ value: 'Utilization %', angle: -90, position: 'insideLeft', style: { fill: '#6b7280', fontSize: '12px' } }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      color: '#111827',
                      fontFamily: 'ui-monospace, monospace'
                    }}
                    formatter={(value: number) => [`${value.toFixed(1)}%`, '']}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', color: '#6b7280', paddingTop: '20px' }} />
                  <Line 
                    type="monotone" 
                    dataKey="thermal" 
                    stroke="#f59e0b" 
                    strokeWidth={2}
                    name="Radiator Utilization"
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="backhaul" 
                    stroke="#8b5cf6" 
                    strokeWidth={2}
                    name="Backhaul Utilization"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Parameters Panel */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Parameters</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* System Parameters */}
            <div className="border border-gray-300 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">System Parameters</h3>
              <Slider
                label="Target Capacity"
                value={targetCapacityGW}
                onChange={setTargetCapacityGW}
                min={0.1}
                max={10}
                step={0.1}
                unit=" GW"
              />
              <Slider
                label="Satellite Lifespan"
                value={satelliteLifespanYears}
                onChange={setSatelliteLifespanYears}
                min={3}
                max={10}
                step={1}
                unit=" years"
              />
            </div>
            
            {/* Thermal Parameters */}
            <div className="border border-gray-300 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Thermal Parameters</h3>
              <Slider
                label="Radiator Emissivity"
                value={radiatorEmissivity}
                onChange={setRadiatorEmissivity}
                min={0.7}
                max={0.98}
                step={0.01}
                help="NASA thermal handbook: 0.85-0.95"
              />
              <Slider
                label="Max Operating Temp"
                value={maxOperatingTempC}
                onChange={setMaxOperatingTempC}
                min={50}
                max={100}
                step={5}
                unit="°C"
                help="GPU junction limit: 75-85°C"
              />
              <Slider
                label="Radiator Mass"
                value={radiatorMassPerM2}
                onChange={setRadiatorMassPerM2}
                min={1}
                max={10}
                step={0.5}
                unit=" kg/m²"
                help="Thin-film: 2-5 kg/m²"
              />
            </div>
            
            {/* Compute Parameters */}
            <div className="border border-gray-300 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Compute Parameters</h3>
              <Slider
                label="ECC Overhead"
                value={eccOverhead * 100}
                onChange={(v) => setEccOverhead(v / 100)}
                min={5}
                max={25}
                step={1}
                unit="%"
                help="IBM/NASA: 10-15%"
              />
              <div className="mb-4">
                <label className="text-sm font-semibold text-gray-700 mb-2 block">Radiation Hardening</label>
                <select
                  value={radiationHardeningLevel}
                  onChange={(e) => setRadiationHardeningLevel(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="commercial">Commercial (soft)</option>
                  <option value="space-rated">Space-rated (standard)</option>
                  <option value="rad-hard">Rad-hard (full)</option>
                </select>
              </div>
            </div>
            
            {/* Ground Comparison */}
            <div className="border border-gray-300 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Ground Comparison</h3>
              <Slider
                label="Ground PUE"
                value={groundPUE}
                onChange={setGroundPUE}
                min={1.1}
                max={1.5}
                step={0.05}
                help="Industry average: 1.2-1.4"
              />
              <Slider
                label="Capacity Factor"
                value={groundCapacityFactor * 100}
                onChange={(v) => setGroundCapacityFactor(v / 100)}
                min={70}
                max={95}
                step={1}
                unit="%"
                help="Default: 85%"
              />
              <Slider
                label="Interconnect Queue"
                value={groundInterconnectYears}
                onChange={setGroundInterconnectYears}
                min={2}
                max={8}
                step={1}
                unit=" years"
                help="Berkeley Lab: 4-5 years average"
              />
            </div>
          </div>
        </section>

        {/* Orbital Shells */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Orbital Shells</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shells.map((shell, idx) => (
              <div key={idx} className={`border rounded-lg p-4 ${shell.enabled ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{shell.name}</h3>
                  <input
                    type="checkbox"
                    checked={shell.enabled}
                    onChange={(e) => {
                      const newShells = [...shells];
                      newShells[idx].enabled = e.target.checked;
                      setShells(newShells);
                    }}
                    className="w-4 h-4"
                  />
                </div>
                <div className="text-xs text-gray-600 space-y-1">
                  <div>Altitude: {shell.altitudeKm} km</div>
                  <div>Sunlight: {(shell.sunlightFraction * 100).toFixed(0)}%</div>
                  <div>Latency: {shell.latencyMs.toFixed(1)} ms</div>
                  <div>Radiation: {shell.radiationMultiplier.toFixed(1)}x</div>
                  <div>Max Sats: {shell.maxSatellites.toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Yearly Results Table */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Yearly Results</h2>
          <div className="border border-gray-300 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Year</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Orbital $/PFLOP</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Ground $/PFLOP</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Fleet Size</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Launches/yr</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Thermal Util</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Constraint</th>
                  </tr>
                </thead>
                <tbody>
                  {results.yearly.map((r, idx) => (
                    <tr key={idx} className={`border-t border-gray-200 ${r.crossover ? 'bg-green-50' : ''}`}>
                      <td className="px-4 py-3 font-mono">{r.year}</td>
                      <td className="px-4 py-3 text-right font-mono">{r.orbitalCostPerPFLOP.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right font-mono">{r.groundCostPerPFLOP.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right font-mono">{r.fleetSize.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-mono">{r.launchesPerYear.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right font-mono">{(r.radiatorUtilization * 100).toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right text-xs">{r.bindingConstraint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

