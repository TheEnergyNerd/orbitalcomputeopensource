/**
 * Strategy detection - identify player's build archetype
 */

export interface StrategyConfig {
  podGen: number; // 1, 2, or 3
  orbitalShare: number; // 0-1
  launchCapacity: number; // launches per month
  groundEnergyPrice: number; // $/MWh
}

export interface DetectedStrategy {
  name: string;
  description: string;
  tags: string[];
}

export function detectStrategy(config: StrategyConfig): DetectedStrategy {
  const { podGen, orbitalShare, launchCapacity, groundEnergyPrice } = config;
  
  // High-Tech: Gen 3 pods, moderate share (30-60%), high efficiency
  if (podGen >= 3 && orbitalShare >= 0.3 && orbitalShare <= 0.6 && launchCapacity >= 10) {
    return {
      name: 'High-Tech Orbit',
      description: 'Gen3 pods, moderate share, high launch efficiency',
      tags: ['Gen3', 'Moderate Share', 'High Efficiency'],
    };
  }
  
  // Brute-Force: Gen 1, massive share (>70%), high launch capacity
  if (podGen === 1 && orbitalShare >= 0.7 && launchCapacity >= 15) {
    return {
      name: 'Launch Cannon',
      description: 'Gen1 pods, massive share, high launch volume',
      tags: ['Gen1', 'High Share', 'High Volume'],
    };
  }
  
  // Green Orbit: High share (>50%), focus on carbon reduction
  if (orbitalShare >= 0.5 && groundEnergyPrice >= 60) {
    return {
      name: 'Green Orbit',
      description: 'High share, carbon-focused, expensive ground energy',
      tags: ['High Share', 'Carbon Focus', 'Green'],
    };
  }
  
  // Latency Runner: Moderate share (20-50%), focus on low latency
  if (orbitalShare >= 0.2 && orbitalShare <= 0.5 && podGen >= 2) {
    return {
      name: 'Latency Runner',
      description: 'Moderate share, low-latency focused, Gen2+ pods',
      tags: ['Moderate Share', 'Low Latency', 'Gen2+'],
    };
  }
  
  // Balanced: Default case
  return {
    name: 'Balanced Orbit',
    description: 'Moderate configuration across all parameters',
    tags: ['Balanced'],
  };
}

