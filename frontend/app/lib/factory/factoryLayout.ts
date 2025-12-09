/**
 * Factory layout configuration for FactoryView
 */

import type { ResourceId } from "../sim/model";

export type FactoryNodeId = 'chipFab' | 'rackLine' | 'podFactory' | 'fuelPlant' | 'methaneTank' | 'loxTank' | 'fuelTank' | 'launchComplex' | 'siliconSource' | 'steelSource';

export interface FactoryNode {
  id: FactoryNodeId;
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  width: number;
  height: number;
  label: string;
  type: 'machine' | 'storage' | 'launch' | 'source';
}

export interface FactoryEdge {
  id: string;
  from: FactoryNodeId;
  to: FactoryNodeId;
  resource: ResourceId;
}

export const FACTORY_NODES: FactoryNode[] = [
  // Sources (left column)
  { id: 'siliconSource', x: 0.05, y: 0.3, width: 0.08, height: 0.15, label: 'Silicon', type: 'source' },
  { id: 'steelSource', x: 0.05, y: 0.55, width: 0.08, height: 0.15, label: 'Steel', type: 'source' },
  
  // Machines (mid-left)
  { id: 'chipFab', x: 0.2, y: 0.3, width: 0.12, height: 0.15, label: 'Chip Fab', type: 'machine' },
  { id: 'rackLine', x: 0.35, y: 0.45, width: 0.12, height: 0.15, label: 'Rack Line', type: 'machine' },
  
  // Pod factory (mid-right)
  { id: 'podFactory', x: 0.55, y: 0.4, width: 0.12, height: 0.15, label: 'Pod Factory', type: 'machine' },
  
  // Fuel production (right side)
  { id: 'methaneTank', x: 0.75, y: 0.25, width: 0.08, height: 0.12, label: 'CH₄', type: 'storage' },
  { id: 'loxTank', x: 0.75, y: 0.4, width: 0.08, height: 0.12, label: 'LOX', type: 'storage' },
  { id: 'fuelPlant', x: 0.75, y: 0.55, width: 0.12, height: 0.15, label: 'Fuel Plant', type: 'machine' },
  { id: 'fuelTank', x: 0.88, y: 0.55, width: 0.08, height: 0.12, label: 'Fuel', type: 'storage' },
  
  // Launch complex (far right)
  { id: 'launchComplex', x: 0.88, y: 0.75, width: 0.1, height: 0.2, label: 'Launch', type: 'launch' },
];

export const FACTORY_EDGES: FactoryEdge[] = [
  // Silicon → Chips
  { id: 'edge_silicon_chips', from: 'siliconSource', to: 'chipFab', resource: 'silicon' },
  { id: 'edge_chips_racks', from: 'chipFab', to: 'rackLine', resource: 'chips' },
  
  // Steel → Racks
  { id: 'edge_steel_racks', from: 'steelSource', to: 'rackLine', resource: 'steel' },
  
  // Racks + Chips → Pods
  { id: 'edge_chips_pods', from: 'chipFab', to: 'podFactory', resource: 'chips' },
  { id: 'edge_racks_pods', from: 'rackLine', to: 'podFactory', resource: 'racks' },
  
  // Fuel production
  { id: 'edge_methane_fuel', from: 'methaneTank', to: 'fuelPlant', resource: 'methane' },
  { id: 'edge_lox_fuel', from: 'loxTank', to: 'fuelPlant', resource: 'lox' },
  { id: 'edge_fuel_tank', from: 'fuelPlant', to: 'fuelTank', resource: 'fuel' },
  
  // Launch
  { id: 'edge_pods_launch', from: 'podFactory', to: 'launchComplex', resource: 'pods' },
  { id: 'edge_fuel_launch', from: 'fuelTank', to: 'launchComplex', resource: 'fuel' },
];

/**
 * Get resource color for edges
 */
export function getResourceColor(resource: ResourceId): string {
  const colors: Partial<Record<ResourceId, string>> = {
    silicon: '#94a3b8', // slate
    steel: '#64748b', // slate-500
    chips: '#06b6d4', // cyan
    racks: '#eab308', // yellow
    pods: '#d946ef', // magenta
    methane: '#3b82f6', // blue
    lox: '#60a5fa', // blue-400
    fuel: '#f97316', // orange
    launches: '#ef4444', // red
    computeUnits: '#10b981', // green
    launchOpsResource: '#8b5cf6', // purple
  };
  return colors[resource] || '#ffffff';
}

