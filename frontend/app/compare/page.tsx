/**
 * ORBITAL COMPUTE COMPARISON ENGINE (Open Source Module)
 * ---------------------------------------------------
 * This component provides a standalone research-grade UI for comparing 
 * orbital vs ground-based AI infrastructure. 
 * 
 * Logic Source: lib/model/ (Physics-Based Economic Model)
 * Parity: Uses the same core engine as the main simulator.
 */

"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { computeTrajectory, generateFinalAnalysis, projectMarketPrice, MARKET_PROVIDERS, getDemandProjection, calculateMarketShare } from '../lib/model/trajectory';
import { YearParams, WorkloadType, SLAConfig, GpuHourPricing, GroundScenario, FinalModelOutput } from '../lib/model/types';
import { getStaticParams } from '../lib/model/modes/static';
import { GROUND_SCENARIOS } from '../lib/model/physicsCost';
import { useCoupledSliders } from '../lib/ui/useCoupledSliders';
import { DerivedValue } from '../components/ui/DerivedValue';
import { DerivedSlider } from '../components/ui/DerivedSlider';
import { getSliderConfig } from '../lib/ui/sliderCoupling';
import { ValidationWarnings } from '../components/ui/ValidationWarnings';
import { sanitizeFinite, sanitizeSeries } from '../lib/utils/sanitize';
import { validateAllCharts, ensureGroundData } from '../lib/utils/chartValidator';

// ============================================================================
// TYPES & HELPERS
// ============================================================================

// Helper to check if we're in development mode (works in Next.js build)
const isDevelopment = () => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
};

interface CascadeUpdate {
  parameter: string;
  newValue: any;
  reason: string;
}

interface CascadeRule {
  trigger: string;
  condition: (value: number) => boolean;
  updates: CascadeUpdate[];
  alertLevel: 'info' | 'warning' | 'error';
}

const CASCADE_RULES: CascadeRule[] = [
  {
    trigger: 'orbitalAltitude',
    condition: (alt) => alt < 600,
    updates: [
      { parameter: 'sunFraction', newValue: 0.60, reason: 'LEO orbit experiences eclipses. Terminator orbit not possible below 600km.' },
      { parameter: 'satelliteLifetimeYears', newValue: 3, reason: 'Atmospheric drag limits lifetime at this altitude.' }
    ],
    alertLevel: 'warning'
  },
  {
    trigger: 'orbitalAltitude',
    condition: (alt) => alt >= 600 && alt <= 1200,
    updates: [
      { parameter: 'sunFraction', newValue: 0.98, reason: 'Terminator orbit feasible at this altitude.' }
    ],
    alertLevel: 'info'
  },
  {
    trigger: 'orbitalAltitude',
    condition: (alt) => alt > 1200,
    updates: [
      { parameter: 'eccOverhead', newValue: 0.25, reason: 'Van Allen belt radiation requires increased shielding/redundancy.' }
    ],
    alertLevel: 'warning'
  },
  {
    trigger: 'computeDensityKW',
    condition: (kw) => kw > 50,
    updates: [
      { parameter: 'radiatorAreaPerKW', newValue: 4.5, reason: 'Higher power density requires more radiator area per kW.' }
    ],
    alertLevel: 'info'
  },
  {
    trigger: 'targetGW',
    condition: (gw) => gw > 10,
    updates: [
      { parameter: 'interconnectionDelayYears', newValue: 5, reason: 'Large-scale deployments face longer interconnection queues.' }
    ],
    alertLevel: 'warning'
  },
  {
    trigger: 'targetGW',
    condition: (gw) => gw > 50,
    updates: [
      { parameter: 'waterScarcityEnabled', newValue: true, reason: 'At this scale, water constraints become significant.' }
    ],
    alertLevel: 'error'
  },
  {
    trigger: 'launchCadence2030',
    condition: (cadence) => cadence > 500,
    updates: [
      { parameter: 'launchLearningRate', newValue: 0.20, reason: 'High volume manufacturing enables faster learning (Wright\'s Law).' }
    ],
    alertLevel: 'info'
  }
];

// ============================================================================
// COMPONENTS
// ============================================================================

const CustomWaterfallTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isOrbital = payload.some((p: any) => p.dataKey === 'orbitalPrice' || p.dataKey === 'orbital');
    const isGround = payload.some((p: any) => p.dataKey === 'groundPrice' || p.dataKey === 'ground');

    return (
      <div className="bg-white border border-gray-200 p-4 rounded-lg shadow-xl text-[10px]">
        <p className="font-bold text-gray-900 mb-2 border-b pb-1 text-xs">Year {label} Cost Breakdown</p>
        
        {isGround && data.breakdown?.ground && (
          <div className="mb-3">
            <p className="font-bold text-red-600 uppercase mb-1">Ground: {data.groundPrice ? `$${data.groundPrice.toFixed(2)}/hr` : `$${Math.round(data.ground).toLocaleString()}/yr`}</p>
            <div className="space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Hardware (Amortized):</span>
                <span className="font-mono">${(data.breakdown.ground.hardware || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Energy (Grid):</span>
                <span className="font-mono">${(data.breakdown.ground.energy || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Site/Infrastructure:</span>
                <span className="font-mono">${(data.breakdown.ground.site || 0).toLocaleString()}</span>
              </div>
              {data.groundRef?.constraintMultiplier > 1 && (
                <div className="flex justify-between gap-4 text-amber-600">
                  <span className="font-medium">Constraint Multiplier:</span>
                  <span className="font-mono">×{data.groundRef.constraintMultiplier.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {isOrbital && data.breakdown?.orbital && (
          <div>
            <p className="font-bold text-blue-600 uppercase mb-1">Orbital: {data.orbitalPrice ? `$${data.orbitalPrice.toFixed(2)}/hr` : `$${Math.round(data.orbital).toLocaleString()}/yr`}</p>
            <div className="space-y-1">
              {Object.entries(data.breakdown.orbital).map(([k, v]: [string, any]) => (
                <div key={k} className="flex justify-between gap-4">
                  <span className="text-gray-500 capitalize">{k}:</span>
                  <span className="font-mono">${Math.round(v).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
  return null;
};

function Slider({ label, value, min, max, step, unit = '', description, onChange, cascades = false }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  description?: string;
  onChange: (val: number) => void;
  cascades?: boolean;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs font-medium text-gray-700">{label}</label>
        <div className="flex items-center gap-1">
          <span className="text-sm font-mono font-bold text-blue-600">
            {unit === '%' ? (value * 100).toFixed(0) : value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-gray-500 font-medium">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
      {description && <p className="text-[10px] text-gray-500 mt-1 leading-tight">{description}</p>}
      {cascades && <div className="mt-1 text-[9px] font-bold text-amber-600 uppercase tracking-tighter">⚡ Cascades</div>}
    </div>
  );
}

function SliderGroup({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-xl p-5 bg-white shadow-sm">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">{title}</h3>
      {children}
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function ComparePage() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  // --- Parameters & State (All 43+) ---
  const [years, setYears] = useState(5);
  const [targetGW, setTargetGW] = useState(1);
  const [alerts, setAlerts] = useState<Array<{level: string, message: string}>>([]);
  
  // Scenario Toggles
  const [elonScenarioEnabled, setElonScenarioEnabled] = useState(false);
  const [globalLatencyRequirementEnabled, setGlobalLatencyRequirementEnabled] = useState(false);
  const [spaceManufacturingEnabled, setSpaceManufacturingEnabled] = useState(false);
  const [aiWinterEnabled, setAiWinterEnabled] = useState(false);
  const [smrToggleEnabled, setSmrToggleEnabled] = useState(false);
  const [fusionToggleEnabled, setFusionToggleEnabled] = useState(false);

  const [isStaticMode, setIsStaticMode] = useState(false);
  const [workloadType, setWorkloadType] = useState<WorkloadType>('inference');
  const [slaTier, setSlaTier] = useState<'basic' | 'standard' | 'premium'>('standard');
  
  // Launch Cost Trajectory
  const [launchCost2025, setLaunchCost2025] = useState(1500);
  const [launchCost2030, setLaunchCost2030] = useState(500);
  const [launchCost2035, setLaunchCost2035] = useState(200);
  const [launchCost2040, setLaunchCost2040] = useState(100);

  // Specific Power Trajectory
  const [specificPower2025, setSpecificPower2025] = useState(36.5);
  const [specificPower2030, setSpecificPower2030] = useState(100);
  const [specificPower2035, setSpecificPower2035] = useState(125);
  const [specificPower2040, setSpecificPower2040] = useState(150);

  // Moore's Law Trajectory (AI Compute Efficiency FP8)
  const [gflopsPerWattGround2025, setGflopsPerWattGround2025] = useState(2000);
  const [flopsPerWattGround2040, setFlopsPerWattGround2040] = useState(5000);
  const [flopsPerWattOrbital2025, setFlopsPerWattOrbital2025] = useState(1500);
  const [flopsPerWattOrbital2040, setFlopsPerWattOrbital2040] = useState(4500);

  // Space Constraints
  const [eccOverhead, setEccOverhead] = useState(0.15);
  const [radiatorAreaPerKW, setRadiatorAreaPerKW] = useState(3.5);
  const [orbitalAltitude, setOrbitalAltitude] = useState(1000);
  const [satelliteLifetimeYears, setSatelliteLifetimeYears] = useState(6);
  const [laserLinkCost, setLaserLinkCost] = useState(10);
  const [groundStationCount, setGroundStationCount] = useState(100);
  const [computeDensityKW, setComputeDensityKW] = useState(50);
  const [radiatorTempCState, setRadiatorTempCState] = useState(70);

  // Ground Constraints
  const [pueGround, setPueGround] = useState(1.30);
  const [pueOrbital, setPueOrbital] = useState(1.05);
  const [capacityFactorGround, setCapacityFactorGround] = useState(0.85);
  const [capacityFactorOrbital, setCapacityFactorOrbital] = useState(0.98);
  const [groundEnergyEscalationRate, setGroundEnergyEscalationRate] = useState(0.02);
  const [powerGridMultiplier, setPowerGridMultiplier] = useState(1.05);
  const [coolingMultiplier, setCoolingMultiplier] = useState(1.03);
  const [landMultiplier, setLandMultiplier] = useState(1.02);
  const [interconnectionDelayYears, setInterconnectionDelayYears] = useState(4);
  const [waterScarcityEnabled, setWaterScarcityEnabled] = useState(true);
  const [landScarcityEnabled, setLandScarcityEnabled] = useState(true);

  // Learning Curves & Economics
  const [launchLearningRate, setLaunchLearningRate] = useState(0.15);
  const [hardwareLearningRate, setHardwareLearningRate] = useState(0.15);
  const [groundLearningRate, setGroundLearningRate] = useState(0.03);
  const [launchCadence2030, setLaunchCadence2030] = useState(500);
  const [discountRateWACC, setDiscountRateWACC] = useState(0.07);
  const [opexOrbital, setOpexOrbital] = useState(0.01);
  const [opexGround, setOpexGround] = useState(0.03);
  const [carbonPricePerTon, setCarbonPricePerTon] = useState(0);
  const [gasPricePerMMBtu, setGasPricePerMMBtu] = useState(4.30);
  const [groundHeatRateBTUperKWh, setGroundHeatRateBTUperKWh] = useState(6200);

  // Satellite Power & Cost state
  const [satPower2025, setSatPower2025] = useState(100);
  const [satPower2040, setSatPower2040] = useState(500);
  const [satCost2025, setSatCost2025] = useState(22);
  const [satCost2040, setSatCost2040] = useState(15);

  // Toggles & Mechanics
  const [sunFraction, setSunFraction] = useState(0.98);
  const [cellDegradation, setCellDegradation] = useState(2.5);
  const [gpuFailureRate, setGpuFailureRate] = useState(15);
  const [nreCost, setNreCost] = useState(100);
  const [pueAdvantageEnabled, setPueAdvantageEnabled] = useState(true);
  const [uptimeAdvantageEnabled, setUptimeAdvantageEnabled] = useState(true);
  const [computeTrajectoryEnabled, setComputeTrajectoryEnabled] = useState(true);
  const [groundConstraintsEnabled, setGroundConstraintsEnabled] = useState(true);
  const [launchDeclineEnabled, setLaunchDeclineEnabled] = useState(true);
  const [radiationOverheadEnabled, setRadiationOverheadEnabled] = useState(true);
  const [thermalMassEnabled, setThermalMassEnabled] = useState(true);
  const [spaceTrafficEnabled, setSpaceTrafficEnabled] = useState(false);
  const [useRadHardChips, setUseRadHardChips] = useState(false);
  const [groundScenario, setGroundScenario] = useState<any>('constrained');
  const [smrMitigationEnabled, setSmrMitigationEnabled] = useState(false);

  // Deployable Radiators
  const [deployableRadiatorsEnabled, setDeployableRadiatorsEnabled] = useState(true);
  const [bodyMountedAreaM2, setBodyMountedAreaM2] = useState(25);
  const [deployableArea2025M2, setDeployableArea2025M2] = useState(75);
  const [deployableArea2040M2, setDeployableArea2040M2] = useState(400);
  const [deployableMassPerM2Kg, setDeployableMassPerM2Kg] = useState(2.5);
  const [deployableCostPerM2Usd, setDeployableCostPerM2Usd] = useState(500);
  const [deploymentFailureRate, setDeploymentFailureRate] = useState(0.02);

  // Edge Inference Mode
  const [edgeInferenceEnabled, setEdgeInferenceEnabled] = useState(false);
  const [inferenceChipW, setInferenceChipW] = useState(30);
  const [inferenceChipCostUsd, setInferenceChipCostUsd] = useState(2000);
  const [inferenceChipTopsInt8, setInferenceChipTopsInt8] = useState(100);
  const [sensorPayloadW, setSensorPayloadW] = useState(100);
  const [sensorPayloadCostUsd, setSensorPayloadCostUsd] = useState(100000);
  const [sensorPayloadMassKg, setSensorPayloadMassKg] = useState(30);
  const [inferencesPerSecond, setInferencesPerSecond] = useState(20);
  const [outputBandwidthKbps, setOutputBandwidthKbps] = useState(50);
  const [edgeChipRadiationTolerance, setEdgeChipRadiationTolerance] = useState(0.85);
  const [edgeChipFailureRate, setEdgeChipFailureRate] = useState(0.05);
  const [satelliteBusCostUsd, setSatelliteBusCostUsd] = useState(50000);
  const [groundDownlinkCostPerGB, setGroundDownlinkCostPerGB] = useState(0.30);
  const [groundProcessingCostPerInference, setGroundProcessingCostPerInference] = useState(0.0005);
  const [latencyPenaltyMultiplier, setLatencyPenaltyMultiplier] = useState(2.0);
  const [baseDemandBillionInferences2025, setBaseDemandBillionInferences2025] = useState(50);
  const [demandGrowthRate, setDemandGrowthRate] = useState(0.30);
  const [appEarthObs, setAppEarthObs] = useState(0.4);
  const [appMaritime, setAppMaritime] = useState(0.25);
  const [appDefense, setAppDefense] = useState(0.2);
  const [appInfrastructure, setAppInfrastructure] = useState(0.15);

  const setters: Record<string, (v: any) => void> = {
    setLaunchCost2025, setLaunchCost2030, setLaunchCost2035, setLaunchCost2040,
    setSpecificPower2025, setSpecificPower2030, setSpecificPower2035, setSpecificPower2040,
    setGflopsPerWattGround2025, setFlopsPerWattGround2040, setFlopsPerWattOrbital2025, setFlopsPerWattOrbital2040,
    setEccOverhead, setRadiatorAreaPerKW, setOrbitalAltitude, setSatelliteLifetimeYears, setComputeDensityKW,
    setPueGround, setPueOrbital, setCapacityFactorGround, setCapacityFactorOrbital, setGroundEnergyEscalationRate,
    setPowerGridMultiplier, setCoolingMultiplier, setLandMultiplier, setInterconnectionDelayYears,
    setWaterScarcityEnabled, setLandScarcityEnabled, setLaunchLearningRate, setHardwareLearningRate,
    setGroundLearningRate, setLaunchCadence2030, setDiscountRateWACC, setOpexOrbital, setOpexGround,
    setCarbonPricePerTon, setGasPricePerMMBtu, setGroundHeatRateBTUperKWh, setSunFraction,
    setCellDegradation, setGpuFailureRate, setNreCost, setPueAdvantageEnabled, setUptimeAdvantageEnabled,
    setComputeTrajectoryEnabled, setGroundConstraintsEnabled, setLaunchDeclineEnabled,
    setRadiationOverheadEnabled, setThermalMassEnabled, setTargetGW,
    setSatPower2025, setSatPower2040, setSatCost2025, setSatCost2040,
    setSpaceTrafficEnabled,
    setDeployableRadiatorsEnabled, setBodyMountedAreaM2, setDeployableArea2025M2,
    setDeployableArea2040M2, setDeployableMassPerM2Kg, setDeployableCostPerM2Usd,
    setDeploymentFailureRate,
    setEdgeInferenceEnabled, setInferenceChipW, setInferenceChipCostUsd,
    setInferenceChipTopsInt8, setSensorPayloadW, setSensorPayloadCostUsd,
    setSensorPayloadMassKg, setInferencesPerSecond, setOutputBandwidthKbps,
    setEdgeChipRadiationTolerance, setEdgeChipFailureRate,
    setSatelliteBusCostUsd, setGroundDownlinkCostPerGB, setGroundProcessingCostPerInference,
    setLatencyPenaltyMultiplier, setBaseDemandBillionInferences2025, setDemandGrowthRate,
    setAppEarthObs, setAppMaritime, setAppDefense, setAppInfrastructure,
    setGroundScenario, setSmrMitigationEnabled, setWorkloadType
  };

  // Coupled sliders for physical consistency (initialized after all state)
  const coupledSliders = useCoupledSliders({
    initialValues: {
      targetGW,
      flopsPerWattOrbital2025,
      specificPower2025,
      launchCost2025,
      computeDensityKW,
      radiatorTempC: radiatorTempCState,
    },
    allParams: {
      // Additional params for calculations
    },
    onValidationChange: (warnings) => {
      // Update alerts with validation warnings
      const newAlerts = warnings.map(w => ({
        level: w.type,
        message: w.message + (w.suggestion ? ` (${w.suggestion})` : ''),
      }));
      setAlerts(prev => [...prev, ...newAlerts].slice(-10));
    },
  });

  const updateParameter = (param: string, value: any) => {
    const setterKey = `set${param.charAt(0).toUpperCase()}${param.slice(1)}`;
    const setter = setters[setterKey];
    if (setter) setter(value);
    
    // Update coupled sliders for key parameters
    const coupledParams: Record<string, string> = {
      targetGW: 'targetGW',
      flopsPerWattOrbital2025: 'flopsPerWattOrbital2025',
      specificPower2025: 'specificPower2025',
      launchCost2025: 'launchCost2025',
      computeDensityKW: 'computeDensityKW',
      radiatorTempCState: 'radiatorTempC',
    };
    if (coupledParams[param]) {
      coupledSliders.updateValue(coupledParams[param], Number(value));
    }
    
    const newAlerts: Array<{level: string, message: string}> = [];
    CASCADE_RULES.forEach(rule => {
      if (rule.trigger === param && rule.condition(Number(value))) {
        rule.updates.forEach(update => {
          const updateSetterKey = `set${update.parameter.charAt(0).toUpperCase()}${update.parameter.slice(1)}`;
          const updateSetter = setters[updateSetterKey];
          if (updateSetter) {
            updateSetter(update.newValue);
            newAlerts.push({ level: rule.alertLevel, message: `${update.parameter} updated: ${update.reason}` });
          }
        });
      }
    });
    if (newAlerts.length > 0) {
      setAlerts(prev => [...prev, ...newAlerts].slice(-5));
    }
  };

  const getParamsByYear = useCallback((year: number): YearParams => {
    const interpolate = (values: Record<number, number>, year: number, type: 'linear' | 'exponential' = 'linear') => {
      const entries = Object.entries(values).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]);
      if (year <= entries[0][0]) return entries[0][1];
      if (year >= entries[entries.length - 1][0]) return entries[entries.length - 1][1];
      for (let i = 0; i < entries.length - 1; i++) {
        if (year >= entries[i][0] && year <= entries[i + 1][0]) {
          const t = (year - entries[i][0]) / (entries[i + 1][0] - entries[i][0]);
          if (type === 'exponential') return entries[i][1] * Math.pow(entries[i + 1][1] / entries[i][1], t);
          return entries[i][1] + (entries[i + 1][1] - entries[i][1]) * t;
        }
      }
      return entries[0][1];
    };

    return {
      year,
      isStaticMode,
      spaceTrafficEnabled,
      launchCostKg: interpolate({ 2025: launchCost2025, 2030: launchCost2030, 2035: launchCost2035, 2040: launchCost2040 }, year, 'exponential'),
      specificPowerWKg: interpolate({ 2025: specificPower2025, 2030: specificPower2030, 2035: specificPower2035, 2040: specificPower2040 }, year, 'linear'),
      // CRITICAL FIX: Parameters are ALREADY in GFLOPS/W (not FLOPS/W)
      // No unit conversion - treat input as effective GFLOPS/W directly
      groundEffectiveGflopsPerW_2025: gflopsPerWattGround2025, // UI value is GFLOPS/W (e.g., 2000 = 2000 GFLOPS/W)
      gflopsPerWattGround2025: gflopsPerWattGround2025, // Standardized parameter name
      orbitEffectiveGflopsPerW_2025: flopsPerWattOrbital2025, // UI value is GFLOPS/W (e.g., 1500 = 1500 GFLOPS/W)
      // Legacy names for backward compatibility (model will use these as fallback)
      flopsPerWattGround: computeTrajectoryEnabled ? (() => {
        // Moore's Law: 15% annual improvement until 2040, then 5% (saturation)
        const base2025 = gflopsPerWattGround2025;
        const saturationYear = 2040;
        if (year <= saturationYear) {
          const yearsFromBase = year - 2025;
          return base2025 * Math.pow(1.15, yearsFromBase);
        } else {
          const preSaturation = base2025 * Math.pow(1.15, saturationYear - 2025);
          const postSaturationYears = year - saturationYear;
          return preSaturation * Math.pow(1.05, postSaturationYears);
        }
      })() : gflopsPerWattGround2025,
      flopsPerWattOrbital: computeTrajectoryEnabled ? (() => {
        // Moore's Law: 15% annual improvement until 2040, then 5% (saturation)
        const base2025 = flopsPerWattOrbital2025;
        const saturationYear = 2040;
        if (year <= saturationYear) {
          const yearsFromBase = year - 2025;
          return base2025 * Math.pow(1.15, yearsFromBase);
        } else {
          const preSaturation = base2025 * Math.pow(1.15, saturationYear - 2025);
          const postSaturationYears = year - saturationYear;
          return preSaturation * Math.pow(1.05, postSaturationYears);
        }
      })() : flopsPerWattOrbital2025,
      orbitalAltitude,
      pueGround,
      pueOrbital,
      capacityFactorGround,
      capacityFactorOrbital,
      targetGW: getDemandProjection(year), // Use demand projection (450 GW by 2040)
      satellitePowerKW: interpolate({ 2025: satPower2025, 2040: satPower2040 }, year, 'exponential'),
      satelliteCostPerW: interpolate({ 2025: satCost2025, 2040: satCost2040 }, year, 'linear'),
      sunFraction,
      cellDegradation,
      gpuFailureRate,
      nreCost: nreCost * 1e6,
      eccOverhead,
      radiatorAreaM2: computeDensityKW * radiatorAreaPerKW,
      radiatorTempC: 97,
      groundConstraintsEnabled,
      useRegionalGroundModel: false,  // DISABLED - regional model broken, use constraint multiplier
      useCorrectedThermal: true,     // Use corrected thermal physics (2.7x fix)
      useCorrectedSpecificPower: true, // Use corrected system-level specific power
      powerGridMultiplier,
      coolingMultiplier,
      waterScarcityEnabled,
      landScarcityEnabled,
      radiationOverheadEnabled,
      deployableRadiatorsEnabled,
      bodyMountedAreaM2,
      deployableArea2025M2,
      deployableArea2040M2,
      deployableMassPerM2Kg,
      deployableCostPerM2Usd,
      deploymentFailureRate,
      useRadHardChips,
      groundScenario,
      smrMitigationEnabled,
      workloadType,
      elonScenarioEnabled,
      globalLatencyRequirementEnabled,
      spaceManufacturingEnabled,
      aiWinterEnabled,
      smrToggleEnabled,
      fusionToggleEnabled,
      edgeInference: {
        enabled: edgeInferenceEnabled,
        inferenceChipW,
        inferenceChipCostUsd,
        inferenceChipTopsInt8,
        sensorPayloadW,
        sensorPayloadCostUsd,
        sensorPayloadMassKg,
        inferencesPerSecond,
        outputBandwidthKbps,
        edgeChipRadiationTolerance,
        edgeChipFailureRate,
        satelliteLifetimeYears,
        satelliteBusCostUsd,
        groundDownlinkCostPerGB,
        groundProcessingCostPerInference,
        latencyPenaltyMultiplier,
        baseDemandBillionInferences2025,
        demandGrowthRate,
        applications: {
          earthObservation: appEarthObs,
          maritime: appMaritime,
          defense: appDefense,
          infrastructure: appInfrastructure
        }
      }
    };
  }, [
    isStaticMode, spaceTrafficEnabled, launchCost2025, launchCost2030, launchCost2035, launchCost2040,
    specificPower2025, specificPower2030, specificPower2035, specificPower2040,
    satPower2025, satPower2040, satCost2025, satCost2040,
    computeTrajectoryEnabled, gflopsPerWattGround2025, flopsPerWattGround2040,
    flopsPerWattOrbital2025, flopsPerWattOrbital2040, orbitalAltitude,
    pueGround, pueOrbital, capacityFactorGround, capacityFactorOrbital,
    targetGW, sunFraction, cellDegradation, gpuFailureRate, nreCost,
    groundScenario, smrMitigationEnabled,
    eccOverhead, computeDensityKW, radiatorAreaPerKW, groundConstraintsEnabled,
    powerGridMultiplier, coolingMultiplier, waterScarcityEnabled, landScarcityEnabled,
    radiationOverheadEnabled, deployableRadiatorsEnabled, bodyMountedAreaM2,
    deployableArea2025M2, deployableArea2040M2, deployableMassPerM2Kg,
    deployableCostPerM2Usd, deploymentFailureRate,
    useRadHardChips, workloadType,
    edgeInferenceEnabled, inferenceChipW, inferenceChipCostUsd,
    inferenceChipTopsInt8, sensorPayloadW, sensorPayloadCostUsd,
    sensorPayloadMassKg, inferencesPerSecond, outputBandwidthKbps,
    edgeChipRadiationTolerance, edgeChipFailureRate,
    satelliteBusCostUsd, groundDownlinkCostPerGB, groundProcessingCostPerInference,
    latencyPenaltyMultiplier, baseDemandBillionInferences2025, demandGrowthRate,
    appEarthObs, appMaritime, appDefense, appInfrastructure
  ]);

  const finalAnalysis = useMemo(() => {
    const trajectory = computeTrajectory({
      mode: isStaticMode ? 'STATIC' : 'DYNAMIC',
      paramsByYear: getParamsByYear
    });

    const staticData = computeTrajectory({ mode: 'STATIC', paramsByYear: (y) => getStaticParams(y) });
    const trajectoryWithStatic = trajectory.map((d, i) => {
      const staticLcoe = staticData[i]?.orbit?.lcoePerMwh ?? 0;
      return {
        ...d,
        staticLcoe,
        breakdown: {
          ground: {
            hardware: d.ground.hardwareCapexPerPflopYear,
            energy: d.ground.energyCostPerPflopYear,
            site: d.ground.siteCostPerPflopYear
          },
          orbital: d.orbit.hybridBreakdown
        },
        groundRef: d.ground
      };
    });

    return generateFinalAnalysis({
      mode: isStaticMode ? 'STATIC' : 'DYNAMIC',
      paramsByYear: getParamsByYear
    }, trajectoryWithStatic);
  }, [getParamsByYear, isStaticMode]);

  // CRITICAL: Ensure ground data is always present (even if orbital is infeasible)
  const trajectoryData = useMemo(() => {
    const data = finalAnalysis.trajectory.map(d => ensureGroundData(d));
    
    // Validate chart data in dev mode
    if (isDevelopment()) {
      const validationResults = data.flatMap(d => 
        validateAllCharts(d, 'compare-page', d.year)
      );
      const invalidCharts = validationResults.filter(r => !r.valid);
      if (invalidCharts.length > 0) {
        console.warn('[CHART VALIDATION] Missing required data paths:', invalidCharts);
      }
    }
    
    return data;
  }, [finalAnalysis.trajectory]);
  
  const crossoverYear = finalAnalysis.analysis.crossover.year;

  const sensitivityDrivers = useMemo(() => {
    return finalAnalysis.analysis.sensitivity.sensitivities.map(s => ({
      name: s.parameter,
      impact: s.impact.charAt(0).toUpperCase() + s.impact.slice(1)
    }));
  }, [finalAnalysis]);

  const validations = useMemo(() => {
    return finalAnalysis.validation.allChecks.map(c => ({
      name: c.name,
      check: () => c.passed,
      expected: c.expected || 'Passed',
      actual: typeof c.value === 'number' ? c.value.toFixed(3) : String(c.value),
      severity: 'error' as const,
      passed: c.passed
    }));
  }, [finalAnalysis]);

  const handleExportDebug = useCallback(() => {
    const exportData = {
      metadata: { timestamp: new Date().toISOString(), version: "4.0.0" },
      parameters: { years, targetGW, launchCost2025, specificPower2025, gflopsPerWattGround2025, workloadType, slaTier },
      trajectory: trajectoryData
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gpu_hour_analysis_${Date.now()}.json`;
    a.click();
  }, [trajectoryData, years, targetGW, launchCost2025, specificPower2025, gflopsPerWattGround2025, workloadType, slaTier]);

  if (!isMounted) return <div className="min-h-screen bg-white" />;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <a href="/" className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block">← Back</a>
          <div className="flex items-start justify-between mb-3">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-3 leading-tight">GPU Pricing & SLA: Orbital vs Ground</h1>
              <p className="text-lg text-gray-600 max-w-3xl">Transforming abstract $/PFLOP-year into market-comparable $/GPU-hour with SLA tiers and inference token pricing.</p>
            </div>
            <div className="text-right ml-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs font-mono">
                <div className="text-blue-900 font-semibold">v2fb6194</div>
                <div className="text-blue-600">2025-12-19</div>
                <div className="text-blue-500 mt-1">Scarcity Rent</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Market Dashboard */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          <div className="bg-blue-900 text-white rounded-xl p-6 shadow-xl text-center border-b-4 border-blue-500">
            <p className="text-blue-300 text-[10px] font-black uppercase tracking-widest mb-1">Crossover Year</p>
            <p className="text-5xl font-black">{crossoverYear || 'Never'}</p>
            <p className="text-[10px] text-blue-400 mt-2">({slaTier.toUpperCase()} SLA)</p>
          </div>
          
          {/* Orbital Metrics */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 shadow-sm">
            <p className="text-blue-600 text-[10px] font-black uppercase tracking-widest mb-3 text-center">ORBITAL (2034)</p>
            <div className="space-y-3">
              <div className="text-center">
                <p className="text-gray-500 text-[9px] font-bold uppercase mb-1">$/GPU-Hour</p>
                <p className="text-2xl font-black text-blue-600">${trajectoryData.find(d => d.year === 2034)?.orbit.gpuHourPricing[slaTier].pricePerGpuHour.toFixed(2) || 'N/A'}/hr</p>
                <p className="text-[9px] text-gray-400 mt-1">({slaTier.toUpperCase()} SLA)</p>
              </div>
              <div className="text-center border-t border-blue-200 pt-3">
                <p className="text-gray-500 text-[9px] font-bold uppercase mb-1">$/PFLOP-Year</p>
                <p className="text-2xl font-black text-indigo-600">${(trajectoryData.find(d => d.year === 2034)?.orbit.totalCostPerPflopYear || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
          </div>
          
          {/* Ground Metrics */}
          <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-6 shadow-sm">
            <p className="text-orange-600 text-[10px] font-black uppercase tracking-widest mb-3 text-center">GROUND (2034)</p>
            <div className="space-y-3">
              <div className="text-center">
                <p className="text-gray-500 text-[9px] font-bold uppercase mb-1">$/GPU-Hour</p>
                <p className="text-2xl font-black text-orange-600">${trajectoryData.find(d => d.year === 2034)?.ground.gpuHourPricing[slaTier].pricePerGpuHour.toFixed(2) || 'N/A'}/hr</p>
                <p className="text-[9px] text-gray-400 mt-1">({slaTier.toUpperCase()} SLA)</p>
              </div>
              <div className="text-center border-t border-orange-200 pt-3">
                <p className="text-gray-500 text-[9px] font-bold uppercase mb-1">$/PFLOP-Year</p>
                <p className="text-2xl font-black text-red-600">${(trajectoryData.find(d => d.year === 2034)?.ground.totalCostPerPflopYear || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
          </div>
        </section>
        
        {/* Additional Metrics Row */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-center">
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1">Llama 70B Inference</p>
            <p className="text-3xl font-black text-cyan-600">${(trajectoryData.find(d => d.year === 2034)?.orbit.tokenPricing.llama70B.costPer1kTokens || 0).toFixed(5)}</p>
            <p className="text-[10px] text-gray-500 mt-2">Per 1,000 Tokens (Orbital)</p>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-xl p-6 shadow-sm text-center">
            <p className="text-green-600 text-[10px] font-black uppercase tracking-widest mb-1">Market Position</p>
            <p className="text-xl font-bold text-green-800">{trajectoryData.find(d => d.year === 2034)?.crossoverDetails?.marketPosition || 'N/A'}</p>
            <p className="text-[10px] text-green-600 mt-2">vs Cloud Providers</p>
          </div>
        </section>

        {/* Workload & SLA Selectors */}
        <section className="mb-12 flex flex-wrap gap-8 items-center justify-center border border-gray-100 rounded-2xl p-6 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Workload Type:</span>
            <div className="flex bg-white rounded-lg p-1 border border-gray-200">
              {(['training', 'inference', 'mixed'] as WorkloadType[]).map(t => (
                <button 
                  key={t}
                  onClick={() => setWorkloadType(t)}
                  className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${workloadType === t ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">SLA Tier:</span>
            <div className="flex bg-white rounded-lg p-1 border border-gray-200">
              {(['basic', 'standard', 'premium'] as const).map(t => (
                <button 
                  key={t}
                  onClick={() => setSlaTier(t)}
                  className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${slaTier === t ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Charts Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
          <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm relative">
            <h3 className="text-lg font-black mb-1">GPU-Hour Pricing ({slaTier.toUpperCase()} SLA)</h3>
            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-6">Market Benchmark: $/Hour per H100-Equivalent</p>
            {(() => {
              // CRITICAL: Sanitize GPU-hour values to prevent chart pollution from single insane year
              const clampGpuHour = (x: any) =>
                sanitizeFinite(x, { min: 0.01, max: 100, fallback: null });
              
              const chartData = trajectoryData.map(d => ({
                year: d.year,
                orbitalPrice: clampGpuHour(d.orbit?.gpuHourPricing?.[slaTier]?.pricePerGpuHour),
                groundPrice: clampGpuHour(d.ground?.gpuHourPricing?.[slaTier]?.pricePerGpuHour),
                aws: 4.50,
                coreweave: 2.23,
                breakdown: {
                  orbital: d.orbit?.gpuHourPricing?.[slaTier]?.costBreakdown,
                  ground: d.ground?.gpuHourPricing?.[slaTier]?.costBreakdown
                }
              }));
              
              // Explicitly set YAxis domain from validated values (so nulls don't confuse)
              const vals = chartData.flatMap(d => [d.orbitalPrice, d.groundPrice, d.aws, d.coreweave]).filter((v): v is number => typeof v === 'number');
              const yMin = vals.length ? Math.min(...vals) : 0;
              const yMax = vals.length ? Math.max(...vals) : 10;
              const yDomain: [number, number] = [Math.max(0, yMin * 0.9), yMax * 1.1];
              
              return (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} domain={yDomain} label={{ value: '$/GPU-Hour', angle: -90, position: 'insideLeft', style: { fontSize: '10px', fill: '#64748b', fontWeight: 700 } }} />
                      <Tooltip content={<CustomWaterfallTooltip />} />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 700, paddingBottom: '20px' }} />
                      <Line type="monotone" dataKey="orbitalPrice" stroke="#2563eb" strokeWidth={4} dot={false} name="Orbital GPU-Hour" />
                      <Line type="monotone" dataKey="groundPrice" stroke="#ef4444" strokeWidth={2} dot={false} name="Ground (SMR/Grid)" />
                      <Line type="monotone" dataKey="aws" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} dot={false} name="AWS H100 ($4.50)" />
                      <Line type="monotone" dataKey="coreweave" stroke="#64748b" strokeDasharray="3 3" strokeWidth={2} dot={false} name="CoreWeave ($2.23)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}
          </div>

          <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm">
            <h3 className="text-lg font-black mb-1">Inference Cost (Llama 70B)</h3>
            <p className="text-[10px] text-cyan-600 uppercase font-bold tracking-widest mb-6">Market Benchmark: $/1K Tokens</p>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trajectoryData.map(d => ({
                  year: d.year,
                  orbitalTokens: d.orbit.tokenPricing.llama70B.costPer1kTokens,
                  groundTokens: d.ground.tokenPricing.llama70B.costPer1kTokens,
                  gpt4o: 0.015,
                  selfHosted: 0.001
                }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                  <YAxis scale="log" domain={['auto', 'auto']} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <Tooltip 
                    contentStyle={{ fontSize: '10px', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(v: any) => v !== undefined && isFinite(v) ? [`$${v.toFixed(6)}`, ''] : ['', '']}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 700, paddingBottom: '20px' }} />
                  <Line type="monotone" dataKey="orbitalTokens" stroke="#0891b2" strokeWidth={4} dot={false} name="Orbital Tokens" />
                  <Line type="monotone" dataKey="groundTokens" stroke="#f97316" strokeWidth={2} dot={false} name="Ground Tokens" />
                  <Line type="monotone" dataKey="gpt4o" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} dot={false} name="GPT-4o ($0.015)" />
                  <Line type="monotone" dataKey="selfHosted" stroke="#64748b" strokeDasharray="3 3" strokeWidth={2} dot={false} name="Self-Hosted ($0.001)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* --- ALL SLIDERS RESTORED --- */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          
          <SliderGroup title="Launch Trajectory ($/kg)">
            <Slider label="2025 Launch" value={launchCost2025} min={500} max={2500} step={50} onChange={(v) => updateParameter('launchCost2025', v)} />
            <Slider label="2030 Launch" value={launchCost2030} min={100} max={1500} step={50} onChange={(v) => updateParameter('launchCost2030', v)} />
            <Slider label="2035 Launch" value={launchCost2035} min={50} max={800} step={25} onChange={(v) => updateParameter('launchCost2035', v)} />
            <Slider label="2040 Launch" value={launchCost2040} min={10} max={500} step={10} onChange={(v) => updateParameter('launchCost2040', v)} />
            <Slider label="Learning Rate" value={launchLearningRate} min={0.05} max={0.30} step={0.01} unit="%" onChange={(v) => updateParameter('launchLearningRate', v)} />
            <Slider label="Cadence (2030)" value={launchCadence2030} min={100} max={5000} step={100} unit=" sats" onChange={(v) => updateParameter('launchCadence2030', v)} />
          </SliderGroup>

          <SliderGroup title="Specific Power (W/kg)">
            <Slider label="2025 Spec Power" value={specificPower2025} min={30} max={80} step={1} onChange={(v) => updateParameter('specificPower2025', v)} />
            <Slider label="2030 Spec Power" value={specificPower2030} min={50} max={150} step={5} onChange={(v) => updateParameter('specificPower2030', v)} />
            <Slider label="2035 Spec Power" value={specificPower2035} min={80} max={250} step={5} onChange={(v) => updateParameter('specificPower2035', v)} />
            <Slider label="2040 Spec Power" value={specificPower2040} min={100} max={400} step={10} onChange={(v) => updateParameter('specificPower2040', v)} />
            <Slider label="Density (kW)" value={computeDensityKW} min={5} max={500} step={5} unit=" kW" onChange={(v) => updateParameter('computeDensityKW', v)} />
            <Slider label="Sat Lifetime" value={satelliteLifetimeYears} min={3} max={15} step={1} unit=" yr" onChange={(v) => updateParameter('satelliteLifetimeYears', v)} />
          </SliderGroup>

          <SliderGroup title="AI Efficiency (G/W)">
            <Slider label="Ground 2025" value={gflopsPerWattGround2025} min={500} max={5000} step={100} onChange={(v) => updateParameter('gflopsPerWattGround2025', v)} />
            <Slider label="Ground 2040" value={flopsPerWattGround2040} min={1000} max={15000} step={500} onChange={(v) => updateParameter('flopsPerWattGround2040', v)} />
            <Slider label="Orbital 2025" value={flopsPerWattOrbital2025} min={500} max={5000} step={100} onChange={(v) => updateParameter('flopsPerWattOrbital2025', v)} />
            <Slider label="Orbital 2040" value={flopsPerWattOrbital2040} min={1000} max={10000} step={500} onChange={(v) => updateParameter('flopsPerWattOrbital2040', v)} />
            <Slider label="Learning Rate" value={hardwareLearningRate} min={0.05} max={0.25} step={0.01} unit="%" onChange={(v) => updateParameter('hardwareLearningRate', v)} />
          </SliderGroup>

          <SliderGroup title="Ground Infrastructure">
            <Slider label="Ground PUE" value={pueGround} min={1.1} max={1.6} step={0.01} onChange={(v) => updateParameter('pueGround', v)} />
            <Slider label="Energy Escalation" value={groundEnergyEscalationRate} min={0} max={0.10} step={0.005} unit="%" onChange={(v) => updateParameter('groundEnergyEscalationRate', v)} />
            <Slider label="Grid Multiplier" value={powerGridMultiplier} min={1.0} max={1.25} step={0.01} onChange={(v) => updateParameter('powerGridMultiplier', v)} />
            <Slider label="Cooling Multiplier" value={coolingMultiplier} min={1.0} max={1.15} step={0.01} onChange={(v) => updateParameter('coolingMultiplier', v)} />
            <Slider label="Interconnect Delay" value={interconnectionDelayYears} min={1} max={10} step={0.5} unit=" yr" onChange={(v) => updateParameter('interconnectionDelayYears', v)} />
            <Slider label="Learning Rate" value={groundLearningRate} min={0.01} max={0.10} step={0.01} unit="%" onChange={(v) => updateParameter('groundLearningRate', v)} />
          </SliderGroup>

          <SliderGroup title="Orbital Constraints">
            <Slider label="Orbital PUE" value={pueOrbital} min={1.01} max={1.20} step={0.01} onChange={(v) => updateParameter('pueOrbital', v)} />
            <Slider label="Uptime (CF)" value={capacityFactorOrbital} min={0.8} max={0.99} step={0.01} unit="%" onChange={(v) => updateParameter('capacityFactorOrbital', v)} />
            <Slider label="Altitude" value={orbitalAltitude} min={300} max={2000} step={50} unit=" km" onChange={(v) => updateParameter('orbitalAltitude', v)} cascades={true} />
            <Slider label="Radiation ECC" value={eccOverhead} min={0.05} max={0.40} step={0.01} unit="%" onChange={(v) => updateParameter('eccOverhead', v)} />
            <Slider label="Radiator Temp" value={radiatorTempCState} min={50} max={120} step={5} unit=" °C" onChange={(v) => { setRadiatorTempCState(v); coupledSliders.updateValue('radiatorTempC', v); }} />
            <Slider label="Radiator Req." value={radiatorAreaPerKW} min={1} max={10} step={0.1} unit=" m²/kW" onChange={(v) => updateParameter('radiatorAreaPerKW', v)} />
            <Slider label="Laser Link ($M)" value={laserLinkCost} min={1} max={50} step={1} onChange={(v) => updateParameter('laserLinkCost', v)} />
            <Slider label="Ground Stations" value={groundStationCount} min={10} max={500} step={10} onChange={(v) => updateParameter('groundStationCount', v)} />
          </SliderGroup>

          <SliderGroup title="Deployable Thermal">
            <Slider label="Body Mounted" value={bodyMountedAreaM2} min={5} max={100} step={5} unit=" m²" onChange={(v) => updateParameter('bodyMountedAreaM2', v)} />
            <Slider label="Deployable 2025" value={deployableArea2025M2} min={0} max={100} step={5} unit=" m²" onChange={(v) => updateParameter('deployableArea2025M2', v)} />
            <Slider label="Deployable 2040" value={deployableArea2040M2} min={0} max={300} step={10} unit=" m²" onChange={(v) => updateParameter('deployableArea2040M2', v)} />
            <Slider label="Mass per m²" value={deployableMassPerM2Kg} min={0.5} max={10} step={0.5} unit=" kg" onChange={(v) => updateParameter('deployableMassPerM2Kg', v)} />
            <Slider label="Cost per m²" value={deployableCostPerM2Usd} min={100} max={5000} step={100} unit=" $" onChange={(v) => updateParameter('deployableCostPerM2Usd', v)} />
            <Slider label="Fail Rate" value={deploymentFailureRate} min={0} max={0.10} step={0.005} unit="%" onChange={(v) => updateParameter('deploymentFailureRate', v)} />
          </SliderGroup>

          <SliderGroup title="Edge Inference AI">
            <Slider label="Chip Power (W)" value={inferenceChipW} min={5} max={150} step={5} onChange={(v) => updateParameter('inferenceChipW', v)} />
            <Slider label="Chip Cost ($)" value={inferenceChipCostUsd} min={50} max={5000} step={50} onChange={(v) => updateParameter('inferenceChipCostUsd', v)} />
            <Slider label="Sensor Cost ($k)" value={sensorPayloadCostUsd/1000} min={1} max={500} step={5} onChange={(v) => updateParameter('sensorPayloadCostUsd', v*1000)} />
            <Slider label="Downlink $/GB" value={groundDownlinkCostPerGB} min={0.05} max={2.0} step={0.05} onChange={(v) => updateParameter('groundDownlinkCostPerGB', v)} />
            <Slider label="Market Growth" value={demandGrowthRate} min={0.05} max={1.0} step={0.05} unit="%" onChange={(v) => updateParameter('demandGrowthRate', v)} />
          </SliderGroup>

          <SliderGroup title="Economic Constants">
            <Slider label="WACC Rate" value={discountRateWACC} min={0.03} max={0.20} step={0.005} unit="%" onChange={(v) => updateParameter('discountRateWACC', v)} />
            <Slider label="Gas ($/MMBtu)" value={gasPricePerMMBtu} min={1} max={20} step={0.5} onChange={(v) => updateParameter('gasPricePerMMBtu', v)} />
            <Slider label="Carbon ($/ton)" value={carbonPricePerTon} min={0} max={500} step={10} onChange={(v) => updateParameter('carbonPricePerTon', v)} />
            <Slider label="Orbital OPEX" value={opexOrbital} min={0.005} max={0.05} step={0.001} unit="%" onChange={(v) => updateParameter('opexOrbital', v)} />
          </SliderGroup>

          <SliderGroup title="Derived Values (Auto-Calculated)">
            <DerivedSlider
              id="powerRequiredKw"
              label="Power Required"
              value={coupledSliders.derivedValues.powerRequiredKw || 0}
              unit=" kW"
              precision={1}
              min={10}
              max={1000}
              step={1}
            />
            <DerivedSlider
              id="wasteHeatKw"
              label="Waste Heat"
              value={coupledSliders.derivedValues.wasteHeatKw || 0}
              unit=" kW"
              precision={1}
              min={1}
              max={250}
              step={0.5}
            />
            <DerivedSlider
              id="radiatorAreaM2"
              label="Radiator Area"
              value={coupledSliders.derivedValues.radiatorAreaM2 || 0}
              unit=" m²"
              precision={1}
              min={10}
              max={500}
              step={1}
            />
            <DerivedSlider
              id="radiatorMassKg"
              label="Radiator Mass"
              value={coupledSliders.derivedValues.radiatorMassKg || 0}
              unit=" kg"
              precision={0}
              min={30}
              max={1500}
              step={1}
            />
            <DerivedSlider
              id="solarMassKg"
              label="Solar Array Mass"
              value={coupledSliders.derivedValues.solarMassKg || 0}
              unit=" kg"
              precision={0}
              min={100}
              max={50000}
              step={10}
            />
            <DerivedSlider
              id="totalSatelliteMassKg"
              label="Total Satellite Mass"
              value={coupledSliders.derivedValues.totalSatelliteMassKg || 0}
              unit=" kg"
              precision={0}
              min={100}
              max={50000}
              step={10}
            />
            <DerivedSlider
              id="launchCostPerSatellite"
              label="Launch Cost per Satellite"
              value={coupledSliders.derivedValues.launchCostPerSatellite || 0}
              unit=" $"
              precision={0}
              min={100000}
              max={100000000}
              step={10000}
            />
            <DerivedSlider
              id="powerDensityWPerKg"
              label="Power Density"
              value={coupledSliders.derivedValues.powerDensityWPerKg || 0}
              unit=" W/kg"
              precision={1}
              min={1}
              max={100}
              step={0.1}
            />
          </SliderGroup>

          <SliderGroup title="System Presets">
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => {
                  setIsStaticMode(false);
                  updateParameter('launchCost2025', 1500);
                  updateParameter('launchCost2040', 100);
                  updateParameter('specificPower2025', 36.5);
                  updateParameter('specificPower2040', 150);
                  updateParameter('gflopsPerWattGround2025', 2000);
                  updateParameter('flopsPerWattOrbital2025', 1500);
                  setUseRadHardChips(false);
                }} 
                className={`w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-widest ${!isStaticMode ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
              >
                Reset to Dynamic Base
              </button>
              <button 
                onClick={() => {
                  setIsStaticMode(true);
                  updateParameter('launchCost2025', 1500);
                  updateParameter('launchCost2030', 1500);
                  updateParameter('launchCost2035', 1500);
                  updateParameter('launchCost2040', 1500);
                  updateParameter('specificPower2025', 36.5);
                  updateParameter('specificPower2030', 36.5);
                  updateParameter('specificPower2035', 36.5);
                  updateParameter('specificPower2040', 36.5);
                  updateParameter('gflopsPerWattGround2025', 2000);
                  updateParameter('flopsPerWattGround2040', 2000);
                  updateParameter('flopsPerWattOrbital2025', 1000);
                  updateParameter('flopsPerWattOrbital2040', 1000);
                  setUseRadHardChips(false);
                }} 
                className={`w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-widest ${isStaticMode ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
              >
                Load Static Baseline
              </button>
            </div>
          </SliderGroup>

        </section>

        {/* Validation Warnings */}
        {coupledSliders.warnings.length > 0 && (
          <section className="mb-8">
            <ValidationWarnings warnings={coupledSliders.warnings} />
          </section>
        )}

        {/* Toggles */}
        <section className="mb-16 border border-gray-200 rounded-xl p-6 bg-gray-50 flex flex-wrap gap-8 items-center justify-center shadow-inner">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-gray-700 uppercase tracking-tighter hover:text-blue-600 transition-colors">
            <input type="checkbox" checked={groundConstraintsEnabled} onChange={(e) => setGroundConstraintsEnabled(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            Ground Bottlenecks
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-gray-700 uppercase tracking-tighter hover:text-blue-600 transition-colors">
            <input type="checkbox" checked={spaceTrafficEnabled} onChange={(e) => setSpaceTrafficEnabled(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            Space Traffic
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-red-700 uppercase tracking-tighter hover:text-red-800 transition-colors">
            <input type="checkbox" checked={useRadHardChips} onChange={(e) => setUseRadHardChips(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
            Rad-Hard Chips
          </label>
          <div className="h-6 w-px bg-gray-300 mx-2" />
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Scenario:</span>
            <select value={groundScenario} onChange={(e) => setGroundScenario(e.target.value as any)} className="text-[10px] font-black bg-white border border-gray-200 rounded-lg px-3 py-1.5 uppercase shadow-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="constrained">Constrained (Current)</option>
              <option value="moderate">Moderate friction</option>
              <option value="unconstrained">SMR / Unconstrained</option>
              <option value="severe">Severe Scarcity</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-green-700 uppercase tracking-tighter hover:text-green-800 transition-colors">
            <input type="checkbox" checked={smrMitigationEnabled} onChange={(e) => setSmrMitigationEnabled(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
            SMR Mitigation
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-cyan-700 uppercase tracking-tighter hover:text-cyan-800 transition-colors">
            <input type="checkbox" checked={edgeInferenceEnabled} onChange={(e) => updateParameter('edgeInferenceEnabled', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" />
            Edge Mode
          </label>
        </section>

        {/* New Scenario Toggles */}
        <section className="mb-8 flex flex-wrap gap-6 items-center bg-gray-50 border border-gray-200 p-4 rounded-xl">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">Scenario Toggles:</span>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-blue-700 uppercase tracking-tighter hover:text-blue-800 transition-colors">
            <input type="checkbox" checked={elonScenarioEnabled} onChange={(e) => setElonScenarioEnabled(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            Elon Scenario
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-indigo-700 uppercase tracking-tighter hover:text-indigo-800 transition-colors">
            <input type="checkbox" checked={globalLatencyRequirementEnabled} onChange={(e) => setGlobalLatencyRequirementEnabled(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
            Global Latency
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-purple-700 uppercase tracking-tighter hover:text-purple-800 transition-colors">
            <input type="checkbox" checked={spaceManufacturingEnabled} onChange={(e) => setSpaceManufacturingEnabled(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
            Space Mfg
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-red-700 uppercase tracking-tighter hover:text-red-800 transition-colors">
            <input type="checkbox" checked={aiWinterEnabled} onChange={(e) => setAiWinterEnabled(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
            AI Winter
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-green-700 uppercase tracking-tighter hover:text-green-800 transition-colors">
            <input type="checkbox" checked={smrToggleEnabled} onChange={(e) => setSmrToggleEnabled(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
            SMR (Ground)
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-cyan-700 uppercase tracking-tighter hover:text-cyan-800 transition-colors">
            <input type="checkbox" checked={fusionToggleEnabled} onChange={(e) => setFusionToggleEnabled(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" />
            Fusion (Orbital)
          </label>
        </section>

        {/* Scenario Analysis */}
        <section className={`mb-16 grid grid-cols-1 ${finalAnalysis.analysis.scenarioImpact?.activeToggles.length ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-12`}>
          {finalAnalysis.analysis.scenarioImpact && finalAnalysis.analysis.scenarioImpact.activeToggles.length > 0 && (
            <div className="border-2 border-blue-200 rounded-2xl p-6 bg-blue-50 shadow-md">
              <h3 className="text-lg font-black mb-1 text-blue-900">Scenario Impact</h3>
              <p className="text-[10px] text-blue-600 uppercase font-bold tracking-widest mb-6">Applied Strategic Adjustments</p>
              <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-blue-100 pb-2">
                  <span className="text-xs font-bold text-blue-700">Baseline Crossover</span>
                  <span className="text-xl font-black text-blue-900">{finalAnalysis.analysis.scenarioImpact.baselineCrossover || 'Never'}</span>
                </div>
                <div className="flex justify-between items-end border-b border-blue-100 pb-2">
                  <span className="text-xs font-bold text-blue-700">Adjusted Crossover</span>
                  <span className="text-xl font-black text-blue-600">{finalAnalysis.analysis.scenarioImpact.currentCrossover || 'Never'}</span>
                </div>
                <div className="flex justify-between items-center bg-blue-600 text-white p-2 rounded-lg">
                  <span className="text-[10px] font-black uppercase tracking-tighter">Net Change</span>
                  <span className="text-lg font-black">{finalAnalysis.analysis.scenarioImpact.crossoverDelta > 0 ? `-${finalAnalysis.analysis.scenarioImpact.crossoverDelta} Years` : `+${Math.abs(finalAnalysis.analysis.scenarioImpact.crossoverDelta)} Years`}</span>
                </div>
                <div className="pt-2">
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2">Active Toggles:</p>
                  <div className="flex flex-wrap gap-1">
                    {finalAnalysis.analysis.scenarioImpact.activeToggles.map(t => (
                      <span key={t} className="text-[8px] bg-white px-1.5 py-0.5 rounded border border-blue-200 text-blue-600 font-bold uppercase">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm">
            <h3 className="text-lg font-black mb-1">Scenario Benchmarks</h3>
            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-6">Crossover Year by Market Conditions</p>
            <div className="space-y-4">
              {finalAnalysis.analysis.scenarios.map((s: { name: string; description: string; keyAssumptions: string[]; crossoverYear: number | null }, i: number) => (
                <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div>
                    <p className="text-sm font-black text-gray-900">{s.name}</p>
                    <p className="text-[10px] text-gray-500 leading-tight">{s.description}</p>
                    <div className="flex gap-2 mt-1">
                      {s.keyAssumptions.map((a: string, j: number) => (
                        <span key={j} className="text-[8px] bg-white px-1.5 py-0.5 rounded border border-gray-200 text-gray-400 font-bold uppercase tracking-tighter">{a}</span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Crossover</p>
                    <p className={`text-2xl font-black ${s.crossoverYear ? 'text-blue-600' : 'text-gray-300'}`}>{s.crossoverYear || 'Never'}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-[10px] text-blue-700 font-bold uppercase tracking-widest mb-1">Regulatory & Insurance Impact</p>
              <p className="text-sm text-blue-900 font-black">+${finalAnalysis.analysis.regulatoryImpact.toLocaleString()}/PFLOP-year</p>
              <p className="text-[9px] text-blue-600 italic leading-tight">Includes de-orbit reserves, debris liability, space traffic fees, and 3% asset insurance.</p>
            </div>
          </div>

          <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm">
            <h3 className="text-lg font-black mb-1">Market Position (vs. Projected)</h3>
            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-6">Orbital Price vs Projected Market Rates</p>
            <div className="space-y-3">
              {finalAnalysis.analysis.marketComparison.map((m, i) => {
                const year = crossoverYear || 2035;
                const projected = projectMarketPrice(m.currentPrice, m.currentYear, year, m.projectedDecline);
                const orbital = trajectoryData.find(d => d.year === year)?.orbit.gpuHourPricing[slaTier].pricePerGpuHour || 0;
                const diff = ((orbital / projected) - 1) * 100;
                
                return (
                  <div key={i} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-black text-gray-900">{m.provider}</span>
                      <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${diff < 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {diff < 0 ? 'Orbital Cheaper' : 'Market Cheaper'}
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-gray-500">
                      <span>{year} Projected: ${projected.toFixed(2)}/hr</span>
                      <span>Orbital: ${orbital.toFixed(2)}/hr</span>
                      <span className={diff < 0 ? 'text-green-600' : 'text-red-600'}>{Math.abs(diff).toFixed(1)}% {diff < 0 ? 'saving' : 'premium'}</span>
                    </div>
                  </div>
                );
              })}
              <p className="text-[9px] text-gray-400 italic mt-2">*Market rates projected at 10-12% annual decline from 2024 baseline.</p>
            </div>
          </div>
        </section>

        {/* Ground Buildout Metrics */}
        <section className="grid grid-cols-1 gap-12 mb-16">
          <div className="border border-gray-200 rounded-2xl p-6 bg-gray-50 shadow-sm">
            <h3 className="text-lg font-bold mb-1">Ground Buildout Constraints (GW)</h3>
            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-4">Demand vs Capacity & Queue Metrics</p>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={(() => {
                  try {
                    const chartData = trajectoryData.map(d => {
                      const buildoutDebug = d.ground?.buildoutDebug;
                      const supplyMetrics = d.ground?.supplyMetrics;
                      const pb = d.metadata?.chartInputs?.powerBuildout;
                      
                      // Use supplyMetrics first (queue model), then fallback to buildoutDebug
                      // Queue model provides: backlogGw, avgWaitYears, unservedGw, deliveredFromBacklogGw
                      const backlogGW = 
                        supplyMetrics?.backlogGw ?? 
                        d.ground?.backlogGw ??
                        buildoutDebug?.backlogGW ??
                        pb?.backlogGw ??
                        0;
                      
                      const timeToPowerYears = 
                        supplyMetrics?.avgWaitYears ??
                        d.ground?.avgWaitYears ??
                        buildoutDebug?.timeToPowerYears ??
                        pb?.avgWaitYears ??
                        0;
                      
                      const buildRateGWyr = 
                        supplyMetrics?.maxBuildRateGwYear ??
                        buildoutDebug?.buildRateGWyr ??
                        pb?.maxBuildRateGwYear ??
                        0;
                      
                      const demandNewGW = supplyMetrics?.unservedGw ?? buildoutDebug?.demandNewGW ?? 0;
                      const capacityGW = supplyMetrics?.capacityGw ?? buildoutDebug?.capacityGW ?? 0;
                      const demandGW = supplyMetrics?.demandGw ?? buildoutDebug?.demandGW ?? 0;
                      const pipelineGW = supplyMetrics?.pipelineGw ?? backlogGW; // pipeline = backlog in queue model
                      const deliveredFromBacklog = supplyMetrics?.deliveredFromBacklogGw ?? 0;
                    
                    return {
                      year: d.year,
                      backlogGW: isFinite(backlogGW) && backlogGW >= 0 ? backlogGW : null,
                      timeToPowerYears: isFinite(timeToPowerYears) && timeToPowerYears >= 0 ? timeToPowerYears : null,
                      demandNewGW: isFinite(demandNewGW) && demandNewGW >= 0 ? demandNewGW : null,
                      buildRateGWyr: isFinite(buildRateGWyr) && buildRateGWyr > 0 ? buildRateGWyr : null,
                      capacityGW: isFinite(capacityGW) && capacityGW > 0 ? capacityGW : null,
                      demandGW: isFinite(demandGW) && demandGW > 0 ? demandGW : null,
                      pipelineGW: isFinite(pipelineGW) && pipelineGW >= 0 ? pipelineGW : null,
                      deliveredFromBacklog: isFinite(deliveredFromBacklog) && deliveredFromBacklog >= 0 ? deliveredFromBacklog : null,
                    };
                  });
                  
                  // Sanitize: use null for bad points (not NaN, not undefined)
                  const sanitizedData = chartData.map(d => ({
                    year: d.year,
                    backlogGW: d.backlogGW,
                    timeToPowerYears: d.timeToPowerYears,
                    demandNewGW: d.demandNewGW,
                    buildRateGWyr: d.buildRateGWyr,
                    capacityGW: d.capacityGW,
                    demandGW: d.demandGW,
                    pipelineGW: d.pipelineGW,
                    deliveredFromBacklog: d.deliveredFromBacklog,
                  }));
                  
                  return sanitizedData;
                  } catch (error) {
                    console.error('[Ground Buildout Chart] Error building chart data:', error);
                    // Return minimal data structure to prevent crash
                    return trajectoryData.map(d => ({
                      year: d.year,
                      backlogGW: null,
                      timeToPowerYears: null,
                      demandNewGW: null,
                      buildRateGWyr: null,
                      capacityGW: null,
                      demandGW: null,
                      pipelineGW: null,
                      __error: error instanceof Error ? error.message : String(error),
                    }));
                  }
                })()}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} label={{ value: 'GW', angle: -90, position: 'insideLeft', style: { fontSize: '10px', fill: '#64748b' } }} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} label={{ value: 'Years', angle: 90, position: 'insideRight', style: { fontSize: '10px', fill: '#64748b' } }} />
                  <Tooltip 
                    formatter={(value: any, name: any) => {
                      if (value === undefined || !isFinite(value)) return ['', ''];
                      const displayName = name || '';
                      if (displayName === 'timeToPowerYears') {
                        return [`${value.toFixed(2)} years`, 'Time to Power'];
                      }
                      return [`${value.toFixed(2)} GW`, displayName];
                    }}
                    labelFormatter={(label) => `Year ${label}`}
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="backlogGW" stroke="#ef4444" strokeWidth={2} dot={false} name="Backlog (GW)" />
                  <Line yAxisId="left" type="monotone" dataKey="demandNewGW" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Demand New (GW)" />
                  <Line yAxisId="left" type="monotone" dataKey="buildRateGWyr" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Build Rate (GW/yr)" />
                  <Line yAxisId="left" type="monotone" dataKey="demandGW" stroke="#3b82f6" strokeWidth={2} strokeDasharray="3 3" dot={false} name="Demand (GW)" />
                  <Line yAxisId="left" type="monotone" dataKey="capacityGW" stroke="#22c55e" strokeWidth={2} strokeDasharray="3 3" dot={false} name="Capacity (GW)" />
                  <Line yAxisId="right" type="monotone" dataKey="timeToPowerYears" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Time to Power (years)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Validation Suite */}
        <section className="mb-16 border border-blue-100 rounded-xl p-6 bg-blue-50/30">
          <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-6">Physics & Economic Integrity Check</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {validations.map((v, i) => (
              <div key={i} className="flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <span className={v.passed ? 'text-green-500' : 'text-red-500'}>{v.passed ? '✓' : '✗'}</span>
                  <span className="text-[10px] font-bold text-gray-700 uppercase tracking-tight">{v.name}</span>
                </div>
                <div className="text-xl font-black text-blue-900">{v.actual}</div>
                <div className="text-[10px] text-gray-400 italic">Expected: {v.expected}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-20 pt-12 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-sm text-gray-500 max-w-lg">Validating and extending the static baseline model. Transforming abstract cost metrics into market-ready pricing tools for the next generation of infrastructure.</div>
          <div className="flex gap-4">
            <button onClick={handleExportDebug} className="bg-gray-900 text-white px-8 py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition-all shadow-lg">Export Debug Data</button>
            <a href="/sandbox" className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg">Open Sandbox</a>
          </div>
        </footer>
      </main>
    </div>
  );
}
