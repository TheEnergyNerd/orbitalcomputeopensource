"use client";

import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

// ============================================================================
// TYPES
// ============================================================================

interface OrbitalResults {
  totalMassKg: number;
  hardwareCost: number;
  launchCost: number;
  opsCost: number;
  gpuReplacementCost: number;
  nreCost: number;
  baseCost: number;
  totalCost: number;
  energyMWh: number;
  costPerW: number;
  lcoe: number;
  satelliteCount: number;
  arrayAreaKm2: number;
  singleSatArrayM2: number;
  starshipLaunches: number;
  loxGallons: number;
  methaneGallons: number;
  avgCapacityFactor: number;
  degradationMargin: number;
  solarMarginPct: number;
  gpuMarginPct: number;
  actualInitialPowerW: number;
  requiredInitialPowerW: number;
}

interface TerrestrialResults {
  powerGenCost: number;
  powerGenCostPerW: number;
  electricalCost: number;
  mechanicalCost: number;
  civilCost: number;
  networkCost: number;
  infraCapex: number;
  facilityCapexPerW: number;
  fuelCostPerMWh: number;
  fuelCostTotal: number;
  fuelCostPerWYear: number;
  totalCost: number;
  energyMWh: number;
  generationMWh: number;
  costPerW: number;
  lcoe: number;
  gasConsumptionBCF: number;
  turbineCount: number;
  totalGenerationMW: number;
  capacityFactor: number;
  pue: number;
}

// ============================================================================
// CONSTANTS (from McCalip's math.js)
// ============================================================================

const CONSTANTS = {
  TARGET_POWER_MW: 1000,
  HOURS_PER_YEAR: 8760,
  STARLINK_MASS_KG: 740,
  STARLINK_POWER_KW: 27,
  STARLINK_ARRAY_M2: 116,
  STARSHIP_PAYLOAD_KG: 100000,
  STARSHIP_LOX_GAL_PER_LAUNCH: 787000,
  STARSHIP_METHANE_GAL_PER_LAUNCH: 755000,
  NGCC_ACRES: 30,
  NGCC_HEAT_RATE_BTU_KWH: 6370,
  GE_7HA_POWER_MW: 430,
  BTU_PER_CF: 1000,
  CF_PER_BCF: 1e9,
  ORBITAL_OPS_FRAC: 0.01,
  NATGAS_OVERHEAD_FRAC: 0.04,
  NATGAS_MAINTENANCE_FRAC: 0.03,
  NATGAS_COMMS_FRAC: 0.01,
  SOLAR_IRRADIANCE_W_M2: 1361,
  EARTH_IR_FLUX_W_M2: 237,
  EARTH_ALBEDO_FACTOR: 0.30,
  T_SPACE_K: 3,
  EARTH_RADIUS_KM: 6371.0,
};

// ============================================================================
// CALCULATIONS (from McCalip's math.js)
// ============================================================================

