import { describe, test, expect } from '@jest/globals';
import { computeTrajectory } from '../trajectory';
import { getMcCalipStaticParams } from '../modes/mccalipStatic';

describe('Publication Ready Tests', () => {
  
  test('McCalip static mode is year-invariant', () => {
    const trajectory = computeTrajectory({ 
      mode: 'MCCALIP_STATIC',
      paramsByYear: (y) => getMcCalipStaticParams(y) 
    });
    
    const baseline = trajectory[0];
    
    for (const data of trajectory) {
      expect(Math.abs(data.ground.totalCostPerPflopYear - baseline.ground.totalCostPerPflopYear)).toBeLessThan(0.01);
      expect(Math.abs(data.orbit.totalCostPerPflopYear - baseline.orbit.totalCostPerPflopYear)).toBeLessThan(0.01);
    }
  });
  
  test('Waterfall reconciles exactly', () => {
    const trajectory = computeTrajectory({
      mode: 'DYNAMIC',
      paramsByYear: (year) => ({
        ...getMcCalipStaticParams(year),
        year,
        isMcCalipMode: false,
        spaceTrafficEnabled: true,
        workloadType: 'inference'
      })
    });
    
    for (const data of trajectory) {
      const hb = data.orbit.hybridBreakdown;
      if (hb) {
        const sum = hb.power + hb.compute + hb.thermal + hb.radiation + hb.bus + hb.ops + hb.congestion + hb.networking + hb.interconnect;
        expect(Math.abs(sum - data.orbit.totalCostPerPflopYear)).toBeLessThan(1.0);
      }
    }
  });
});
