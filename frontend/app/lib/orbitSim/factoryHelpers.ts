/**
 * Factory Helper Functions
 * Derive factory parameters and orbital unit profiles from config
 */

import type { SimulationConfig } from './simulationConfig';
import type { StageId, PodType, RocketType, StageThroughput } from './factoryTypes';
import {
  BASE_THROUGHPUT_PER_DEPLOY,
  maxThroughputFromCapacity,
  deriveReliability,
  POD_TYPE_PROFILES,
  ROCKET_TYPE_PROFILES,
} from './factoryTypes';

/**
 * Derive factory parameters from tuning
 */
export function deriveFactoryParameters(config: SimulationConfig) {
  const { factoryTuning } = config;

  // Max throughput per stage from capacity levels
  const stageMax: Record<StageId, number> = {
    silicon: maxThroughputFromCapacity("silicon", factoryTuning.silicon.capacityLevel),
    chips: maxThroughputFromCapacity("chips", factoryTuning.chips.capacityLevel),
    racks: maxThroughputFromCapacity("racks", factoryTuning.racks.capacityLevel),
    pods: maxThroughputFromCapacity("pods", factoryTuning.pods.capacityLevel),
    launch: maxThroughputFromCapacity("launch", factoryTuning.launch.capacityLevel),
  };

  // Run a simple flow to compute effective throughput and bottleneck
  const stageOrder: StageId[] = ["silicon", "chips", "racks", "pods", "launch"];
  let flow = Infinity;
  const stageThroughputs: StageThroughput[] = [];

  for (const id of stageOrder) {
    const maxT = stageMax[id];
    flow = Math.min(flow, maxT);
    stageThroughputs.push({
      stageId: id,
      maxThroughputPerDeploy: maxT,
      effectiveThroughputPerDeploy: flow,
    });
  }

  // Map pipeline to pods/racks/chips
  const launchStage = stageThroughputs.find(s => s.stageId === "launch")!;
  const podsStage = stageThroughputs.find(s => s.stageId === "pods")!;
  const racksStage = stageThroughputs.find(s => s.stageId === "racks")!;
  const chipsStage = stageThroughputs.find(s => s.stageId === "chips")!;

  // Scale up pods per deployment to ensure orbital capacity is meaningful
  const podsPerDeploymentBase = launchStage.effectiveThroughputPerDeploy * 5;
  const racksPerPodBase = racksStage.effectiveThroughputPerDeploy / Math.max(podsStage.effectiveThroughputPerDeploy, 1e-6);
  const chipsPerRackBase = chipsStage.effectiveThroughputPerDeploy / Math.max(racksStage.effectiveThroughputPerDeploy, 1e-6);

  // Factory reliability from automation
  const reliabilities = (["silicon", "chips", "racks", "pods", "launch"] as StageId[]).map(
    id => deriveReliability(factoryTuning[id].automationLevel)
  );
  const factoryReliabilityFactor =
    reliabilities.reduce((a, b) => a + b, 0) / reliabilities.length;

  return {
    stageThroughputs,
    podsPerDeploymentBase,
    racksPerPodBase,
    chipsPerRackBase,
    factoryReliabilityFactor,
  };
}

/**
 * Get orbital unit profile from pod/rocket types
 */
export function getOrbitalUnitProfile(config: SimulationConfig & { podsPerDeploymentBase: number }) {
  const pod = POD_TYPE_PROFILES[config.podType];
  const rocket = ROCKET_TYPE_PROFILES[config.rocketType];

  const orbitalCostPerTwh =
    config.baseOrbitalCostPerTwh * pod.costMultiplier * rocket.launchCostMultiplier;

  const orbitalLatencyMs =
    config.baseOrbitalLatencyMs * pod.latencyMultiplier;

  const orbitalCarbonPerTwh =
    config.baseOrbitalCarbonPerTwh * pod.carbonMultiplier * rocket.carbonMultiplier;

  const orbitalOpexPerTwh =
    config.baseOrbitalOpexPerTwh * pod.costMultiplier;

  const podsPerDeployment =
    config.podsPerDeploymentBase * rocket.podsPerDeploymentMultiplier;

  return {
    orbitalCostPerTwh,
    orbitalLatencyMs,
    orbitalCarbonPerTwh,
    orbitalOpexPerTwh,
    podsPerDeployment,
  };
}