function calculateOrbital(params: {
  years: number;
  targetGW: number;
  launchCostPerKg: number;
  satelliteCostPerW: number;
  specificPowerWPerKg: number;
  satellitePowerKW: number;
  sunFraction: number;
  cellDegradation: number;
  gpuFailureRate: number;
  nreCost: number;
}): OrbitalResults {
  const { years, targetGW, launchCostPerKg, satelliteCostPerW, specificPowerWPerKg, 
          satellitePowerKW, sunFraction, cellDegradation, gpuFailureRate, nreCost } = params;
  
  const targetPowerMW = targetGW * 1000;
  const targetPowerW = targetPowerMW * 1e6;
  const targetPowerKW = targetPowerMW * 1000;
  const totalHours = years * CONSTANTS.HOURS_PER_YEAR;
  
  // Degradation calculation
  const annualRetention = 1 - (cellDegradation / 100);
  let capacitySum = 0;
  for (let year = 0; year < years; year++) {
    capacitySum += Math.pow(annualRetention, year);
  }
  const avgCapacityFactor = capacitySum / years;
  const sunlightAdjustedFactor = avgCapacityFactor * sunFraction;
  const requiredInitialPowerW = targetPowerW / sunlightAdjustedFactor;
  
  // Satellite sizing
  const massPerSatelliteKg = (satellitePowerKW * 1000) / specificPowerWPerKg;
  const satelliteCount = Math.ceil(requiredInitialPowerW / (satellitePowerKW * 1000));
  const totalMassKg = satelliteCount * massPerSatelliteKg;
  const actualInitialPowerW = satelliteCount * satellitePowerKW * 1000;
  
  // Costs
  const hardwareCost = satelliteCostPerW * actualInitialPowerW;
  const launchCost = launchCostPerKg * totalMassKg;
  const baseCost = hardwareCost + launchCost;
  const opsCost = hardwareCost * CONSTANTS.ORBITAL_OPS_FRAC * years;
  const gpuReplacementCost = hardwareCost * (gpuFailureRate / 100) * years;
  const nreCostTotal = nreCost * 1e6;
  const totalCost = baseCost + opsCost + gpuReplacementCost + nreCostTotal;
  
  // Energy output
  const energyMWh = targetPowerMW * totalHours;
  const costPerW = totalCost / targetPowerW;
  const lcoe = totalCost / energyMWh;
  
  // Engineering outputs
  const arrayPerSatelliteM2 = CONSTANTS.STARLINK_ARRAY_M2 * (satellitePowerKW / CONSTANTS.STARLINK_POWER_KW);
  const arrayAreaM2 = satelliteCount * arrayPerSatelliteM2;
  const arrayAreaKm2 = arrayAreaM2 / 1e6;
  const starshipLaunches = Math.ceil(totalMassKg / CONSTANTS.STARSHIP_PAYLOAD_KG);
  const loxGallons = starshipLaunches * CONSTANTS.STARSHIP_LOX_GAL_PER_LAUNCH;
  const methaneGallons = starshipLaunches * CONSTANTS.STARSHIP_METHANE_GAL_PER_LAUNCH;
  const degradationMargin = (actualInitialPowerW / targetPowerW - 1) * 100;
  const solarMarginPct = degradationMargin;
  const gpuMarginPct = gpuFailureRate * years;
  
  return {
    totalMassKg,
    hardwareCost,
    launchCost,
    opsCost,
    gpuReplacementCost,
    nreCost: nreCostTotal,
    baseCost,
    totalCost,
    energyMWh,
    costPerW,
    lcoe,
    satelliteCount,
    arrayAreaKm2,
    singleSatArrayM2: arrayPerSatelliteM2,
    starshipLaunches,
    loxGallons,
    methaneGallons,
    avgCapacityFactor,
    degradationMargin,
    solarMarginPct,
    gpuMarginPct,
    actualInitialPowerW,
    requiredInitialPowerW,
  };
}

