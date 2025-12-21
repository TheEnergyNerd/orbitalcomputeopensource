/**
 * Regional Ground Supply Model
 */

export interface Region {
  id: string;
  name: string;
  
  baseEnergyCostMwh: number;
  baseGridChargeKwMonth: number;
  baseSiteCapexMwYear: number;
  scarcityMaxAdder: number;
  
  initialCapacityMw: number;
  baseBuildRateMwYear: number;
  maxBuildRateMwYear: number;
  
  waterConstraintFactor: number;
  latencyPenalty: number;
  
  currentCapacityMw?: number;
  currentBuildRateMwYear?: number;
  backlogMw?: number;
}

export const REGIONS: Region[] = [
  {
    id: 'quebec',
    name: 'Quebec (Hydro-Quebec)',
    baseEnergyCostMwh: 40,
    baseGridChargeKwMonth: 5,
    baseSiteCapexMwYear: 50000,
    scarcityMaxAdder: 60,
    initialCapacityMw: 5000,
    baseBuildRateMwYear: 1500,
    maxBuildRateMwYear: 4000,
    waterConstraintFactor: 0.0,
    latencyPenalty: 0.3,
  },
  {
    id: 'nordics',
    name: 'Nordics (Sweden/Norway/Finland)',
    baseEnergyCostMwh: 45,
    baseGridChargeKwMonth: 6,
    baseSiteCapexMwYear: 60000,
    scarcityMaxAdder: 70,
    initialCapacityMw: 3000,
    baseBuildRateMwYear: 1000,
    maxBuildRateMwYear: 3000,
    waterConstraintFactor: 0.0,
    latencyPenalty: 0.5,
  },
  {
    id: 'ercot',
    name: 'ERCOT (Texas)',
    baseEnergyCostMwh: 55,
    baseGridChargeKwMonth: 8,
    baseSiteCapexMwYear: 80000,
    scarcityMaxAdder: 150,
    initialCapacityMw: 8000,
    baseBuildRateMwYear: 2500,
    maxBuildRateMwYear: 6000,
    waterConstraintFactor: 0.4,
    latencyPenalty: 0.1,
  },
  {
    id: 'pjm',
    name: 'PJM (Virginia/Mid-Atlantic)',
    baseEnergyCostMwh: 70,
    baseGridChargeKwMonth: 12,
    baseSiteCapexMwYear: 100000,
    scarcityMaxAdder: 200,
    initialCapacityMw: 12000,
    baseBuildRateMwYear: 2000,
    maxBuildRateMwYear: 5000,
    waterConstraintFactor: 0.3,
    latencyPenalty: 0.05,
  },
  {
    id: 'miso',
    name: 'MISO (Midwest)',
    baseEnergyCostMwh: 60,
    baseGridChargeKwMonth: 7,
    baseSiteCapexMwYear: 70000,
    scarcityMaxAdder: 120,
    initialCapacityMw: 6000,
    baseBuildRateMwYear: 1800,
    maxBuildRateMwYear: 4500,
    waterConstraintFactor: 0.2,
    latencyPenalty: 0.15,
  },
  {
    id: 'caiso',
    name: 'CAISO (California)',
    baseEnergyCostMwh: 90,
    baseGridChargeKwMonth: 15,
    baseSiteCapexMwYear: 150000,
    scarcityMaxAdder: 250,
    initialCapacityMw: 4000,
    baseBuildRateMwYear: 800,
    maxBuildRateMwYear: 2000,
    waterConstraintFactor: 0.7,
    latencyPenalty: 0.1,
  },
  {
    id: 'gulf',
    name: 'Gulf States (UAE/Saudi)',
    baseEnergyCostMwh: 35,
    baseGridChargeKwMonth: 4,
    baseSiteCapexMwYear: 90000,
    scarcityMaxAdder: 80,
    initialCapacityMw: 2000,
    baseBuildRateMwYear: 2000,
    maxBuildRateMwYear: 8000,
    waterConstraintFactor: 0.9,
    latencyPenalty: 0.6,
  },
  {
    id: 'asia_pacific',
    name: 'Asia-Pacific (Singapore/Japan/Australia)',
    baseEnergyCostMwh: 80,
    baseGridChargeKwMonth: 10,
    baseSiteCapexMwYear: 120000,
    scarcityMaxAdder: 180,
    initialCapacityMw: 8000,
    baseBuildRateMwYear: 2500,
    maxBuildRateMwYear: 7000,
    waterConstraintFactor: 0.3,
    latencyPenalty: 0.4,
  },
  {
    id: 'latam',
    name: 'Latin America (Chile/Brazil)',
    baseEnergyCostMwh: 50,
    baseGridChargeKwMonth: 6,
    baseSiteCapexMwYear: 65000,
    scarcityMaxAdder: 100,
    initialCapacityMw: 1500,
    baseBuildRateMwYear: 800,
    maxBuildRateMwYear: 3000,
    waterConstraintFactor: 0.2,
    latencyPenalty: 0.5,
  },
];

