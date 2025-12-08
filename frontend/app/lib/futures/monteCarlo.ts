/**
 * Monte Carlo Futures Engine
 * Runs stochastic economic simulations to generate forecast cones
 */

import {
  WorldState,
  WorldParams,
  StrategyConfig,
  DeploymentAction,
  ForecastResult,
  ForecastPoint,
  SentimentSnapshot,
} from "./types";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function cloneState(s: WorldState): WorldState {
  return { ...s };
}

// Simple latency proxy: lower for orbit once established
function estimateLatencyMs(state: WorldState, strategy: StrategyConfig): { orbit: number; ground: number } {
  const baseGround = 120; // ms
  const baseOrbit = 40;   // ms
  const orbitShare = state.orbitCapacity / Math.max(1, state.orbitCapacity + state.groundCapacity);
  // more orbit capacity -> more low-latency availability
  const effectiveOrbit = baseOrbit / (0.5 + orbitShare);
  const effectiveGround = baseGround / (1 + 0.2 * orbitShare);
  return { orbit: effectiveOrbit, ground: effectiveGround };
}

// Emissions proxy (tCO2 / unit)
function estimateCarbon(state: WorldState): { orbit: number; ground: number } {
  const groundBase = 1.0;
  const orbitBase = 0.2; // assume mostly solar
  // ground decarbonizes slowly
  const yearsFromStart = state.year - 2025;
  const groundDecarb = Math.exp(-0.02 * yearsFromStart);
  const orbitDecarb = Math.exp(-0.03 * yearsFromStart);
  return {
    ground: groundBase * groundDecarb,
    orbit: orbitBase * orbitDecarb,
  };
}

// One-step world dynamics with shocks
function stepWorld(
  s: WorldState,
  params: WorldParams,
  action: DeploymentAction,
  rng: () => number
): WorldState {
  const ns = cloneState(s);

  // apply deployments
  ns.orbitCapacity += action.orbitBuild;
  ns.groundCapacity += action.groundBuild;

  // random shocks ~ N(0,1) via Box-Muller
  const u1 = clamp01(rng() || Math.random());
  const u2 = clamp01(rng() || Math.random());
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-6)) * Math.cos(2 * Math.PI * u2);

  // learning on costs with noise
  const orbitLearning = params.baseOrbitLearningRate * (1 + params.shockVolatility * 0.5 * z);
  const groundLearning = params.baseGroundLearningRate * (1 + params.shockVolatility * 0.5 * (-z));

  ns.orbitCost *= 1 - orbitLearning;
  ns.groundCost *= 1 - groundLearning * 0.5; // ground improves slower

  // launch and energy costs drift
  ns.launchCost *= 1 - 0.05 * (1 + params.shockVolatility * 0.5 * z);
  ns.energyCostGround *= 1 + 0.01 * (params.shockVolatility * z);

  // carbon price gradually up
  ns.carbonPrice *= 1.03;

  ns.year += 1;
  return ns;
}

interface PolicyFn {
  (state: WorldState, strategy: StrategyConfig): DeploymentAction;
}

function defaultPolicy(state: WorldState, strategy: StrategyConfig): DeploymentAction {
  // crude: use weights to bias orbit vs ground
  const { wCost, wLatency, wCarbon } = strategy;
  const totalBuild = 1.0; // normalized units/year

  const { orbit: latO, ground: latG } = estimateLatencyMs(state, strategy);
  const { orbit: carbO, ground: carbG } = estimateCarbon(state);

  const scoreOrbit =
    -wCost * state.orbitCost - wLatency * latO - wCarbon * carbO;
  const scoreGround =
    -wCost * state.groundCost - wLatency * latG - wCarbon * carbG;

  const expO = Math.exp(scoreOrbit);
  const expG = Math.exp(scoreGround);
  const pOrbit = expO / (expO + expG);
  const pGround = 1 - pOrbit;

  return {
    orbitBuild: totalBuild * pOrbit,
    groundBuild: totalBuild * pGround,
  };
}

