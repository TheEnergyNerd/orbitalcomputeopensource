/**
 * Core data model for Factorio-style production chain simulation
 */

export type ResourceId = 'silicon' | 'steel' | 'chips' | 'racks' | 'pods' | 'methane' | 'lox' | 'fuel' | 'launches';

export interface ResourceState {
  id: ResourceId;
  name: string;
  units: string;     // "wafers", "racks", "pods", "t", "launches"
  buffer: number;    // current stock
  prodPerMin: number;
  consPerMin: number;
  isSource?: boolean;      // true for infinite source resources (silicon, steel, methane, lox)
  baseSourceRate?: number; // production rate for source resources
}

export type MachineId = 'chipFab' | 'rackLine' | 'podFactory' | 'fuelPlant' | 'launchComplex';

export interface Machine {
  id: MachineId;
  name: string;
  lines: number;
  baseOutputPerLine: number; // units/min resource produced
  inputRates: Partial<Record<ResourceId, number>>; // units/min consumed per line
  outputResource: ResourceId;
  upgrades: {
    speedLevel: number;      // 0…N
    efficiencyLevel: number; // 0…N
  };
  // Constraint metadata
  powerDrawMW: number;      // Power draw per line
  heatMW: number;           // Heat output per line
  workers: number;          // Workers required per line
  footprint: {              // Grid cells occupied
    width: number;
    height: number;
  };
}

export interface FlowEdge {
  from: ResourceId;
  to: ResourceId;
}

export interface FactoryConstraints {
  powerCapacityMW: number;
  powerUsedMW: number;
  coolingCapacityMW: number;
  coolingUsedMW: number;
  workforceTotal: number;
  workforceUsed: number;
  gridWidth: number;
  gridHeight: number;
  gridOccupied: boolean[][]; // 2D grid of occupied cells
}

import type { OrbitalPodSpec, GroundDcSpec } from "./orbitConfig";
import { DEFAULT_ORBITAL_POD_SPEC, DEFAULT_GROUND_DC_SPEC } from "./orbitConfig";

export interface SimState {
  resources: Record<ResourceId, ResourceState>;
  machines: Record<MachineId, Machine>;
  flows: FlowEdge[];
  timeScale: 1 | 10 | 100;
  rdPoints: number;
  constraints: FactoryConstraints;
  // Orbit configs
  orbitalPodSpec: OrbitalPodSpec;
  groundDcSpec: GroundDcSpec;
  // Simple state
  podsInOrbit: number;
  targetComputeKw: number; // Total compute demand
}

/**
 * Create initial simulation state with reasonable defaults
 */
