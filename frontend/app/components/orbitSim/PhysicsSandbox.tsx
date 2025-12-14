"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import { useOrbitSim } from '../../state/orbitStore';
import { getDebugStateEntry } from '../../lib/orbitSim/debugState';
import { ThermalViz, BackhaulViz, MaintenanceViz, CostViz } from './PhysicsViz';
import { ComputeViz, PowerViz } from './PhysicsVizExtra';

/**
 * PhysicsSandbox - Interactive physics calculator with cyberpunk aesthetic
 * 
 * Usage:
 * <PhysicsSandbox 
 *   baselineData={perScenario.BASELINE} 
 *   currentYear="2033"
 *   onApplyToGlobe={(params) => { update globe }}
 * />
 */

// ============================================================================
// PHYSICS CALCULATIONS
// ============================================================================

const STEFAN_BOLTZMANN = 5.67e-8;
const T_SINK = 200;
const BITS_PER_FLOP = 0.1;

interface PhysicsParams {
  year?: string;
  radiatorAreaPerSat: number;
  emissivity: number;
  radiatorTempC: number;
  busPowerKw: number;
  mooresLawDoublingYears: number;
  opticalTerminals: number;
  linkCapacityGbps: number;
  groundStations: number;
  fleetSize: number;
  failureRatePercent: number;
  servicerDrones: number;
  launchesPerYear: number;
  satsPerLaunch: number;
  launchCostPerKg: number;
  launchCostImprovementRate?: number; // Annual improvement rate (e.g., 0.15 = 15% per year)
  satelliteBaseCost: number;
  processNode?: number;
  chipTdp?: number;
  radiationHardening?: number;
  memoryPerNode?: number;
  solarEfficiency?: number;
  degradationRate?: number;
  batteryBuffer?: number;
  powerMargin?: number;
  batteryDensity?: number;
  batteryCost?: number;
}

interface PhysicsResults {
  heatRejectionPerSat_kW: number;
  heatGenPerSat_kW: number;
  thermalMargin: number;
  thermalOK: boolean;
  radiatorUtilization: number;
  gflopsPerWatt: number;
  computePerSat_TFLOPS: number;
  fleetCompute_PFLOPS: number;
  computeOK: boolean;
  computeMemoryRatio: number;
  backhaulPerSat_Gbps: number;
  backhaulUtilization: number;
  backhaulOK: boolean;
  groundStationCoverage: number;
  failuresPerYear: number;
  repairsPerYear: number;
  replacementsPerYear: number;
  netAttrition: number;
  survivalRate10yr: number;
  maintenanceOK: boolean;
  totalMassPerSat_kg: number;
  radiatorMass_kg: number;
  solarMass_kg: number;
  computeMass_kg: number;
  batteryMass_kg: number;
  annualOpex: number;
  costPerPflop: number;
  carbonIntensity: number;
  solarArraySize_m2: number;
  degradationAfter10yr: number;
  effectivePowerYear10: number;
  batteryCapacity_kWh: number;
  powerOK: boolean;
  eclipseHandlingOK: boolean;
  allSystemsOK: boolean;
}