// Run many stochastic rollouts to build cone
export function runFuturesMonteCarlo(
  initial: WorldState,
  params: WorldParams,
  strategy: StrategyConfig,
  nSims: number,
  policy: PolicyFn = defaultPolicy
): { forecast: ForecastResult; sentiment: SentimentSnapshot } {
  const horizon = params.horizonYears;
  const years: number[] = [];
  for (let i = 0; i <= horizon; i++) years.push(initial.year + i);

  const orbitSamples: number[][] = years.map(() => []);
  const groundSamples: number[][] = years.map(() => []);

  let orbitCheaperCount = 0;

  const rng = () => Math.random();

  for (let sIdx = 0; sIdx < nSims; sIdx++) {
    let state = cloneState(initial);
    orbitSamples[0].push(state.orbitCost);
    groundSamples[0].push(state.groundCost);

    for (let t = 1; t <= horizon; t++) {
      const action = policy(state, strategy);
      state = stepWorld(state, params, action, rng);
      orbitSamples[t].push(state.orbitCost);
      groundSamples[t].push(state.groundCost);
    }

    const last = state;
    if (last.orbitCost < last.groundCost) orbitCheaperCount++;
  }

  const points: ForecastPoint[] = years.map((year, i) => {
    const oArr = orbitSamples[i].sort((a, b) => a - b);
    const gArr = groundSamples[i].sort((a, b) => a - b);

    const q = (arr: number[], p: number) => {
      const idx = Math.floor((arr.length - 1) * p);
      return arr[idx];
    };

    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    const meanO = mean(oArr);
    const meanG = mean(gArr);

    const p16O = q(oArr, 0.16);
    const p84O = q(oArr, 0.84);
    const p2_5O = q(oArr, 0.025);
    const p97_5O = q(oArr, 0.975);

    const p16G = q(gArr, 0.16);
    const p84G = q(gArr, 0.84);
    const p2_5G = q(gArr, 0.025);
    const p97_5G = q(gArr, 0.975);

    const volO = clamp01((p84O - p16O) / Math.max(1, meanO));
    const volG = clamp01((p84G - p16G) / Math.max(1, meanG));

    return {
      year,
      meanOrbitCost: meanO,
      meanGroundCost: meanG,
      p16Orbit: p16O,
      p84Orbit: p84O,
      p2_5Orbit: p2_5O,
      p97_5Orbit: p97_5O,
      p16Ground: p16G,
      p84Ground: p84G,
      p2_5Ground: p2_5G,
      p97_5Ground: p97_5G,
      volatilityOrbit: volO,
      volatilityGround: volG,
    };
  });

  const probOrbitCheaperByHorizon = orbitCheaperCount / nSims;

  // Sentiment rule: probability-based only, never from slope
  // if (P > 0.6) bullish
  // if (P < 0.4) bearish
  // else neutral
  let sentimentLabel: 'bullish' | 'bearish' | 'neutral';
  if (probOrbitCheaperByHorizon > 0.6) {
    sentimentLabel = 'bullish';
  } else if (probOrbitCheaperByHorizon < 0.4) {
    sentimentLabel = 'bearish';
  } else {
    sentimentLabel = 'neutral';
  }

  // sentimentScore = (pOrbitCheaper - 0.5) * 2, which maps [0, 1] to [-1, 1]
  const orbitSentiment = (probOrbitCheaperByHorizon - 0.5) * 2;
  
  // Also calculate volatility
  const avgVol =
    points.reduce((acc, p) => acc + p.volatilityOrbit + p.volatilityGround, 0) /
    (2 * points.length);

  const sentiment: SentimentSnapshot = {
    orbitSentiment, // Derived from probability, not slope
    volatilityLevel: clamp01(avgVol),
    sentimentLabel, // Probability-based label
  };

  return {
    forecast: { points, probOrbitCheaperByHorizon },
    sentiment,
  };
}

