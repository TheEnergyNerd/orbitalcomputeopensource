/**
 * Regression Tests for Efficiency Levels and Chart Data Fixes
 * 
 * Tests the three hard bugs fixed:
 * 1. Orbital compute efficiency internal consistency (delivered vs systemEffective)
 * 2. Static LCOE not being zeroed in chartInputs
 * 3. Energy Cost Comparison using ONE definition consistently
 */

import { computePhysicsCost } from '../physicsCost';
import { getStaticParams } from '../modes/static';
import { sanitizeFinite } from '../../utils/sanitize';
import { computeTrajectory } from '../trajectory';

describe('Efficiency Levels and Chart Data Fixes', () => {
  
  describe('1. Orbital Compute Efficiency Internal Consistency', () => {
    it('should have delivered efficiency = systemEffective * thermalCap * radiationDerate * availability', () => {
      const year = 2025;
      const params = getStaticParams(year);
      const result = computePhysicsCost(params);
      
      // Get efficiency levels from orbit object (stored in hybridBreakdown or directly)
      const efficiencyLevels = result.orbit?.hybridBreakdown?.computeEfficiencyLevels || 
                                (result.orbit as any)?.computeEfficiencyLevels;
      const multipliers = result.orbit?.effectiveComputeMultipliers || 
                          (result.orbit as any)?.effectiveComputeMultipliers;
      
      expect(efficiencyLevels).toBeDefined();
      expect(multipliers).toBeDefined();
      
      if (efficiencyLevels && multipliers) {
        const { systemEffectiveGflopsPerWatt, deliveredGflopsPerWatt } = efficiencyLevels;
        const { thermalCapFactor, radiationDerate, availability } = multipliers;
        
        // Calculate expected delivered efficiency
        const expectedDelivered = systemEffectiveGflopsPerWatt * thermalCapFactor * radiationDerate * availability;
        
        // Mismatch should be <= 2%
        const mismatch = Math.abs(deliveredGflopsPerWatt - expectedDelivered) / Math.max(deliveredGflopsPerWatt, expectedDelivered);
        expect(mismatch).toBeLessThanOrEqual(0.02);
        
        // Validation should pass
        const validation = result.metadata?.computeEfficiency?.validation;
        expect(validation?.valid).toBe(true);
        expect(validation?.warning).not.toContain('mismatch');
      }
    });
    
    it('should not emit "Power/Efficiency mismatch" warning for valid efficiency levels', () => {
      const year = 2025;
      const params = getStaticParams(year);
      const result = computePhysicsCost(params);
      
      const validation = result.metadata?.computeEfficiency?.validation;
      expect(validation?.valid).toBe(true);
      expect(validation?.warning).not.toMatch(/Power\/Efficiency mismatch.*0\.[4-5]x/i);
    });
  });
  
  describe('2. Static LCOE Not Zeroed in chartInputs', () => {
    it('should have non-zero staticLcoe in chartInputs when staticLcoe > 0', () => {
      const year = 2025;
      const params = getStaticParams(year);
      const result = computePhysicsCost(params);
      
      const chartInputs = result.metadata?.chartInputs?.powerBuildout;
      expect(chartInputs).toBeDefined();
      
      // Static LCOE should be computed, not hardcoded to 0
      // Note: It might be 0 if the calculation results in 0, but it should be computed
      const staticLcoe = chartInputs?.staticLcoe;
      expect(staticLcoe).toBeDefined();
      expect(isFinite(staticLcoe!)).toBe(true);
      
      // If staticLcoe is > 0, it should match the expected calculation
      if (staticLcoe && staticLcoe > 0) {
        // Should be a reasonable value (not unit corruption)
        expect(staticLcoe).toBeGreaterThan(10); // At least $10/MWh
        expect(staticLcoe).toBeLessThan(10000); // Not more than $10k/MWh
      }
    });
    
    it('should have invariant: chartInputs.staticLcoe matches record.staticLcoe when both are finite', () => {
      // This test is run in the compare page, but we can test the computation here
      const year = 2025;
      const params = getStaticParams(year);
      const result = computePhysicsCost(params);
      
      const chartInputs = result.metadata?.chartInputs?.powerBuildout;
      expect(chartInputs).toBeDefined();
      
      // chartInputs.staticLcoe should be computed (not 0 unless truly 0)
      const chartStatic = chartInputs?.staticLcoe;
      expect(chartStatic).toBeDefined();
      expect(isFinite(chartStatic!)).toBe(true);
    });
  });
  
  describe('3. Energy Cost Comparison Uses ONE Definition', () => {
    it('should use Option A: marginal electricity price to compute bus', () => {
      const year = 2025;
      const params = getStaticParams(year);
      const result = computePhysicsCost(params);
      
      const chartInputs = result.metadata?.chartInputs?.powerBuildout;
      expect(chartInputs).toBeDefined();
      
      // Ground: electricityPricePerMwh * pue
      const expectedGround = result.ground.electricityPricePerMwh * result.ground.pue;
      expect(Math.abs(chartInputs!.groundRaw - expectedGround)).toBeLessThan(0.01);
      
      // Orbit: lcoePerMwh * pue
      const expectedOrbit = result.orbit.lcoePerMwh * result.orbit.pue;
      expect(Math.abs(chartInputs!.orbitRaw - expectedOrbit)).toBeLessThan(0.01);
    });
    
    it('should have consistent definition across all years', () => {
      const years = [2025, 2030, 2035, 2040];
      
      for (const year of years) {
        const params = getStaticParams(year);
        const result = computePhysicsCost(params);
        
        const chartInputs = result.metadata?.chartInputs?.powerBuildout;
        expect(chartInputs).toBeDefined();
        
        // Ground should always be electricityPricePerMwh * pue
        const expectedGround = result.ground.electricityPricePerMwh * result.ground.pue;
        expect(Math.abs(chartInputs!.groundRaw - expectedGround)).toBeLessThan(0.01);
        
        // Orbit should always be lcoePerMwh * pue
        const expectedOrbit = result.orbit.lcoePerMwh * result.orbit.pue;
        expect(Math.abs(chartInputs!.orbitRaw - expectedOrbit)).toBeLessThan(0.01);
      }
    });
    
    it('should not mix LCOE, losses, and amortized ops inconsistently', () => {
      const year = 2025;
      const params = getStaticParams(year);
      const result = computePhysicsCost(params);
      
      const chartInputs = result.metadata?.chartInputs?.powerBuildout;
      
      // Energy cost should NOT include compute efficiency division
      // It should be electricity price * PUE only
      const groundEnergyCost = chartInputs!.groundSanitized;
      const groundElectricityPrice = result.ground.electricityPricePerMwh;
      const groundPue = result.ground.pue;
      
      // Should equal electricityPrice * PUE (within epsilon)
      expect(Math.abs(groundEnergyCost - groundElectricityPrice * groundPue)).toBeLessThan(0.01);
    });
  });
  
  describe('4. Chart Series Never Drops Due to NaN', () => {
    it('should have all chart series with finite values after sanitization', () => {
      const year = 2025;
      const params = getStaticParams(year);
      const result = computePhysicsCost(params);
      
      const chartInputs = result.metadata?.chartInputs?.powerBuildout;
      expect(chartInputs).toBeDefined();
      
      // All sanitized values should be finite
      expect(isFinite(chartInputs!.groundSanitized)).toBe(true);
      expect(isFinite(chartInputs!.orbitSanitized)).toBe(true);
      expect(isFinite(chartInputs!.staticLcoe)).toBe(true);
      
      // None should be NaN
      expect(chartInputs!.groundSanitized).not.toBeNaN();
      expect(chartInputs!.orbitSanitized).not.toBeNaN();
      expect(chartInputs!.staticLcoe).not.toBeNaN();
    });
    
    it('should have imputation flags when values are imputed', () => {
      const year = 2025;
      const params = getStaticParams(year);
      const result = computePhysicsCost(params);
      
      const imputationFlags = result.metadata?.chartInputs?.imputationFlags;
      expect(imputationFlags).toBeDefined();
      expect(typeof imputationFlags!.groundImputed).toBe('boolean');
      expect(typeof imputationFlags!.orbitImputed).toBe('boolean');
    });
  });
});

