/**
 * Mission definitions - 5 missions with clear goals
 */

export type MissionId = 'cheap' | 'green' | 'edge' | 'resilient' | 'balanced';

export interface Metrics {
  costPerComputeGround: number;
  costPerComputeMix: number;
  opexGround: number;
  opexMix: number;
  latencyGround: number;
  latencyMix: number;
  carbonGround: number;
  carbonMix: number;
  resilienceGround: number;
  resilienceMix: number;
  energyCostGround: number;
  energyCostMix: number;
}

export interface Mission {
  id: MissionId;
  name: string;
  descriptionLines: string[];
  check: (metrics: Metrics) => { complete: boolean; progress: string[] };
}

export const missions: Mission[] = [
  {
    id: 'cheap',
    name: 'Cheap Orbit',
    descriptionLines: [
      'Reduce Annual OPEX by ≥15% vs ground-only.',
      'Keep Latency increase < 2 ms.',
    ],
    check: (m) => {
      const opexDeltaPct = m.opexGround > 0 ? ((m.opexMix - m.opexGround) / m.opexGround) * 100 : 0;
      const latencyDelta = m.latencyMix - m.latencyGround;
      // Require actual orbital deployment (mix must differ from ground by significant amount)
      // Also require that OPEX actually improved (not just equal)
      // Must have actual orbital share > 0 (check via latency or carbon difference)
      // Also check that we're not at baseline (all values equal means no deployment)
      const hasOrbitalDeployment = Math.abs(m.opexMix - m.opexGround) > m.opexGround * 0.01 && 
                                    (Math.abs(m.latencyMix - m.latencyGround) > 0.1 || Math.abs(m.carbonMix - m.carbonGround) > m.carbonGround * 0.01) &&
                                    m.opexMix !== m.opexGround; // Must actually differ
      const opexImproved = opexDeltaPct < -15; // Must be better than -15% (strict inequality)
      const latencyOk = latencyDelta <= 2;
      const complete = hasOrbitalDeployment && opexImproved && latencyOk;
      const progress = [
        `OPEX: ${opexDeltaPct.toFixed(1)}% (goal ≤ -15%)`,
        `Latency: ${latencyDelta >= 0 ? '+' : ''}${latencyDelta.toFixed(2)} ms (goal ≤ +2 ms)`,
      ];
      return { complete, progress };
    },
  },
  {
    id: 'green',
    name: 'Green Orbit',
    descriptionLines: [
      'Reduce Carbon by ≥40%.',
      'Keep OPEX increase < 5%.',
    ],
    check: (m) => {
      const carbonDeltaPct = m.carbonGround > 0 ? ((m.carbonMix - m.carbonGround) / m.carbonGround) * 100 : 0;
      const opexDeltaPct = m.opexGround > 0 ? ((m.opexMix - m.opexGround) / m.opexGround) * 100 : 0;
      const hasOrbitalDeployment = Math.abs(m.carbonMix - m.carbonGround) > m.carbonGround * 0.01;
      const carbonImproved = carbonDeltaPct < -40; // Must be better than -40%
      const opexOk = opexDeltaPct <= 5;
      const complete = hasOrbitalDeployment && carbonImproved && opexOk;
      const progress = [
        `Carbon: ${carbonDeltaPct.toFixed(1)}% (goal ≤ -40%)`,
        `OPEX: ${opexDeltaPct >= 0 ? '+' : ''}${opexDeltaPct.toFixed(1)}% (goal ≤ +5%)`,
      ];
      return { complete, progress };
    },
  },
  {
    id: 'edge',
    name: 'Edge Orbit',
    descriptionLines: [
      'Improve latency by ≥5 ms.',
      'Keep Energy cost increase < 15%.',
    ],
    check: (m) => {
      const latencyDelta = m.latencyMix - m.latencyGround;
      const energyDeltaPct = m.energyCostGround > 0 ? ((m.energyCostMix - m.energyCostGround) / m.energyCostGround) * 100 : 0;
      const hasOrbitalDeployment = Math.abs(m.latencyMix - m.latencyGround) > 0.1; // At least 0.1ms difference
      const latencyImproved = latencyDelta < -5; // Must be better than -5ms
      const energyOk = energyDeltaPct <= 15;
      const complete = hasOrbitalDeployment && latencyImproved && energyOk;
      const progress = [
        `Latency: ${latencyDelta.toFixed(2)} ms (goal ≤ -5 ms)`,
        `Energy Cost: ${energyDeltaPct >= 0 ? '+' : ''}${energyDeltaPct.toFixed(1)}% (goal ≤ +15%)`,
      ];
      return { complete, progress };
    },
  },
  {
    id: 'resilient',
    name: 'Resilient Orbit',
    descriptionLines: [
      'Improve resilience by ≥10%.',
      'Keep OPEX increase < 10%.',
    ],
    check: (m) => {
      const resilienceDeltaPct = m.resilienceGround > 0 ? ((m.resilienceMix - m.resilienceGround) / m.resilienceGround) * 100 : 0;
      const opexDeltaPct = m.opexGround > 0 ? ((m.opexMix - m.opexGround) / m.opexGround) * 100 : 0;
      const hasOrbitalDeployment = Math.abs(m.resilienceMix - m.resilienceGround) > 0.1; // At least 0.1% difference
      const resilienceImproved = resilienceDeltaPct > 10; // Must be better than +10%
      const opexOk = opexDeltaPct <= 10;
      const complete = hasOrbitalDeployment && resilienceImproved && opexOk;
      const progress = [
        `Resilience: ${resilienceDeltaPct >= 0 ? '+' : ''}${resilienceDeltaPct.toFixed(1)}% (goal ≥ +10%)`,
        `OPEX: ${opexDeltaPct >= 0 ? '+' : ''}${opexDeltaPct.toFixed(1)}% (goal ≤ +10%)`,
      ];
      return { complete, progress };
    },
  },
  {
    id: 'balanced',
    name: 'Optimal Balance',
    descriptionLines: [
      'OPEX ≤ 0%',
      'Latency ≤ 0 ms',
      'Reduce Carbon by ≥20%',
      'Improve Resilience by ≥5%',
    ],
    check: (m) => {
      const opexDeltaPct = m.opexGround > 0 ? ((m.opexMix - m.opexGround) / m.opexGround) * 100 : 0;
      const latencyDelta = m.latencyMix - m.latencyGround;
      const carbonDeltaPct = m.carbonGround > 0 ? ((m.carbonMix - m.carbonGround) / m.carbonGround) * 100 : 0;
      const resilienceDeltaPct = m.resilienceGround > 0 ? ((m.resilienceMix - m.resilienceGround) / m.resilienceGround) * 100 : 0;
      // Require significant orbital deployment across multiple metrics
      const hasOrbitalDeployment = 
        Math.abs(m.opexMix - m.opexGround) > m.opexGround * 0.01 ||
        Math.abs(m.latencyMix - m.latencyGround) > 0.1 ||
        Math.abs(m.carbonMix - m.carbonGround) > m.carbonGround * 0.01 ||
        Math.abs(m.resilienceMix - m.resilienceGround) > 0.1;
      // All conditions must be met and actually improved (not just equal)
      const opexOk = opexDeltaPct < 0; // Must be negative (better)
      const latencyOk = latencyDelta < 0; // Must be negative (better)
      const carbonImproved = carbonDeltaPct < -20; // Must be better than -20%
      const resilienceImproved = resilienceDeltaPct > 5; // Must be better than +5%
      const complete = hasOrbitalDeployment && opexOk && latencyOk && carbonImproved && resilienceImproved;
      const progress = [
        `OPEX: ${opexDeltaPct >= 0 ? '+' : ''}${opexDeltaPct.toFixed(1)}% (goal ≤ 0%)`,
        `Latency: ${latencyDelta >= 0 ? '+' : ''}${latencyDelta.toFixed(2)} ms (goal ≤ 0 ms)`,
        `Carbon: ${carbonDeltaPct.toFixed(1)}% (goal ≤ -20%)`,
        `Resilience: ${resilienceDeltaPct >= 0 ? '+' : ''}${resilienceDeltaPct.toFixed(1)}% (goal ≥ +5%)`,
      ];
      return { complete, progress };
    },
  },
];