function calculateTerrestrial(params: {
  years: number;
  targetGW: number;
  gasTurbineCapexPerKW: number;
  electricalCostPerW: number;
  mechanicalCostPerW: number;
  civilCostPerW: number;
  networkCostPerW: number;
  pue: number;
  gasPricePerMMBtu: number;
  heatRateBtuKwh: number;
  capacityFactor: number;
}): TerrestrialResults {
  const { years, targetGW, gasTurbineCapexPerKW, electricalCostPerW, mechanicalCostPerW,
          civilCostPerW, networkCostPerW, pue, gasPricePerMMBtu, heatRateBtuKwh, capacityFactor } = params;
  
  const targetPowerMW = targetGW * 1000;
  const targetPowerW = targetPowerMW * 1e6;
  const totalHours = years * CONSTANTS.HOURS_PER_YEAR;
  
  // Capex
  const powerGenCostPerW = gasTurbineCapexPerKW * pue / 1000;
  const powerGenCost = powerGenCostPerW * targetPowerW;
  const electricalCost = electricalCostPerW * targetPowerW;
  const mechanicalCost = mechanicalCostPerW * targetPowerW;
  const civilCost = civilCostPerW * targetPowerW;
  const networkCost = networkCostPerW * targetPowerW;
  const infraCapex = powerGenCost + electricalCost + mechanicalCost + civilCost + networkCost;
  const facilityCapexPerW = powerGenCostPerW + electricalCostPerW + mechanicalCostPerW + 
                             civilCostPerW + networkCostPerW;
  
  // Opex
  const energyMWh = targetPowerMW * totalHours * capacityFactor;
  const generationMWh = energyMWh * pue;
  const fuelCostPerMWh = heatRateBtuKwh * gasPricePerMMBtu / 1000;
  const fuelCostTotal = fuelCostPerMWh * generationMWh;
  
  // Totals
  const totalCost = infraCapex + fuelCostTotal;
  const costPerW = totalCost / targetPowerW;
  const lcoe = totalCost / energyMWh;
  
  // Engineering
  const generationKWh = generationMWh * 1000;
  const totalBTU = generationKWh * heatRateBtuKwh;
  const gasConsumptionBCF = totalBTU / CONSTANTS.BTU_PER_CF / CONSTANTS.CF_PER_BCF;
  const totalGenerationMW = targetPowerMW * pue;
  const turbineCount = Math.ceil(totalGenerationMW / CONSTANTS.GE_7HA_POWER_MW);
  const fuelCostPerWYear = fuelCostPerMWh * pue * 0.00876;
  
  return {
    powerGenCost,
    powerGenCostPerW,
    electricalCost,
    mechanicalCost,
    civilCost,
    networkCost,
    infraCapex,
    facilityCapexPerW,
    fuelCostPerMWh,
    fuelCostTotal,
    fuelCostPerWYear,
    totalCost,
    energyMWh,
    generationMWh,
    costPerW,
    lcoe,
    gasConsumptionBCF,
    turbineCount,
    totalGenerationMW,
    capacityFactor,
    pue,
  };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function McCalipPage() {
  // State - matching McCalip's defaults
  const [years, setYears] = useState(5);
  const [targetGW, setTargetGW] = useState(1);
  
  // Orbital parameters
  const [launchCostPerKg, setLaunchCostPerKg] = useState(500);
  const [satelliteCostPerW, setSatelliteCostPerW] = useState(22);
  const [specificPowerWPerKg, setSpecificPowerWPerKg] = useState(36.5);
  const [satellitePowerKW, setSatellitePowerKW] = useState(27);
  const [sunFraction, setSunFraction] = useState(0.98);
  const [cellDegradation, setCellDegradation] = useState(2.5);
  const [gpuFailureRate, setGpuFailureRate] = useState(9);
  const [nreCost, setNreCost] = useState(1000);
  
  // Terrestrial parameters
  const [gasTurbineCapexPerKW, setGasTurbineCapexPerKW] = useState(1800);
  const [electricalCostPerW, setElectricalCostPerW] = useState(5.25);
  const [mechanicalCostPerW, setMechanicalCostPerW] = useState(3.0);
  const [civilCostPerW, setCivilCostPerW] = useState(2.5);
  const [networkCostPerW, setNetworkCostPerW] = useState(1.75);
  const [pue, setPue] = useState(1.2);
  const [gasPricePerMMBtu, setGasPricePerMMBtu] = useState(4.30);
  const [heatRateBtuKwh, setHeatRateBtuKwh] = useState(6200);
  const [capacityFactor, setCapacityFactor] = useState(0.85);
  
  // Calculations
  const orbitalResults = useMemo(() => calculateOrbital({
    years,
    targetGW,
    launchCostPerKg,
    satelliteCostPerW,
    specificPowerWPerKg,
    satellitePowerKW,
    sunFraction,
    cellDegradation,
    gpuFailureRate,
    nreCost,
  }), [years, targetGW, launchCostPerKg, satelliteCostPerW, specificPowerWPerKg, 
       satellitePowerKW, sunFraction, cellDegradation, gpuFailureRate, nreCost]);
  
  const terrestrialResults = useMemo(() => calculateTerrestrial({
    years,
    targetGW,
    gasTurbineCapexPerKW,
    electricalCostPerW,
    mechanicalCostPerW,
    civilCostPerW,
    networkCostPerW,
    pue,
    gasPricePerMMBtu,
    heatRateBtuKwh,
    capacityFactor,
  }), [years, targetGW, gasTurbineCapexPerKW, electricalCostPerW, mechanicalCostPerW,
       civilCostPerW, networkCostPerW, pue, gasPricePerMMBtu, heatRateBtuKwh, capacityFactor]);
  
  // Chart data
  const orbitalChartData = useMemo(() => [
    { name: 'Satellite', value: orbitalResults.hardwareCost / 1e9, color: '#3b82f6' },
    { name: 'Launch', value: orbitalResults.launchCost / 1e9, color: '#2563eb' },
    { name: 'Ops (1%/yr)', value: orbitalResults.opsCost / 1e9, color: '#1d4ed8' },
    { name: 'NRE + Repl', value: (orbitalResults.nreCost + orbitalResults.gpuReplacementCost) / 1e9, color: '#1e40af' },
  ], [orbitalResults]);
  
  const terrestrialChartData = useMemo(() => [
    { name: 'Power Gen', value: terrestrialResults.powerGenCost / 1e9, color: '#ef4444' },
    { name: 'Electrical', value: terrestrialResults.electricalCost / 1e9, color: '#dc2626' },
    { name: 'Mechanical', value: terrestrialResults.mechanicalCost / 1e9, color: '#b91c1c' },
    { name: 'Civil/Shell', value: terrestrialResults.civilCost / 1e9, color: '#991b1b' },
    { name: 'Fit-out', value: terrestrialResults.networkCost / 1e9, color: '#7f1d1d' },
    { name: 'Fuel', value: terrestrialResults.fuelCostTotal / 1e9, color: '#dc2626' },
  ], [terrestrialResults]);
  
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
        <div className="max-w-6xl mx-auto px-6 py-8">
          <a href="/" className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block">← Back</a>
          <h1 className="text-4xl font-bold text-gray-900 mb-3 leading-tight">
            Economics of Orbital vs<br />
            Terrestrial Data Centers
          </h1>
          <p className="text-lg text-gray-600 italic">
            It might not be rational
          </p>
          <p className="text-lg text-gray-600 italic mt-1">
            But
          </p>
          <p className="text-lg text-gray-600 italic mt-1">
            It might be physically possible
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Comparison Sidebar - Fixed Position */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Orbital Column */}
          <div className="border border-gray-300 rounded-lg p-6 bg-blue-50">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-4 h-4 bg-blue-600 rounded"></div>
                <h3 className="text-xl font-bold text-gray-900">Orbital Solar</h3>
              </div>
              <p className="text-3xl font-bold text-gray-900 font-mono">
                ${(orbitalResults.totalCost / 1e9).toFixed(1)}B
              </p>
            </div>
            
            {/* Bar Chart */}
            <div className="mb-6 space-y-3">
              {orbitalChartData.map((item) => (
                <div key={item.name} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">{item.name}</span>
                    <span className="font-mono font-semibold text-gray-900">${item.value.toFixed(1)}B</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded h-4 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${(item.value / (orbitalResults.totalCost / 1e9)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            
            {/* Stats Table */}
            <div className="space-y-2 text-sm border-t border-gray-300 pt-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Cost per Watt</span>
                <span className="font-mono font-semibold text-gray-900">${orbitalResults.costPerW.toFixed(2)}/W</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">LCOE</span>
                <span className="font-mono font-semibold text-gray-900">${orbitalResults.lcoe.toFixed(0)}/MWh</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Mass to LEO</span>
                <span className="font-mono font-semibold text-gray-900">{(orbitalResults.totalMassKg / 1e6).toFixed(1)}M kg</span>
              </div>
            </div>
          </div>

          {/* Terrestrial Column */}
          <div className="border border-gray-300 rounded-lg p-6 bg-red-50">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-4 h-4 bg-red-600 rounded"></div>
                <h3 className="text-xl font-bold text-gray-900">Terrestrial</h3>
              </div>
              <p className="text-3xl font-bold text-gray-900 font-mono">
                ${(terrestrialResults.totalCost / 1e9).toFixed(1)}B
              </p>
            </div>
            
            {/* Bar Chart */}
            <div className="mb-6 space-y-3">
              {terrestrialChartData.map((item) => (
                <div key={item.name} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">{item.name}</span>
                    <span className="font-mono font-semibold text-gray-900">${item.value.toFixed(1)}B</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded h-4 overflow-hidden">
                    <div
                      className="h-full bg-red-600 transition-all duration-300"
                      style={{ width: `${(item.value / (terrestrialResults.totalCost / 1e9)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            
            {/* Stats Table */}
            <div className="space-y-2 text-sm border-t border-gray-300 pt-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Cost per Watt</span>
                <span className="font-mono font-semibold text-gray-900">${terrestrialResults.costPerW.toFixed(2)}/W</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">LCOE</span>
                <span className="font-mono font-semibold text-gray-900">${terrestrialResults.lcoe.toFixed(0)}/MWh</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Capex</span>
                <span className="font-mono font-semibold text-gray-900">${terrestrialResults.facilityCapexPerW.toFixed(2)}/W</span>
              </div>
            </div>
          </div>
        </div>

        {/* Engineering Parameters */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Engineering · System Parameters</h2>
          
          {/* Shared Parameters */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Shared Parameters</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Slider
                label="Target Capacity"
                value={targetGW}
                onChange={setTargetGW}
                min={0.1}
                max={5}
                step={0.1}
                unit=" GW"
              />
              <Slider
                label="Analysis Period"
                value={years}
                onChange={setYears}
                min={3}
                max={10}
                step={1}
                unit=" years"
              />
            </div>
          </div>
          
          {/* Orbital Parameters */}
          <div className="mb-8 border-t border-gray-200 pt-8">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Orbital Solar</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Slider
                label="Launch Cost to LEO"
                value={launchCostPerKg}
                onChange={setLaunchCostPerKg}
                min={20}
                max={3000}
                step={50}
                unit=" $/kg"
                help="Starship target: $100-200/kg"
              />
              <Slider
                label="Satellite Hardware Cost"
                value={satelliteCostPerW}
                onChange={setSatelliteCostPerW}
                min={1}
                max={50}
                step={1}
                unit=" $/W"
                help="V2 Mini: $22/W"
              />
              <Slider
                label="Specific Power"
                value={specificPowerWPerKg}
                onChange={setSpecificPowerWPerKg}
                min={3}
                max={100}
                step={0.5}
                unit=" W/kg"
                help="V2 Mini: 36.5 W/kg"
              />
              <Slider
                label="Satellite Size"
                value={satellitePowerKW}
                onChange={setSatellitePowerKW}
                min={5}
                max={150}
                step={1}
                unit=" kW"
                help="V2 Mini: 27 kW"
              />
              <Slider
                label="Orbit Sunlight Fraction"
                value={sunFraction * 100}
                onChange={(v) => setSunFraction(v / 100)}
                min={60}
                max={98}
                step={1}
                unit="%"
                help="Terminator: 98%"
              />
              <Slider
                label="Cell Degradation"
                value={cellDegradation}
                onChange={setCellDegradation}
                min={1}
                max={12}
                step={0.1}
                unit="%/yr"
                help="Silicon: 2.5%/yr"
              />
              <Slider
                label="GPU Failure Rate"
                value={gpuFailureRate}
                onChange={setGpuFailureRate}
                min={0}
                max={20}
                step={0.5}
                unit="%/yr"
                help="Meta: 9%/yr"
              />
              <Slider
                label="NRE (Development)"
                value={nreCost}
                onChange={setNreCost}
                min={0}
                max={10000}
                step={100}
                unit="M $"
                help="Default: $1B"
              />
            </div>
          </div>
          
          {/* Terrestrial Parameters */}
          <div className="mb-8 border-t border-gray-200 pt-8">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Terrestrial (On-Site CCGT)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Slider
                label="Gas Turbine Capex"
                value={gasTurbineCapexPerKW}
                onChange={setGasTurbineCapexPerKW}
                min={1450}
                max={2300}
                step={50}
                unit=" $/kW"
                help="Frame CCGT: $1,800/kW"
              />
              <Slider
                label="Electrical Cost"
                value={electricalCostPerW}
                onChange={setElectricalCostPerW}
                min={3}
                max={8}
                step={0.25}
                unit=" $/W"
                help="Default: $5.25/W"
              />
              <Slider
                label="Mechanical Cost"
                value={mechanicalCostPerW}
                onChange={setMechanicalCostPerW}
                min={2}
                max={5}
                step={0.25}
                unit=" $/W"
                help="Default: $3.00/W"
              />
              <Slider
                label="Civil/Shell Cost"
                value={civilCostPerW}
                onChange={setCivilCostPerW}
                min={1.5}
                max={4}
                step={0.25}
                unit=" $/W"
                help="Default: $2.50/W"
              />
              <Slider
                label="Network/Fit-out Cost"
                value={networkCostPerW}
                onChange={setNetworkCostPerW}
                min={1}
                max={3}
                step={0.25}
                unit=" $/W"
                help="Default: $1.75/W"
              />
              <Slider
                label="PUE"
                value={pue}
                onChange={setPue}
                min={1.1}
                max={1.5}
                step={0.05}
                help="Liquid cooled: 1.2"
              />
              <Slider
                label="Gas Price"
                value={gasPricePerMMBtu}
                onChange={setGasPricePerMMBtu}
                min={2}
                max={10}
                step={0.1}
                unit=" $/MMBtu"
                help="EIA 2025: $4.30/MMBtu"
              />
              <Slider
                label="Heat Rate"
                value={heatRateBtuKwh}
                onChange={setHeatRateBtuKwh}
                min={5800}
                max={6560}
                step={50}
                unit=" BTU/kWh"
                help="Frame CCGT: 6,200 BTU/kWh"
              />
              <Slider
                label="Capacity Factor"
                value={capacityFactor * 100}
                onChange={(v) => setCapacityFactor(v / 100)}
                min={70}
                max={95}
                step={1}
                unit="%"
                help="Default: 85%"
              />
            </div>
          </div>
        </section>

        {/* Engineering Outputs */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Engineering · System Outputs</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Orbital Outputs */}
            <div className="border border-gray-300 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Orbital Solar</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Satellite Count</span>
                  <span className="font-mono font-semibold text-gray-900">~{orbitalResults.satelliteCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">GPU Margin (failures)</span>
                  <span className="font-mono font-semibold text-gray-900">+{orbitalResults.gpuMarginPct.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Solar Margin (degr.)</span>
                  <span className="font-mono font-semibold text-gray-900">+{orbitalResults.solarMarginPct.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Mass to LEO</span>
                  <span className="font-mono font-semibold text-gray-900">{(orbitalResults.totalMassKg / 1e6).toFixed(1)}M kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Fleet Array Area</span>
                  <span className="font-mono font-semibold text-gray-900">{orbitalResults.arrayAreaKm2.toFixed(2)} km²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Single Sat Array</span>
                  <span className="font-mono font-semibold text-gray-900">{orbitalResults.singleSatArrayM2.toFixed(0)} m²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Starship Launches</span>
                  <span className="font-mono font-semibold text-gray-900">~{orbitalResults.starshipLaunches}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">LOX Required</span>
                  <span className="font-mono font-semibold text-gray-900">{(orbitalResults.loxGallons / 1e6).toFixed(0)}M gal</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Methane Required</span>
                  <span className="font-mono font-semibold text-gray-900">{(orbitalResults.methaneGallons / 1e6).toFixed(0)}M gal</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Energy Output</span>
                  <span className="font-mono font-semibold text-gray-900">{(orbitalResults.energyMWh / 1e6).toFixed(1)} MWhr</span>
                </div>
              </div>
            </div>
            
            {/* Terrestrial Outputs */}
            <div className="border border-gray-300 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Terrestrial</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">H-Class Turbines</span>
                  <span className="font-mono font-semibold text-gray-900">{terrestrialResults.turbineCount} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Generation (IT×PUE)</span>
                  <span className="font-mono font-semibold text-gray-900">{terrestrialResults.totalGenerationMW.toFixed(1)} GW</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Heat Rate</span>
                  <span className="font-mono font-semibold text-gray-900">{(terrestrialResults as any).heatRateBtuKwh ?? 'N/A'} BTU/kWh</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Fuel Cost</span>
                  <span className="font-mono font-semibold text-gray-900">${terrestrialResults.fuelCostPerMWh.toFixed(0)}/MWh</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Capacity Factor</span>
                  <span className="font-mono font-semibold text-gray-900">{(terrestrialResults.capacityFactor * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Gas Consumption</span>
                  <span className="font-mono font-semibold text-gray-900">{terrestrialResults.gasConsumptionBCF.toFixed(1)} BCF</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Energy Output</span>
                  <span className="font-mono font-semibold text-gray-900">{(terrestrialResults.energyMWh / 1e6).toFixed(1)} MWhr</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