const calculatePhysics = (params: PhysicsParams): PhysicsResults => {
  const T_rad_K = params.radiatorTempC + 273.15;
  const heatRejectionPerM2_kW = params.emissivity * STEFAN_BOLTZMANN * 
    (Math.pow(T_rad_K, 4) - Math.pow(T_SINK, 4)) / 1000;
  
  const heatRejectionPerSat_kW = heatRejectionPerM2_kW * params.radiatorAreaPerSat;
  const heatGenPerSat_kW = params.busPowerKw * 0.85;
  
  const thermalMargin = (heatRejectionPerSat_kW - heatGenPerSat_kW) / heatGenPerSat_kW;
  const thermalOK = thermalMargin > 0;
  const radiatorUtilization = Math.min(1, heatGenPerSat_kW / heatRejectionPerSat_kW);

  const yearsFrom2024 = parseInt(params.year || '2033') - 2024;
  const processNode = params.processNode ?? 5;
  const radiationHardening = params.radiationHardening ?? 1;
  const processScaling = Math.pow(0.7, (7 - processNode) / 2);
  const hardeningPenalty = [1.0, 0.7, 0.4][radiationHardening];
  const mooresLawMultiplier = Math.pow(2, yearsFrom2024 / params.mooresLawDoublingYears);
  const baseEfficiency = 3;
  const gflopsPerWatt = baseEfficiency * mooresLawMultiplier * processScaling * hardeningPenalty;
  
  const chipTdp = params.chipTdp ?? 300;
  const chipPowerPerSat = chipTdp * Math.ceil(params.busPowerKw / chipTdp * 0.7);
  const computePerSat_TFLOPS = (chipPowerPerSat * gflopsPerWatt) / 1000;
  
  const memoryPerNode = params.memoryPerNode ?? 128;
  const memoryBandwidth_TBs = memoryPerNode * 3.2 / 1000;
  const computeMemoryRatio = computePerSat_TFLOPS / memoryBandwidth_TBs;
  const computeOK = computeMemoryRatio < 500 && radiationHardening > 0;
  
  const solarEfficiency = params.solarEfficiency ?? 32;
  const solarPowerGenerated = params.busPowerKw / (solarEfficiency / 100);
  const solarArraySize_m2 = solarPowerGenerated / 0.2;
  const degradationRate = params.degradationRate ?? 1.5;
  const degradationAfter10yr = Math.pow(1 - degradationRate / 100, 10);
  const effectivePowerYear10 = params.busPowerKw * degradationAfter10yr;
  
  const batteryBuffer = params.batteryBuffer ?? 45;
  const batteryCapacity_kWh = (params.busPowerKw * batteryBuffer) / 60;
  const batteryDensity = params.batteryDensity ?? 300;
  const batteryMass_kg = batteryCapacity_kWh * 1000 / batteryDensity;
  const batteryCost = params.batteryCost ?? 120;
  const batteryCost_total = batteryCapacity_kWh * batteryCost;
  
  const powerMargin = params.powerMargin ?? 20;
  const eclipseHandlingOK = batteryBuffer >= 35 || powerMargin >= 25;
  const powerOK = degradationAfter10yr > 0.7 && eclipseHandlingOK;
  
  const backhaulPerSat_Gbps = params.opticalTerminals * params.linkCapacityGbps;
  const computeOutputPerSat_Gbps = computePerSat_TFLOPS * 1e12 * BITS_PER_FLOP / 1e9;
  const backhaulUtilization = Math.min(1, computeOutputPerSat_Gbps / backhaulPerSat_Gbps);
  const backhaulOK = backhaulUtilization < 0.95;
  
  const groundStationCoverage = Math.min(1, params.groundStations / 80);

  const failuresPerYear = params.fleetSize * (params.failureRatePercent / 100);
  const repairsPerYear = params.servicerDrones * 3;
  const replacementsPerYear = params.launchesPerYear * params.satsPerLaunch;
  
  const netAttrition = Math.max(0, failuresPerYear - repairsPerYear - replacementsPerYear);
  const survivalRate10yr = Math.pow(Math.max(0.01, 1 - (netAttrition / params.fleetSize)), 10);
  const maintenanceOK = netAttrition <= failuresPerYear * 0.1;

  const radiatorMass_kg = params.radiatorAreaPerSat * 1.2;
  const solarMass_kg = solarArraySize_m2 * 0.5;
  const computeMass_kg = (memoryPerNode * 0.5) + (chipPowerPerSat * 0.1);
  const structureMass_kg = 200;
  const shieldingMass_kg = 50 + radiationHardening * 75;
  const totalMassPerSat_kg = radiatorMass_kg + solarMass_kg + computeMass_kg + batteryMass_kg + structureMass_kg + shieldingMass_kg;

  const launchCostPerSat = totalMassPerSat_kg * params.launchCostPerKg;
  const satelliteCost = params.satelliteBaseCost + (computePerSat_TFLOPS * 1000) + batteryCost_total;
  const totalCostPerSat = launchCostPerSat + satelliteCost;
  
  const annualReplacementCost = netAttrition * totalCostPerSat;
  const servicerCost = params.servicerDrones * 500000;
  const groundStationCost = params.groundStations * 2000000;
  const annualOpex = annualReplacementCost + servicerCost + groundStationCost;
  
  const fleetCompute_PFLOPS = (params.fleetSize * computePerSat_TFLOPS) / 1000;
  const fleetCapex = params.fleetSize * totalCostPerSat;
  const costPerPflop = fleetCompute_PFLOPS > 0 ? (annualOpex + (fleetCapex / 10)) / fleetCompute_PFLOPS : 0;

  const launchCarbonPerKg = 50;
  const annualLaunchCarbon_tCO2 = (replacementsPerYear * totalMassPerSat_kg * launchCarbonPerKg) / 1000;
  const carbonIntensity = params.fleetSize > 0 && params.busPowerKw > 0 
    ? (annualLaunchCarbon_tCO2 * 1e6) / (params.fleetSize * params.busPowerKw * 8760)
    : 0;

  return {
    heatRejectionPerSat_kW,
    heatGenPerSat_kW,
    thermalMargin,
    thermalOK,
    radiatorUtilization,
    gflopsPerWatt,
    computePerSat_TFLOPS,
    fleetCompute_PFLOPS,
    backhaulPerSat_Gbps,
    backhaulUtilization,
    backhaulOK,
    groundStationCoverage,
    failuresPerYear,
    repairsPerYear,
    replacementsPerYear,
    netAttrition,
    survivalRate10yr,
    maintenanceOK,
    totalMassPerSat_kg,
    radiatorMass_kg,
    solarMass_kg,
    computeMass_kg,
    annualOpex,
    costPerPflop,
    carbonIntensity,
    solarArraySize_m2,
    degradationAfter10yr,
    effectivePowerYear10,
    batteryCapacity_kWh,
    batteryMass_kg,
    powerOK,
    eclipseHandlingOK,
    computeOK,
    computeMemoryRatio,
    allSystemsOK: thermalOK && backhaulOK && maintenanceOK && computeOK && powerOK,
  };
};


