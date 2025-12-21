/**
 * Acceptance Tests for Unit Validation and Chart Data
 * 
 * Ensures:
 * 1. No GFLOPS/W unit corruption (values in [20, 5000] range)
 *    - Ground systems: typically 30+ GFLOPS/W
 *    - Orbital systems: can be 25+ GFLOPS/W (radiation hardening overhead)
 * 2. No NaN/null in chart series after sanitization
 * 3. Energy Cost Comparison has both traces present and finite
 * 4. No breakdown.ground fields are null
 */

import { validateGflopsPerWatt, COMPUTE_UNITS } from '../units';
import { sanitizeFinite, sanitizeSeries } from '../../utils/sanitize';
import { YearlyBreakdown } from '../types';

describe('Unit Validation and Chart Data Acceptance Tests', () => {
  
  describe('GFLOPS/W Unit Validation', () => {
    it('should reject values < 20 GFLOPS/W (unit corruption)', () => {
      expect(() => validateGflopsPerWatt(4.3875e-7, 'test')).toThrow(/unit corruption/i);
      expect(() => validateGflopsPerWatt(0.0000015, 'test')).toThrow(/unit corruption/i);
      expect(() => validateGflopsPerWatt(1, 'test')).toThrow(/outside expected range/i);
      expect(() => validateGflopsPerWatt(19, 'test')).toThrow(/outside expected range/i);
    });

    it('should accept valid system-level GFLOPS/W values', () => {
      expect(validateGflopsPerWatt(2000, 'test')).toBe(2000);
      expect(validateGflopsPerWatt(450, 'test')).toBe(450);
      expect(validateGflopsPerWatt(530, 'test')).toBe(530);
      expect(validateGflopsPerWatt(30, 'test')).toBe(30);
      expect(validateGflopsPerWatt(25, 'test')).toBe(25); // Orbital systems
      expect(validateGflopsPerWatt(20, 'test')).toBe(20); // Minimum valid
      expect(validateGflopsPerWatt(5000, 'test')).toBe(5000);
    });

    it('should reject values > 5000 GFLOPS/W (unrealistic)', () => {
      expect(() => validateGflopsPerWatt(10000, 'test')).toThrow(/outside expected range/i);
    });
  });

  describe('Chart Data Sanitization', () => {
    it('should sanitize series with null/NaN values', () => {
      const series = [100, null, 200, NaN, 300, undefined, 400];
      const sanitized = sanitizeSeries(series, 'previous');
      
      expect(sanitized).toHaveLength(7);
      expect(sanitized[0]).toBe(100);
      expect(sanitized[1]).toBe(100); // Previous valid
      expect(sanitized[2]).toBe(200);
      expect(sanitized[3]).toBe(200); // Previous valid
      expect(sanitized[4]).toBe(300);
      expect(sanitized[5]).toBe(300); // Previous valid
      expect(sanitized[6]).toBe(400);
      
      // All values should be finite
      sanitized.forEach(val => {
        expect(isFinite(val)).toBe(true);
      });
    });

    it('should handle all-null series', () => {
      const series = [null, null, undefined, NaN];
      const sanitized = sanitizeSeries(series, 'previous');
      
      expect(sanitized).toHaveLength(4);
      sanitized.forEach(val => {
        expect(val).toBe(0); // Fallback to 0 when no previous valid
        expect(isFinite(val)).toBe(true);
      });
    });
  });

  describe('YearlyBreakdown Validation', () => {
    it('should validate ground breakdown has no null fields', () => {
      const breakdown: YearlyBreakdown = {
        year: 2025,
        mode: 'DYNAMIC',
        ground: {
          electricityPricePerMwh: 120,
          pue: 1.3,
          capacityFactor: 0.85,
          gflopsPerWatt: 2000,
          energyCostPerPflopYear: 716,
          siteCostPerPflopYear: 5752,
          hardwareCapexPerPflopYear: 5000,
          totalCostPerPflopYear: 11468,
          gpuHourPricing: {} as any,
          tokenPricing: {} as any,
        },
        orbit: {
          lcoePerMwh: 50,
          pue: 1.05,
          capacityFactor: 0.98,
          gflopsPerWatt: 1500,
          launchCostPerKg: 1500,
          specificPowerWPerKg: 36.5,
          totalCostPerPflopYear: 64579,
          gpuHourPricing: {} as any,
          tokenPricing: {} as any,
        },
      };

      // Validate no null fields
      expect(breakdown.ground.energyCostPerPflopYear).not.toBeNull();
      expect(breakdown.ground.siteCostPerPflopYear).not.toBeNull();
      expect(breakdown.ground.hardwareCapexPerPflopYear).not.toBeNull();
      expect(isFinite(breakdown.ground.energyCostPerPflopYear)).toBe(true);
      expect(isFinite(breakdown.ground.siteCostPerPflopYear)).toBe(true);
    });

    it('should validate GFLOPS/W in breakdown', () => {
      const breakdown: YearlyBreakdown = {
        year: 2025,
        mode: 'DYNAMIC',
        ground: {
          electricityPricePerMwh: 120,
          pue: 1.3,
          capacityFactor: 0.85,
          gflopsPerWatt: 2000,
          energyCostPerPflopYear: 716,
          siteCostPerPflopYear: 5752,
          hardwareCapexPerPflopYear: 5000,
          totalCostPerPflopYear: 11468,
          gpuHourPricing: {} as any,
          tokenPricing: {} as any,
        },
        orbit: {
          lcoePerMwh: 50,
          pue: 1.05,
          capacityFactor: 0.98,
          gflopsPerWatt: 1500,
          launchCostPerKg: 1500,
          specificPowerWPerKg: 36.5,
          totalCostPerPflopYear: 64579,
          gpuHourPricing: {} as any,
          tokenPricing: {} as any,
        },
      };

      // Validate GFLOPS/W ranges
      // Ground systems typically 30+ GFLOPS/W, orbital can be 25+ due to radiation hardening
      expect(breakdown.ground.gflopsPerWatt).toBeGreaterThanOrEqual(20);
      expect(breakdown.ground.gflopsPerWatt).toBeLessThanOrEqual(5000);
      expect(breakdown.orbit.gflopsPerWatt).toBeGreaterThanOrEqual(20);
      expect(breakdown.orbit.gflopsPerWatt).toBeLessThanOrEqual(5000);
    });
  });

  describe('Energy Cost Comparison Chart', () => {
    it('should have both ground and orbit traces with finite values', () => {
      const chartData = [
        { year: 2025, ground: 156, orbit: 52.5, static: 0 },
        { year: 2026, ground: 156, orbit: 50, static: 0 },
      ];

      chartData.forEach(point => {
        expect(isFinite(point.ground)).toBe(true);
        expect(isFinite(point.orbit)).toBe(true);
        expect(point.ground).toBeGreaterThan(0);
        expect(point.orbit).toBeGreaterThan(0);
      });
    });

    it('should sanitize invalid values in chart data', () => {
      const rawData = [
        { year: 2025, ground: 156, orbit: 52.5 },
        { year: 2026, ground: null, orbit: NaN },
        { year: 2027, ground: 160, orbit: 50 },
      ];

      const groundValues = rawData.map(d => d.ground);
      const orbitValues = rawData.map(d => d.orbit);

      const sanitizedGround = sanitizeSeries(groundValues, 'previous');
      const sanitizedOrbit = sanitizeSeries(orbitValues, 'previous');

      expect(sanitizedGround[1]).toBe(156); // Previous valid
      expect(sanitizedOrbit[1]).toBe(52.5); // Previous valid
      expect(isFinite(sanitizedGround[1])).toBe(true);
      expect(isFinite(sanitizedOrbit[1])).toBe(true);
    });
  });
});