export function createInitialSimState(): SimState {
  const resources: Record<ResourceId, ResourceState> = {
    silicon: {
      id: 'silicon',
      name: 'Silicon',
      units: 'wafers',
      buffer: 10000, // Large buffer for visual feedback
      prodPerMin: 0,
      consPerMin: 0,
      isSource: true,
      baseSourceRate: 1000, // Enough to support multiple chip fab lines
    },
    steel: {
      id: 'steel',
      name: 'Steel',
      units: 't',
      buffer: 5000, // Large buffer for visual feedback
      prodPerMin: 0,
      consPerMin: 0,
      isSource: true,
      baseSourceRate: 50, // Enough to support rack lines
    },
    chips: {
      id: 'chips',
      name: 'Chips',
      units: 'units',
      buffer: 0,
      prodPerMin: 0,
      consPerMin: 0,
    },
    racks: {
      id: 'racks',
      name: 'Racks',
      units: 'units',
      buffer: 0,
      prodPerMin: 0,
      consPerMin: 0,
    },
    pods: {
      id: 'pods',
      name: 'Pods',
      units: 'pods',
      buffer: 0,
      prodPerMin: 0,
      consPerMin: 0,
    },
    methane: {
      id: 'methane',
      name: 'Methane',
      units: 't',
      buffer: 1000, // Large buffer for visual feedback
      prodPerMin: 0,
      consPerMin: 0,
      isSource: true,
      baseSourceRate: 100, // Enough to support fuel plant
    },
    lox: {
      id: 'lox',
      name: 'LOX',
      units: 't',
      buffer: 1000, // Large buffer for visual feedback
      prodPerMin: 0,
      consPerMin: 0,
      isSource: true,
      baseSourceRate: 100, // Enough to support fuel plant
    },
    fuel: {
      id: 'fuel',
      name: 'Fuel',
      units: 't',
      buffer: 0,
      prodPerMin: 0,
      consPerMin: 0,
    },
    launches: {
      id: 'launches',
      name: 'Launches',
      units: 'launches',
      buffer: 0,
      prodPerMin: 0,
      consPerMin: 0,
    },
  };

  const machines: Record<MachineId, Machine> = {
    chipFab: {
      id: 'chipFab',
      name: 'Chip Fab',
      lines: 1,
      baseOutputPerLine: 200, // chips/min
      inputRates: {
        silicon: 100, // wafers/min per line
      },
      outputResource: 'chips',
      upgrades: {
        speedLevel: 0,
        efficiencyLevel: 0,
      },
      powerDrawMW: 2.0,
      heatMW: 1.5,
      workers: 5,
      footprint: { width: 2, height: 2 },
    },
    rackLine: {
      id: 'rackLine',
      name: 'Rack Line',
      lines: 1,
      baseOutputPerLine: 10, // racks/min
      inputRates: {
        steel: 5, // t/min per line
        chips: 50, // chips/min per line
      },
      outputResource: 'racks',
      upgrades: {
        speedLevel: 0,
        efficiencyLevel: 0,
      },
      powerDrawMW: 1.0,
      heatMW: 0.8,
      workers: 3,
      footprint: { width: 2, height: 1 },
    },
    podFactory: {
      id: 'podFactory',
      name: 'Pod Factory',
      lines: 1,
      baseOutputPerLine: 0.125, // pods/min (1 pod per 8 min)
      inputRates: {
        chips: 300, // chips/min per line
        racks: 10, // racks/min per line
      },
      outputResource: 'pods',
      upgrades: {
        speedLevel: 0,
        efficiencyLevel: 0,
      },
      powerDrawMW: 3.0,
      heatMW: 2.0,
      workers: 8,
      footprint: { width: 3, height: 2 },
    },
    fuelPlant: {
      id: 'fuelPlant',
      name: 'Fuel Plant',
      lines: 1,
      baseOutputPerLine: 50, // t/min
      inputRates: {
        methane: 30, // t/min per line
        lox: 20, // t/min per line
      },
      outputResource: 'fuel',
      upgrades: {
        speedLevel: 0,
        efficiencyLevel: 0,
      },
      powerDrawMW: 1.5,
      heatMW: 1.2,
      workers: 4,
      footprint: { width: 2, height: 2 },
    },
    launchComplex: {
      id: 'launchComplex',
      name: 'Launch Complex',
      lines: 1,
      baseOutputPerLine: 0.0083, // launches/min (1 launch per 120 min = 2 hours)
      inputRates: {
        pods: 1, // pods/min per line
        fuel: 10, // t/min per line
      },
      outputResource: 'launches',
      upgrades: {
        speedLevel: 0,
        efficiencyLevel: 0,
      },
      powerDrawMW: 5.0,
      heatMW: 3.0,
      workers: 12,
      footprint: { width: 4, height: 3 },
    },
  };

  const flows: FlowEdge[] = [
    { from: 'silicon', to: 'chips' },
    { from: 'steel', to: 'racks' },
    { from: 'chips', to: 'racks' },
    { from: 'chips', to: 'pods' },
    { from: 'racks', to: 'pods' },
    { from: 'methane', to: 'fuel' },
    { from: 'lox', to: 'fuel' },
    { from: 'pods', to: 'launches' },
    { from: 'fuel', to: 'launches' },
  ];

  // Initialize factory constraints
  const gridWidth = 12;
  const gridHeight = 8;
  const constraints: FactoryConstraints = {
    powerCapacityMW: 50,      // Initial power capacity
    powerUsedMW: 0,
    coolingCapacityMW: 40,     // Initial cooling capacity
    coolingUsedMW: 0,
    workforceTotal: 50,        // Initial workforce
    workforceUsed: 0,
    gridWidth,
    gridHeight,
    gridOccupied: Array(gridHeight).fill(null).map(() => Array(gridWidth).fill(false)),
  };

  return {
    resources,
    machines,
    flows,
    timeScale: 1,
    rdPoints: 0,
    constraints,
    orbitalPodSpec: DEFAULT_ORBITAL_POD_SPEC,
    groundDcSpec: DEFAULT_GROUND_DC_SPEC,
    podsInOrbit: 0,
    targetComputeKw: 42000, // 42 GW baseline ground capacity
  };
}

/**
 * Upgrade definitions
 */
export interface Upgrade {
  id: string;
  name: string;
  machineId: MachineId;
  type: 'speed' | 'efficiency';
  level: number;
  cost: number; // RD points
  effect: number; // multiplier or reduction
}

export const UPGRADES: Upgrade[] = [
  // Speed upgrades
  { id: 'chipFab_speed_1', name: 'Chip Fab Speed +20%', machineId: 'chipFab', type: 'speed', level: 1, cost: 10, effect: 1.2 },
  { id: 'chipFab_speed_2', name: 'Chip Fab Speed +40%', machineId: 'chipFab', type: 'speed', level: 2, cost: 25, effect: 1.4 },
  { id: 'rackLine_speed_1', name: 'Rack Line Speed +20%', machineId: 'rackLine', type: 'speed', level: 1, cost: 10, effect: 1.2 },
  { id: 'podFactory_speed_1', name: 'Pod Factory Speed +20%', machineId: 'podFactory', type: 'speed', level: 1, cost: 20, effect: 1.2 },
  { id: 'fuelPlant_speed_1', name: 'Fuel Plant Speed +20%', machineId: 'fuelPlant', type: 'speed', level: 1, cost: 15, effect: 1.2 },
  { id: 'launchComplex_speed_1', name: 'Launch Complex Speed +20%', machineId: 'launchComplex', type: 'speed', level: 1, cost: 30, effect: 1.2 },
  
  // Efficiency upgrades (reduce input consumption)
  { id: 'chipFab_eff_1', name: 'Chip Fab Efficiency +10%', machineId: 'chipFab', type: 'efficiency', level: 1, cost: 15, effect: 0.9 },
  { id: 'rackLine_eff_1', name: 'Rack Line Efficiency +10%', machineId: 'rackLine', type: 'efficiency', level: 1, cost: 15, effect: 0.9 },
  { id: 'podFactory_eff_1', name: 'Pod Factory Efficiency +10%', machineId: 'podFactory', type: 'efficiency', level: 1, cost: 25, effect: 0.9 },
];