const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'linear-gradient(180deg, rgba(10, 15, 28, 0.98) 0%, rgba(15, 23, 42, 0.95) 100%)',
    border: '1px solid rgba(0, 240, 255, 0.15)',
    borderRadius: '16px',
    padding: '32px',
    fontFamily: "'IBM Plex Mono', 'Fira Code', 'Courier New', monospace",
    position: 'relative',
    overflow: 'hidden',
  },
  
  // Animated background grid
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: `
      linear-gradient(rgba(0, 240, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 240, 255, 0.03) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
  },
  
  // Scanning line animation
  scanLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '2px',
    background: 'linear-gradient(90deg, transparent, rgba(0, 240, 255, 0.4), transparent)',
    animation: 'scan 4s ease-in-out infinite',
    pointerEvents: 'none',
  },
  
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '32px',
    position: 'relative',
    zIndex: 1,
  },
  
  headerTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '12px',
  },
  
  headerButtons: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  
  title: {
    color: '#00f0ff',
    fontSize: '13px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '3px',
    margin: 0,
    textShadow: '0 0 20px rgba(0, 240, 255, 0.5)',
  },
  
  subtitle: {
    color: '#64748b',
    fontSize: '11px',
    letterSpacing: '1px',
    marginTop: '8px',
  },
  
  button: {
    padding: '10px 20px',
    borderRadius: '4px',
    border: '1px solid rgba(0, 240, 255, 0.3)',
    background: 'rgba(0, 240, 255, 0.1)',
    color: '#00f0ff',
    fontSize: '11px',
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    fontWeight: 600,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  
  buttonPrimary: {
    background: 'rgba(0, 240, 255, 0.2)',
    borderColor: '#00f0ff',
    boxShadow: '0 0 20px rgba(0, 240, 255, 0.3)',
  },
  
  section: {
    background: 'rgba(0, 10, 20, 0.5)',
    border: '1px solid rgba(0, 240, 255, 0.1)',
    borderRadius: '8px',
    padding: '24px',
    position: 'relative',
    zIndex: 1,
  },
  
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    paddingBottom: '12px',
    borderBottom: '1px solid rgba(0, 240, 255, 0.1)',
  },
  
  sectionTitle: {
    color: '#e2e8f0',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '2px',
    margin: 0,
  },
  
  sliderContainer: {
    marginBottom: '20px',
  },
  
  sliderLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  
  sliderLabelText: {
    color: '#94a3b8',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  
  sliderValue: {
    color: '#00f0ff',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
  },
  
  sliderTrack: {
    width: '100%',
    height: '4px',
    borderRadius: '2px',
    background: 'rgba(0, 240, 255, 0.1)',
    position: 'relative',
    cursor: 'pointer',
  },
  
  sliderHelp: {
    color: '#475569',
    fontSize: '10px',
    marginTop: '6px',
    fontStyle: 'italic',
  },
  
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '1px',
    textTransform: 'uppercase',
  },
  
  statusOK: {
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    color: '#10b981',
  },
  
  statusFail: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    animation: 'pulse 2s ease-in-out infinite',
  },
  
  gauge: {
    width: '100%',
    height: '8px',
    borderRadius: '4px',
    background: 'rgba(0, 0, 0, 0.3)',
    overflow: 'hidden',
    position: 'relative',
  },
  
  gaugeFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.5s ease, background 0.3s ease',
  },
  
  resultBox: {
    background: 'rgba(0, 240, 255, 0.05)',
    border: '1px solid rgba(0, 240, 255, 0.15)',
    borderRadius: '8px',
    padding: '16px',
    marginTop: '16px',
  },
  
};

// CSS animations - inject into document
const injectStyles = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById('physics-sandbox-styles')) return;
  
  const styleSheet = document.createElement('style');
  styleSheet.id = 'physics-sandbox-styles';
  styleSheet.textContent = `
    @keyframes scan {
      0%, 100% { transform: translateY(0); opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 1; }
      100% { transform: translateY(100vh); opacity: 0; }
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
    
    @keyframes glow {
      0%, 100% { box-shadow: 0 0 5px rgba(0, 240, 255, 0.3); }
      50% { box-shadow: 0 0 20px rgba(0, 240, 255, 0.6); }
    }
    
    @keyframes dataFlow {
      0% { background-position: 0% 50%; }
      100% { background-position: 200% 50%; }
    }
    
    .physics-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #00f0ff;
      cursor: pointer;
      box-shadow: 0 0 10px rgba(0, 240, 255, 0.5);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    
    .physics-slider::-webkit-slider-thumb:hover {
      transform: scale(1.2);
      box-shadow: 0 0 20px rgba(0, 240, 255, 0.8);
    }
    
    .physics-slider::-webkit-slider-runnable-track {
      height: 4px;
      border-radius: 2px;
    }
    
    .physics-button:hover {
      background: rgba(0, 240, 255, 0.2) !important;
      box-shadow: 0 0 30px rgba(0, 240, 255, 0.4);
      transform: translateY(-1px);
    }
    
    .data-flow-line {
      background: linear-gradient(90deg, transparent, rgba(0, 240, 255, 0.6), transparent);
      background-size: 200% 100%;
      animation: dataFlow 2s linear infinite;
    }
  `;
  document.head.appendChild(styleSheet);
};

// ============================================================================
// COMPONENTS
// ============================================================================

const Slider = ({ label, value, onChange, min, max, step = 1, unit = '', help = '', disabled = false }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  help?: string;
  disabled?: boolean;
}) => {
  const percentage = ((value - min) / (max - min)) * 100;
  
  return (
    <div style={styles.sliderContainer}>
      <div style={styles.sliderLabel}>
        <span style={styles.sliderLabelText}>{label}</span>
        <span style={styles.sliderValue}>
          {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}
          <span style={{ color: '#64748b', fontWeight: 400 }}>{unit}</span>
        </span>
      </div>
      <input
        type="range"
        className="physics-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        style={{
          width: '100%',
          height: '4px',
          borderRadius: '2px',
          background: `linear-gradient(to right, #00f0ff 0%, #00f0ff ${percentage}%, rgba(0, 240, 255, 0.1) ${percentage}%, rgba(0, 240, 255, 0.1) 100%)`,
          appearance: 'none',
          cursor: 'pointer',
          outline: 'none',
        }}
      />
      {help && <div style={styles.sliderHelp}>{help}</div>}
    </div>
  );
};

const StatusBadge = ({ ok, value, okLabel = 'NOMINAL', failLabel = 'CRITICAL' }: {
  ok: boolean;
  value: string;
  okLabel?: string;
  failLabel?: string;
}) => (
  <div style={{
    ...styles.statusBadge,
    ...(ok ? styles.statusOK : styles.statusFail),
  }}>
    <span style={{ fontSize: '12px' }}>{ok ? '◆' : '▲'}</span>
    {ok ? `${okLabel} ${value}` : failLabel}
  </div>
);

const UtilizationGauge = ({ value, label, thresholds = { warning: 0.7, critical: 0.9 } }: {
  value: number;
  label: string;
  thresholds?: { warning: number; critical: number };
}) => {
  const percentage = Math.min(100, value * 100);
  const color = value >= thresholds.critical ? '#ef4444' 
    : value >= thresholds.warning ? '#f59e0b' 
    : '#10b981';
  
  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ color, fontSize: '12px', fontWeight: 600, fontFamily: "'IBM Plex Mono', 'Courier New', monospace" }}>
          {percentage.toFixed(1)}%
        </span>
      </div>
      <div style={styles.gauge}>
        <div 
          style={{
            ...styles.gaugeFill,
            width: `${percentage}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            boxShadow: `0 0 10px ${color}66`,
          }}
        />
      </div>
    </div>
  );
};

const LiveValue = ({ label, value, unit = '' }: { label: string; value: string | number; unit?: string }) => {
  const [flash, setFlash] = useState(false);
  
  useEffect(() => {
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 300);
    return () => clearTimeout(timer);
  }, [value]);
  
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      padding: '8px 12px',
      background: flash ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
      borderRadius: '4px',
      transition: 'background 0.3s ease',
    }}>
      <span style={{ color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ 
        color: '#00f0ff', 
        fontSize: '13px', 
        fontWeight: 600,
        fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      }}>
        {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : value}
        <span style={{ color: '#64748b', fontWeight: 400, marginLeft: '2px' }}>{unit}</span>
      </span>
    </div>
  );
};

const Section = ({ title, status, children }: { title: string; status?: React.ReactNode; children: React.ReactNode }) => (
  <div style={styles.section}>
    <div style={styles.sectionHeader}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      {status}
    </div>
    {children}
  </div>
);


// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface PhysicsSandboxProps {
  baselineData?: unknown;
  currentYear?: string;
  onApplyToGlobe?: (data: { params: PhysicsParams; results: PhysicsResults }) => void;
}

// Calculate safe defaults based on year (accounting for improvement rate)
const calculateSafeDefaults = (year: string) => {
    const yearsFrom2024 = parseInt(year || '2033') - 2024;
    const mooresLawMultiplier = Math.pow(2, yearsFrom2024 / 2.5); // 2.5 year doubling
    const gflopsPerWatt = 3 * mooresLawMultiplier;
    
    // Start with reasonable bus power
    const busPowerKw = 250;
    const computePerSat_TFLOPS = (busPowerKw * 1000 * gflopsPerWatt) / 1000;
    
    // Calculate required radiator area for thermal balance
    // Heat generated = busPower * 0.85
    // Heat rejected = emissivity * SB * (T^4 - T_sink^4) / 1000 * area
    // We want heat rejected > heat generated with 20% margin
    const emissivity = 0.90;
    const radiatorTempC = 25; // Slightly higher temp for better rejection
    const T_rad_K = radiatorTempC + 273.15;
    const heatGenPerSat_kW = busPowerKw * 0.85;
    const heatRejectionPerM2_kW = emissivity * STEFAN_BOLTZMANN * 
      (Math.pow(T_rad_K, 4) - Math.pow(T_SINK, 4)) / 1000;
    const requiredRadiatorArea = (heatGenPerSat_kW * 1.2) / heatRejectionPerM2_kW; // 20% margin
    
    // Calculate required backhaul capacity
    // Compute output = compute * BITS_PER_FLOP
    const computeOutputPerSat_Gbps = computePerSat_TFLOPS * 1e12 * BITS_PER_FLOP / 1e9;
    // We want backhaul capacity to be 1.2x compute output (20% headroom)
    const requiredBackhaul_Gbps = computeOutputPerSat_Gbps * 1.2;
    const linkCapacityGbps = 150; // Current tech
    const requiredOpticalTerminals = Math.ceil(requiredBackhaul_Gbps / linkCapacityGbps);
    
    return {
      year: year,
      radiatorAreaPerSat: Math.ceil(requiredRadiatorArea), // Round up for safety
      emissivity: emissivity,
      radiatorTempC: radiatorTempC,
      busPowerKw: busPowerKw,
      mooresLawDoublingYears: 2.5,
      opticalTerminals: Math.max(requiredOpticalTerminals, 4), // At least 4 terminals
      linkCapacityGbps: linkCapacityGbps,
      groundStations: 80,
      fleetSize: 5000,
      failureRatePercent: 2.5,      // Conservative failure rate
      servicerDrones: 60,           // Plenty of repair capacity
      launchesPerYear: 36,
      satsPerLaunch: 50,
      launchCostPerKg: 200, // Match baseline scenario: base_cost_per_kg_to_leo = 200 for baseline
      launchCostImprovementRate: 0.08, // Match baseline: launchCostDeclinePerYear = 0.92 means 8% decline per year
      satelliteBaseCost: 180000,
      // Compute / Silicon
      processNode: 5,               // 5nm - good balance of efficiency and maturity
      chipTdp: 300,                 // 300W per chip
      radiationHardening: 1,        // 0=soft, 1=standard, 2=full
      memoryPerNode: 128,           // 128GB HBM per satellite
      // Power / Solar
      solarEfficiency: 32,          // 32% triple-junction cells
      degradationRate: 1.5,         // 1.5% per year
      batteryBuffer: 45,            // 45 min battery (covers 35 min eclipse + margin)
      powerMargin: 20,              // 20% power headroom
      batteryDensity: 300,          // 300 Wh/kg (solid state)
      batteryCost: 120,             // $120/kWh
    };
};

const PhysicsSandbox = ({ baselineData, currentYear = '2033', onApplyToGlobe }: PhysicsSandboxProps) => {
  useEffect(() => { injectStyles(); }, []);
  
  const { timeline, config, recomputeWithPlans, recompute, yearPlans } = useSimulationStore();
  const simTime = useOrbitSim((s) => s.simTime);
  const setSimPaused = useOrbitSim((s) => s.setSimPaused);
  const actualYear = timeline.length > 0 ? timeline[timeline.length - 1]?.year.toString() || currentYear : currentYear;
  
  const satellites = useOrbitSim((s) => s.satellites);
  const hasSimulationStarted = (timeline.length > 1 && timeline[timeline.length - 1]?.year > (config?.startYear || 2025)) || 
                                satellites.length > 0;
  
  const resetSimulation = useCallback(() => {
    if (typeof window !== 'undefined') {
      (window as { __physicsSandboxParams?: unknown }).__physicsSandboxParams = null;
    }
    
    // Reset orbit sim state first
    useOrbitSim.setState({ 
      simTime: 0, 
      satellites: [], 
      routes: [],
      year: 2025,
    });
    
    // Reset simulation store - reset to initial yearPlans and recompute
    const initialPlans = [{
      deploymentIntensity: 1.0,
      computeStrategy: "balanced" as const,
      launchStrategy: "medium" as const,
    }];
    
    // Use recomputeWithPlans to fully reset the timeline
    recomputeWithPlans(initialPlans);
    
    // Small delay to ensure state updates propagate before resetting params
    setTimeout(() => {
      const newDefaults = calculateSafeDefaults('2025');
      setParams(newDefaults);
    }, 100);
  }, [recomputeWithPlans]);
  
  const workingDefaults = useMemo(() => calculateSafeDefaults(actualYear), [actualYear]);
  
  // Initialize params from existing sandbox params if available, otherwise use defaults
  const initializeParams = useCallback((): PhysicsParams => {
    if (typeof window !== 'undefined') {
      const existing = (window as { __physicsSandboxParams?: { params?: PhysicsParams } }).__physicsSandboxParams;
      if (existing?.params) {
        // Merge with defaults to ensure all required fields are present
        const defaults = calculateSafeDefaults(actualYear);
        return {
          ...defaults,
          ...existing.params,
        };
      }
    }
    return calculateSafeDefaults(actualYear);
  }, [actualYear]);
  
  const [params, setParams] = useState<PhysicsParams>(initializeParams);
  
  // Sync params when component mounts or when sandbox params change externally
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const existing = (window as { __physicsSandboxParams?: { params?: PhysicsParams } }).__physicsSandboxParams;
      if (existing?.params) {
        const defaults = calculateSafeDefaults(actualYear);
        setParams({
          ...defaults,
          ...existing.params,
        });
      } else {
        // Only reset to defaults if no existing params (don't overwrite user changes)
        const newDefaults = calculateSafeDefaults(actualYear);
        setParams(newDefaults);
      }
    }
  }, [actualYear]);
  
  // Listen for external changes to sandbox params (e.g., when applied from another component)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleSandboxApplied = () => {
      const existing = (window as { __physicsSandboxParams?: { params?: PhysicsParams } }).__physicsSandboxParams;
      if (existing?.params) {
        const defaults = calculateSafeDefaults(actualYear);
        setParams({
          ...defaults,
          ...existing.params,
        });
      }
    };
    
    window.addEventListener('physics-sandbox-applied', handleSandboxApplied);
    return () => {
      window.removeEventListener('physics-sandbox-applied', handleSandboxApplied);
    };
  }, [actualYear]);

  const updateParam = useCallback((key: string, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetToDefaults = useCallback(() => {
    const newDefaults = calculateSafeDefaults(actualYear);
    setParams(newDefaults);
  }, [actualYear]);

  const results = useMemo(() => calculatePhysics(params), [params]);
  const baselineResults = useMemo(() => calculatePhysics(workingDefaults), []);

  // Track if this is the initial mount to avoid triggering re-run on mount
  const isInitialMount = useRef(true);

  // CRITICAL FIX: When sandbox params change, update window.__physicsSandboxParams and trigger simulation re-run
  // This ensures charts and exports reflect the new parameters
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Skip on initial mount - params are already set from initialization
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Debounce simulation re-run to avoid excessive computation
    const timeoutId = setTimeout(() => {
      // Update window.__physicsSandboxParams with current params
      const physicsOverrides = {
        radiatorArea_m2: params.radiatorAreaPerSat,
        emissivity: params.emissivity,
        busPowerKw: params.busPowerKw,
        radiatorTempC: params.radiatorTempC,
        opticalTerminals: params.opticalTerminals,
        linkCapacityGbps: params.linkCapacityGbps,
        groundStations: params.groundStations,
        mooresLawDoublingYears: params.mooresLawDoublingYears,
        launchCostPerKg: params.launchCostPerKg,
        launchCostImprovementRate: params.launchCostImprovementRate ?? 0.15,
        satelliteBaseCost: params.satelliteBaseCost,
        processNode: params.processNode,
        chipTdp: params.chipTdp,
        radiationHardening: params.radiationHardening,
        memoryPerNode: params.memoryPerNode,
        solarEfficiency: params.solarEfficiency,
        degradationRate: params.degradationRate,
        batteryBuffer: params.batteryBuffer,
        powerMargin: params.powerMargin,
        batteryDensity: params.batteryDensity,
        batteryCost: params.batteryCost,
      };

      (window as { __physicsSandboxParams?: unknown }).__physicsSandboxParams = {
        params,
        results,
        physicsOverrides,
      };

      // Trigger simulation re-run with current year plans
      // This will recalculate all time series data with the new physics parameters
      if (yearPlans && yearPlans.length > 0) {
        recomputeWithPlans(yearPlans);
      } else {
        // Fallback: use recompute if no plans available
        recompute();
      }

      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('physics-sandbox-applied', {
        detail: {
          params,
          results,
          physicsOverrides,
        }
      }));
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [params, results, recompute, recomputeWithPlans, yearPlans]);

  const handleApplyToGlobe = () => {
    if (!results.allSystemsOK) {
      const violations = [];
      if (!results.thermalOK) violations.push('OVERHEATING: Heat rejection < heat generation');
      if (!results.backhaulOK) violations.push('BACKHAUL SATURATED: Bandwidth capacity < compute output');
      if (!results.maintenanceOK) violations.push('FLEET DECLINING: Net attrition > 10% of failures');
      if (!results.computeOK) violations.push('UNPROTECTED: Radiation hardening required for space');
      if (!results.powerOK) violations.push('ECLIPSE FAIL: Battery buffer insufficient or degradation too high');
      
      const message = `⚠️ PHYSICS CONSTRAINT VIOLATED\n\n` +
        `These parameters are physically impossible:\n${violations.join('\n')}\n\n` +
        `Adjust parameters to satisfy physics constraints before deploying.\n\n` +
        `Note: High costs are allowed (economically nonsensical is OK), but physics must be valid.`;
      
      alert(message);
      return;
    }
    
    if (hasSimulationStarted) {
      if (!confirm('Simulation has already started. Reset the world to apply sandbox changes?')) {
        return;
      }
      resetSimulation();
      setTimeout(() => {
        applySandboxToGlobe();
      }, 100);
    } else {
      applySandboxToGlobe();
    }
  };
  
  const applySandboxToGlobe = () => {
    if (typeof window !== 'undefined') {
      const physicsOverrides = {
        radiatorArea_m2: params.radiatorAreaPerSat,
        emissivity: params.emissivity,
        busPowerKw: params.busPowerKw,
        radiatorTempC: params.radiatorTempC,
        opticalTerminals: params.opticalTerminals,
        linkCapacityGbps: params.linkCapacityGbps,
        groundStations: params.groundStations,
        mooresLawDoublingYears: params.mooresLawDoublingYears,
        launchCostPerKg: params.launchCostPerKg,
        launchCostImprovementRate: params.launchCostImprovementRate ?? 0.15,
        satelliteBaseCost: params.satelliteBaseCost,
        processNode: params.processNode,
        chipTdp: params.chipTdp,
        radiationHardening: params.radiationHardening,
        memoryPerNode: params.memoryPerNode,
        solarEfficiency: params.solarEfficiency,
        degradationRate: params.degradationRate,
        batteryBuffer: params.batteryBuffer,
        powerMargin: params.powerMargin,
        batteryDensity: params.batteryDensity,
        batteryCost: params.batteryCost,
      };

      (window as { __physicsSandboxParams?: unknown }).__physicsSandboxParams = {
        params,
        results,
        physicsOverrides,
      };
      
      window.dispatchEvent(new CustomEvent('physics-sandbox-applied', {
        detail: {
          params,
          results,
          physicsOverrides,
        }
      }));
      
      window.dispatchEvent(new CustomEvent('navigate-surface', { detail: { surface: 'overview' } }));
    }
    
    if (onApplyToGlobe) {
      onApplyToGlobe({
        params,
        results,
      });
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6" style={styles.container}>
      {/* Animated background */}
      <div style={styles.gridOverlay} />
      <div style={styles.scanLine} />
      
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTop}>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <h2 style={styles.title}>Physics Sandbox</h2>
            <p style={styles.subtitle}>Stress-test the constraints. Break the physics.</p>
            {hasSimulationStarted && (
              <div style={{
                marginTop: '12px',
                padding: '12px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#ef4444',
              }}>
                ⚠ Simulation has started. Changes require resetting the world.
              </div>
            )}
          </div>
          <div style={styles.headerButtons}>
            <button
              className="physics-button"
              onClick={resetToDefaults}
              style={styles.button}
              disabled={hasSimulationStarted}
            >
              Reset Params
            </button>
            {hasSimulationStarted && (
              <button
                className="physics-button"
                onClick={resetSimulation}
                style={{
                  ...styles.button,
                  background: 'rgba(239, 68, 68, 0.2)',
                  borderColor: '#ef4444',
                  color: '#ef4444',
                }}
              >
                Reset World
              </button>
            )}
            <button
              className="physics-button"
              onClick={handleApplyToGlobe}
              disabled={!results.allSystemsOK}
              style={{
                ...styles.button,
                ...styles.buttonPrimary,
                animation: results.allSystemsOK ? 'glow 2s ease-in-out infinite' : 'none',
                opacity: results.allSystemsOK ? 1 : 0.5,
                cursor: results.allSystemsOK ? 'pointer' : 'not-allowed',
              }}
              title={!results.allSystemsOK ? 'Fix physics constraints before deploying' : 'Apply parameters to simulation'}
            >
              View on Globe →
            </button>
          </div>
        </div>
      </div>

      {/* Constraint Sections */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
        gap: '20px',
        position: 'relative',
        zIndex: 1,
      }}>
        
        {/* THERMAL */}
        <Section 
          title="Thermal / Radiators"
          status={
            <StatusBadge 
              ok={results.thermalOK} 
              value={`${(results.thermalMargin * 100).toFixed(0)}%`}
              okLabel="MARGIN"
              failLabel="OVERHEATING"
            />
          }
        >
          <div style={{ marginBottom: '20px' }}>
            <ThermalViz
              radiatorArea={params.radiatorAreaPerSat}
              utilization={results.radiatorUtilization}
              tempC={params.radiatorTempC}
            />
          </div>
          <Slider
            label="Radiator Area"
            value={params.radiatorAreaPerSat}
            onChange={(v) => updateParam('radiatorAreaPerSat', v)}
            min={20} max={1200} unit=" m²"
            help="Thin-film deployable radiator panels"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Emissivity"
            value={params.emissivity}
            onChange={(v) => updateParam('emissivity', v)}
            min={0.7} max={0.95} step={0.01}
            help="Surface coating efficiency (0.95 = state of art)"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Operating Temp"
            value={params.radiatorTempC}
            onChange={(v) => updateParam('radiatorTempC', v)}
            min={-20} max={60} unit="°C"
            help="Higher temp = more heat rejection"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Bus Power"
            value={params.busPowerKw}
            onChange={(v) => updateParam('busPowerKw', v)}
            min={50} max={500} unit=" kW"
            disabled={hasSimulationStarted}
          />
          
          <UtilizationGauge 
            value={results.radiatorUtilization} 
            label="Radiator Utilization"
          />
          
          <div style={styles.resultBox}>
            <LiveValue label="Heat Generated" value={results.heatGenPerSat_kW.toFixed(1)} unit=" kW" />
            <LiveValue label="Heat Rejected" value={results.heatRejectionPerSat_kW.toFixed(1)} unit=" kW" />
          </div>
        </Section>

        {/* BACKHAUL */}
        <Section 
          title="Backhaul / Bandwidth"
          status={
            <StatusBadge 
              ok={results.backhaulOK} 
              value={`${((1 - results.backhaulUtilization) * 100).toFixed(0)}%`}
              okLabel="HEADROOM"
              failLabel="SATURATED"
            />
          }
        >
          <div style={{ marginBottom: '20px' }}>
            <BackhaulViz
              opticalTerminals={params.opticalTerminals}
              linkCapacity={params.linkCapacityGbps}
              groundStations={params.groundStations}
              utilization={results.backhaulUtilization}
            />
          </div>
          <Slider
            label="Optical Terminals"
            value={params.opticalTerminals}
            onChange={(v) => updateParam('opticalTerminals', v)}
            min={1} max={1200} unit="/sat"
            help="Laser communication links per satellite"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Link Capacity"
            value={params.linkCapacityGbps}
            onChange={(v) => updateParam('linkCapacityGbps', v)}
            min={10} max={200} unit=" Gbps"
            help="100 Gbps = current tech, 200+ = roadmap"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Ground Stations"
            value={params.groundStations}
            onChange={(v) => updateParam('groundStations', v)}
            min={20} max={150}
            help="Worldwide receive stations"
            disabled={hasSimulationStarted}
          />
          
          <UtilizationGauge 
            value={results.backhaulUtilization} 
            label="Backhaul Utilization"
          />
          
          <div style={styles.resultBox}>
            <LiveValue label="Capacity/Sat" value={results.backhaulPerSat_Gbps} unit=" Gbps" />
            <LiveValue label="Coverage" value={(results.groundStationCoverage * 100).toFixed(0)} unit="%" />
          </div>
        </Section>

        {/* MAINTENANCE */}
        <Section 
          title="Maintenance / Fleet"
          status={
            <StatusBadge 
              ok={results.maintenanceOK} 
              value={`${(results.survivalRate10yr * 100).toFixed(0)}%`}
              okLabel="10YR SURVIVAL"
              failLabel="FLEET DECLINING"
            />
          }
        >
          <div style={{ marginBottom: '20px' }}>
            <MaintenanceViz
              fleetSize={params.fleetSize}
              failureRate={params.failureRatePercent}
              servicerDrones={params.servicerDrones}
              survivalRate={results.survivalRate10yr}
            />
          </div>
          <Slider
            label="Fleet Size"
            value={params.fleetSize}
            onChange={(v) => updateParam('fleetSize', v)}
            min={1000} max={10000} step={100} unit=" sats"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Failure Rate"
            value={params.failureRatePercent}
            onChange={(v) => updateParam('failureRatePercent', v)}
            min={0.5} max={10} step={0.5} unit="%/yr"
            help="Radiation, debris, component wear"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Servicer Drones"
            value={params.servicerDrones}
            onChange={(v) => updateParam('servicerDrones', v)}
            min={0} max={100}
            help="Autonomous repair robots"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Launches / Year"
            value={params.launchesPerYear}
            onChange={(v) => updateParam('launchesPerYear', v)}
            min={6} max={52}
            disabled={hasSimulationStarted}
          />
          
          <div style={styles.resultBox}>
            <LiveValue label="Failures/yr" value={results.failuresPerYear.toFixed(0)} />
            <LiveValue label="Repairs/yr" value={results.repairsPerYear.toFixed(0)} />
            <LiveValue label="Replacements/yr" value={results.replacementsPerYear.toFixed(0)} />
          </div>
        </Section>

        {/* COST ASSUMPTIONS */}
        <Section title="Cost Assumptions">
          <div style={{ marginBottom: '20px' }}>
            <CostViz
              launchCostPerKg={params.launchCostPerKg}
              launchesPerYear={params.launchesPerYear}
              satsPerLaunch={params.satsPerLaunch}
              massPerSat={results.totalMassPerSat_kg}
            />
          </div>
          <Slider
            label="Launch Cost"
            value={params.launchCostPerKg}
            onChange={(v) => updateParam('launchCostPerKg', v)}
            min={20} max={500} unit=" $/kg"
            help="Starship target: $50-100/kg"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Moore's Law Pace"
            value={params.mooresLawDoublingYears}
            onChange={(v) => updateParam('mooresLawDoublingYears', v)}
            min={1.5} max={5} step={0.5} unit=" yr"
            help="Compute efficiency doubling time"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Satellite Base Cost"
            value={params.satelliteBaseCost / 1000}
            onChange={(v) => updateParam('satelliteBaseCost', v * 1000)}
            min={50} max={500} unit="k $"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Sats per Launch"
            value={params.satsPerLaunch}
            onChange={(v) => updateParam('satsPerLaunch', v)}
            min={10} max={100}
            disabled={hasSimulationStarted}
          />
          
          <div style={styles.resultBox}>
            <LiveValue label="Mass/Sat" value={results.totalMassPerSat_kg.toFixed(0)} unit=" kg" />
            <LiveValue label="Compute/Sat" value={results.computePerSat_TFLOPS.toFixed(0)} unit=" TFLOPS" />
          </div>
        </Section>

        {/* COMPUTE / SILICON */}
        <Section 
          title="Compute / Silicon"
          status={
            <StatusBadge 
              ok={results.computeOK} 
              value={`${results.gflopsPerWatt.toFixed(0)} GF/W`}
              okLabel=""
              failLabel="UNPROTECTED"
            />
          }
        >
          <div style={{ marginBottom: '20px' }}>
            <ComputeViz
              processNode={params.processNode || 5}
              chipTdp={params.chipTdp || 300}
              radiationHardening={params.radiationHardening || 1}
              memoryPerNode={params.memoryPerNode || 128}
              efficiency={results.gflopsPerWatt}
            />
          </div>
          
          <Slider
            label="Process Node"
            value={params.processNode || 5}
            onChange={(v) => updateParam('processNode', v)}
            min={3} max={14} unit="nm"
            help="Smaller = more efficient but more radiation sensitive"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Chip TDP"
            value={params.chipTdp || 300}
            onChange={(v) => updateParam('chipTdp', v)}
            min={100} max={500} unit=" W"
            help="Power per compute module"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Radiation Hardening"
            value={params.radiationHardening || 1}
            onChange={(v) => updateParam('radiationHardening', v)}
            min={0} max={2} step={1}
            help={['Soft (consumer)', 'Standard (space-rated)', 'Full (rad-hard)'][params.radiationHardening || 1]}
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Memory / Node"
            value={params.memoryPerNode || 128}
            onChange={(v) => updateParam('memoryPerNode', v)}
            min={64} max={512} unit=" GB"
            help="HBM capacity per satellite"
            disabled={hasSimulationStarted}
          />
          
          <div style={styles.resultBox}>
            <LiveValue label="Efficiency" value={results.gflopsPerWatt.toFixed(1)} unit=" GFLOPS/W" />
            <LiveValue label="Compute/Sat" value={results.computePerSat_TFLOPS.toFixed(0)} unit=" TFLOPS" />
          </div>
        </Section>

        {/* POWER / SOLAR */}
        <Section 
          title="Power / Solar"
          status={
            <StatusBadge 
              ok={results.powerOK} 
              value={`${(results.degradationAfter10yr * 100).toFixed(0)}% @10yr`}
              okLabel=""
              failLabel="ECLIPSE FAIL"
            />
          }
        >
          <div style={{ marginBottom: '20px' }}>
            <PowerViz
              solarEfficiency={params.solarEfficiency || 32}
              degradationRate={params.degradationRate || 1.5}
              batteryBuffer={params.batteryBuffer || 45}
              powerMargin={params.powerMargin || 20}
              batteryDensity={params.batteryDensity || 300}
              batteryCost={params.batteryCost || 120}
            />
          </div>
          
          <Slider
            label="Solar Efficiency"
            value={params.solarEfficiency || 32}
            onChange={(v) => updateParam('solarEfficiency', v)}
            min={25} max={45} unit="%"
            help="Triple-junction: 32%, Perovskite tandem: 40%+"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Degradation Rate"
            value={params.degradationRate || 1.5}
            onChange={(v) => updateParam('degradationRate', v)}
            min={0.5} max={3} step={0.1} unit="%/yr"
            help="Solar cell degradation from radiation"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Battery Buffer"
            value={params.batteryBuffer || 45}
            onChange={(v) => updateParam('batteryBuffer', v)}
            min={0} max={60} unit=" min"
            help="Eclipse duration in LEO: ~35 min max"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Battery Density"
            value={params.batteryDensity || 300}
            onChange={(v) => updateParam('batteryDensity', v)}
            min={150} max={400} unit=" Wh/kg"
            help="Li-ion: 250, Solid-state: 350+"
            disabled={hasSimulationStarted}
          />
          <Slider
            label="Battery Cost"
            value={params.batteryCost || 120}
            onChange={(v) => updateParam('batteryCost', v)}
            min={50} max={300} unit=" $/kWh"
            help="Space-rated cells are 2-3x ground cost"
            disabled={hasSimulationStarted}
          />
          
          <div style={styles.resultBox}>
            <LiveValue label="Battery Mass" value={(results.batteryMass_kg || 0).toFixed(0)} unit=" kg" />
            <LiveValue label="10yr Power" value={(results.degradationAfter10yr * 100).toFixed(0)} unit="%" />
          </div>
        </Section>
      </div>

      {/* Final Status */}
      <div style={{ 
        marginTop: '20px', 
        textAlign: 'center',
        padding: '16px',
        borderRadius: '8px',
        background: results.allSystemsOK 
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.05))' 
          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05))',
        border: `1px solid ${results.allSystemsOK ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
        position: 'relative',
        zIndex: 1,
      }}>
        <span style={{ 
          color: results.allSystemsOK ? '#10b981' : '#ef4444', 
          fontSize: '12px', 
          fontWeight: 600,
          letterSpacing: '2px',
          textTransform: 'uppercase',
        }}>
          {results.allSystemsOK 
            ? '◆ All Constraints Satisfied — Physics Checks Out'
            : '▲ Constraint Violated — Adjust Parameters'
          }
        </span>
      </div>
    </div>
  );
};

export default PhysicsSandbox;
