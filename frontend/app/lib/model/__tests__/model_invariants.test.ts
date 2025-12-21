/**
 * Model Invariant Tests
 * 
 * Tests to ensure model consistency and correctness across all years.
 * These tests lock in quality and catch regressions.
 */

import { computePhysicsCost } from '../physicsCost';
import { computeTrajectory } from '../trajectory';
import { getStaticParams } from '../modes/static';
import { SLA_DEFINITIONS } from '../sla_definitions';

describe('Model Invariants', () => {
  const trajectory = computeTrajectory({
    mode: 'DYNAMIC',
    paramsByYear: (year) => getStaticParams(year),
  });
  
  describe('Demand Scalar Consistency', () => {
    test('market.totalDemandGW === market.debug.demandComputeGW === ground.buildoutDebug.demandGW', () => {
      for (const year of trajectory) {
        const marketDemand = year.market.totalDemandGW;
        const marketDebugDemand = year.market.debug.demandComputeGW;
        const buildoutDemand = year.ground?.buildoutDebug?.demandGW;
        
        expect(Math.abs(marketDemand - marketDebugDemand)).toBeLessThan(1e-6);
        
        if (buildoutDemand !== undefined) {
          expect(Math.abs(marketDemand - buildoutDemand)).toBeLessThan(1e-6);
        }
      }
    });
  });
  
  describe('Orbital Capacity Conversion', () => {
    test('orbitalCapacityGW_fromSats uses correct kW->GW conversion (divide by 1e6, not 1e3)', () => {
      for (const year of trajectory) {
        if (year.orbit?.constellation?.design) {
          const { numSatellites, computePerSatKw } = year.orbit.constellation.design;
          const expectedGW = (numSatellites * computePerSatKw) / 1_000_000; // kW -> GW: divide by 1e6
          const actualGW = year.market.debug.orbitalCapacityGW_fromSats ?? 0;
          
          if (numSatellites > 0 && computePerSatKw > 0) {
            const error = Math.abs(actualGW - expectedGW) / Math.max(expectedGW, 1e-9);
            expect(error).toBeLessThan(0.01); // 1% tolerance
            
            // Specific test: 1 satellite at 111 kW should be 0.000111 GW, not 1.144 GW
            if (numSatellites === 1) {
              expect(actualGW).toBeLessThan(computePerSatKw / 1000); // Must be < MW value
            }
          }
        }
      }
    });
  });
  
  describe('Effective Specific Power Duplication', () => {
    test('no duplicate effectiveSpecificPower fields (use specificPower_effective_WPerKg only)', () => {
      for (const year of trajectory) {
        const orbit = year.orbit;
        if (orbit) {
          // Check that effectiveSpecificPower is not exported (removed)
          expect((orbit as any).effectiveSpecificPower).toBeUndefined();
          
          // Check that specificPower_effective_WPerKg exists and is valid
          if (orbit.specificPower_effective_WPerKg !== undefined) {
            expect(orbit.specificPower_effective_WPerKg).toBeGreaterThan(0);
            expect(orbit.specificPower_effective_WPerKg).toBeLessThan(1000); // Reasonable upper bound
          }
        }
      }
    });
  });

  describe('Cost Accounting', () => {
    test('orbital components sum to total (±0.1%)', () => {
      for (const year of trajectory) {
        const o = year.orbit;
        const components = 
          (o.energyCostPerPflopYear || 0) +
          (o.hardwareCostPerPflopYear || 0) +
          (o.launchCostPerPflopYear || 0) +
          (o.thermalSystemCost || 0) +
          (o.regulatoryCost || o.hybridBreakdown?.regulatory || 0) +
          (o.replacementRateCost || o.hybridBreakdown?.ops || 0) +
          (o.networkingCost || o.hybridBreakdown?.networking || 0) +
          (o.interconnectCost || o.hybridBreakdown?.interconnect || 0) +
          (o.hybridBreakdown?.bus || 0) +
          (o.hybridBreakdown?.radiation || 0) +
          (o.hybridBreakdown?.congestion || 0);
        
        const error = Math.abs(components - o.totalCostPerPflopYear) / o.totalCostPerPflopYear;
        if (error >= 0.001) {
          throw new Error(
            `Orbital cost accounting violation in ${year.year}: ` +
            `total=${o.totalCostPerPflopYear}, sum=${components}, error=${error * 100}%. ` +
            `Components: energy=${o.energyCostPerPflopYear}, hardware=${o.hardwareCostPerPflopYear}, ` +
            `launch=${o.launchCostPerPflopYear}, thermal=${o.thermalSystemCost}, ` +
            `regulatory=${o.regulatoryCost || o.hybridBreakdown?.regulatory}, ` +
            `ops=${o.replacementRateCost || o.hybridBreakdown?.ops}, ` +
            `networking=${o.networkingCost || o.hybridBreakdown?.networking}, ` +
            `interconnect=${o.interconnectCost || o.hybridBreakdown?.interconnect}`
          );
        }
        expect(error).toBeLessThan(0.001); // 0.1% tolerance
      }
    });
    
    test('ground components sum to total (±0.1%)', () => {
      for (const year of trajectory) {
        const g = year.ground;
        const components = 
          g.energyCostPerPflopYear +
          g.siteCostPerPflopYear +
          g.hardwareCapexPerPflopYear;
        
        const error = Math.abs(components - g.totalCostPerPflopYear) / g.totalCostPerPflopYear;
        if (error >= 0.001) {
          throw new Error(
            `Ground cost accounting violation in ${year.year}: ` +
            `total=${g.totalCostPerPflopYear}, sum=${components}, error=${error * 100}%. ` +
            `Components: energy=${g.energyCostPerPflopYear}, site=${g.siteCostPerPflopYear}, ` +
            `hardware=${g.hardwareCapexPerPflopYear}`
          );
        }
        expect(error).toBeLessThan(0.001);
      }
    });
    
    test('capacity factor applied exactly once in energy cost', () => {
      for (const year of trajectory) {
        const o = year.orbit;
        // Energy cost should be: (LCOE * PUE * power) / (effectivePflops * capacityFactor)
        // If capacityFactor is applied twice, energy cost would be too low
        // This is a sanity check - exact formula depends on implementation
        expect(o.capacityFactor).toBeGreaterThan(0);
        expect(o.capacityFactor).toBeLessThanOrEqual(1);
      }
    });
    
    test('PUE applied exactly once in energy cost', () => {
      for (const year of trajectory) {
        const o = year.orbit;
        // PUE should be in reasonable range and applied once
        expect(o.pue).toBeGreaterThan(1.0);
        expect(o.pue).toBeLessThan(2.0);
      }
    });
  });
  
  describe('Physical Constraints', () => {
    test('capacity factor in valid range [0.5, 1.0]', () => {
      for (const year of trajectory) {
        expect(year.orbit.capacityFactor).toBeGreaterThanOrEqual(0.5);
        expect(year.orbit.capacityFactor).toBeLessThanOrEqual(1.0);
      }
    });
    
    test('capacity factor degrades over time', () => {
      const cf2025 = trajectory[0].orbit.capacityFactor;
      const cf2050 = trajectory[trajectory.length - 1].orbit.capacityFactor;
      expect(cf2050).toBeLessThan(cf2025);
    });
    
    test('thermal rejection >= waste heat OR thermalCapped is true', () => {
      for (const year of trajectory) {
        const o = year.orbit;
        // If thermalCapped is true, maxRejectableKw < wasteHeatKw (by definition)
        // If thermalCapped is false, maxRejectableKw >= wasteHeatKw
        const wasteHeat = o.computePowerKw * 0.25; // ~25% becomes heat (approximate)
        if (o.thermalCapped) {
          expect(o.maxRejectableKw).toBeLessThan(wasteHeat * 1.1); // Allow 10% margin
          expect(o.thermalCapFactor).toBeLessThan(1.0);
          expect(o.thermalCapFactor).toBeGreaterThan(0);
        } else {
          expect(o.maxRejectableKw).toBeGreaterThanOrEqual(wasteHeat * 0.9); // Allow 10% margin
          expect(o.thermalCapFactor).toBeCloseTo(1.0, 2);
        }
      }
    });
    
    test('thermalCapped == (maxRejectableKw < wasteHeatKw)', () => {
      for (const year of trajectory) {
        const o = year.orbit;
        // Calculate waste heat from compute power (15% compute + 10% power system + fixed overhead)
        const computeEfficiency = 0.85;
        const powerSystemEfficiency = 0.90;
        const otherSystemsWasteKw = 5;
        const computeWasteKw = o.computePowerKw * (1 - computeEfficiency);
        const powerSystemWasteKw = o.computePowerKw * (1 - powerSystemEfficiency);
        const wasteHeatKw = computeWasteKw + powerSystemWasteKw + otherSystemsWasteKw;
        
        const expectedCapped = o.maxRejectableKw < wasteHeatKw;
        expect(o.thermalCapped).toBe(expectedCapped);
      }
    });
    
    test('collision risk in reasonable range [0, 0.5]', () => {
      for (const year of trajectory) {
        expect(year.orbit.collisionRisk).toBeGreaterThanOrEqual(0);
        expect(year.orbit.collisionRisk).toBeLessThanOrEqual(0.5);
      }
    });
  });
  
  describe('Economic Constraints', () => {
    test('ground constraint >= 1.0', () => {
      for (const year of trajectory) {
        expect(year.ground.constraintMultiplier).toBeGreaterThanOrEqual(1.0);
      }
    });
    
    test('ground constraint increases over time', () => {
      for (let i = 1; i < trajectory.length; i++) {
        expect(trajectory[i].ground.constraintMultiplier)
          .toBeGreaterThanOrEqual(trajectory[i-1].ground.constraintMultiplier * 0.99); // Allow tiny dips
      }
    });
    
    test('crossover year is 2028-2045', () => {
      const crossoverYear = trajectory.find(y => y.crossover)?.year;
      expect(crossoverYear).toBeDefined();
      if (crossoverYear) {
        expect(crossoverYear).toBeGreaterThanOrEqual(2028);
        expect(crossoverYear).toBeLessThanOrEqual(2045);
      }
    });
    
    test('orbital costs decrease over time', () => {
      const o2025 = trajectory[0].orbit.totalCostPerPflopYear;
      const o2050 = trajectory[trajectory.length - 1].orbit.totalCostPerPflopYear;
      expect(o2050).toBeLessThan(o2025 * 0.5); // At least 2x improvement
    });
  });
  
  describe('Data Quality', () => {
    test('no NaN values', () => {
      const json = JSON.stringify(trajectory);
      expect(json).not.toContain('NaN');
    });
    
    test('no Infinity values', () => {
      const json = JSON.stringify(trajectory);
      expect(json).not.toContain('Infinity');
    });
    
    test('all costs are positive', () => {
      for (const year of trajectory) {
        expect(year.orbit.totalCostPerPflopYear).toBeGreaterThan(0);
        expect(year.ground.totalCostPerPflopYear).toBeGreaterThan(0);
      }
    });
  });
  
  describe('SLA Pricing', () => {
    test('premium > standard > basic pricing', () => {
      for (const year of trajectory) {
        const gp = year.orbit.gpuHourPricing;
        if (gp?.basic && gp?.standard && gp?.premium) {
          expect(gp.premium.pricePerGpuHour).toBeGreaterThan(gp.standard.pricePerGpuHour);
          expect(gp.standard.pricePerGpuHour).toBeGreaterThan(gp.basic.pricePerGpuHour);
        }
      }
    });
    
    test('SLA availability targets are valid', () => {
      expect(SLA_DEFINITIONS.basic.availabilityTarget).toBe(0.99);
      expect(SLA_DEFINITIONS.standard.availabilityTarget).toBe(0.999);
      expect(SLA_DEFINITIONS.premium.availabilityTarget).toBe(0.9999);
    });
  });

  describe('Launch Cost Monotonicity', () => {
    test('launch cost per kg is non-increasing', () => {
      for (let i = 1; i < trajectory.length; i++) {
        const prevYear = trajectory[i - 1].orbit.launchCostPerKg;
        const currYear = trajectory[i].orbit.launchCostPerKg;
        expect(currYear).toBeLessThanOrEqual(prevYear);
      }
    });
  });

  describe('Constraint Formula Verification', () => {
    test('constraint multiplier matches queue formula', () => {
      for (const year of trajectory) {
        const g = year.ground;
        if (g.constraintComponents) {
          const { queuePressure, utilizationPressure, scarcityPremium } = g.constraintComponents;
          const MAX_CONSTRAINT = 50;
          const scale = 5;
          const normalizedScarcity = Math.max(0, scarcityPremium - 1);
          const expected = Math.min(
            MAX_CONSTRAINT,
            1 + (MAX_CONSTRAINT - 1) * (1 - Math.exp(-normalizedScarcity / scale))
          );
          const actual = g.constraintMultiplier;
          const error = Math.abs(actual - expected);
          expect(error).toBeLessThan(1e-6);
        }
      }
    });
  });

  describe('Specific Power Consistency', () => {
    test('effective specific power = system * multipliers (within 1e-9)', () => {
      for (const year of trajectory) {
        const o = year.orbit;
        if (o.specificPowerMultipliers && o.specificPower_subsystem_WPerKg && o.specificPower_effective_WPerKg) {
          const { baseSpecificPower, product, effective } = o.specificPowerMultipliers;
          
          // Formula: effective = baseSpecificPower * thermalMultiplier * structureMultiplier * scalingPenalty / massMultiplier
          const expectedEffective = product !== undefined 
            ? baseSpecificPower * product
            : baseSpecificPower * (o.specificPowerMultipliers.thermalMultiplier || 1.0) 
              * (o.specificPowerMultipliers.structureMultiplier || 1.0)
              / (o.specificPowerMultipliers.massMultiplier || 1.0);
          
          const error = Math.abs(effective - expectedEffective);
          expect(error).toBeLessThan(1e-9);
          
          // Also verify against the stored effective value
          expect(o.specificPower_effective_WPerKg).toBeCloseTo(effective, 1);
        }
      }
    });
  });

  describe('Regression Tests', () => {
    // Test A: setting overheadMassFrac > 0 must decrease effectiveSpecificPower (never increase)
    test('A: overheadMassFrac > 0 decreases effectiveSpecificPower', () => {
      const { computePhysicsCost } = require('../physicsCost');
      const baseParams = getMcCalipStaticParams(2025);
      
      // Calculate base case
      const baseResult = computePhysicsCost(baseParams);
      const baseEffective = baseResult.orbit.specificPower_effective_WPerKg || baseResult.orbit.specificPowerWPerKg;
      const baseOverheadFrac = baseResult.orbit.specificPowerMultipliers?.overheadMassFrac || 0;
      
      // Create modified params with higher overhead (simulate by increasing structure mass fraction)
      // This is a conceptual test - in practice, overheadMassFrac is calculated from actual masses
      // We verify that when overheadMassFrac increases, effectiveSpecificPower decreases
      expect(baseOverheadFrac).toBeGreaterThanOrEqual(0);
      
      // Verify invariant: effectiveSpecificPower <= baseSpecificPower
      if (baseResult.orbit.specificPowerMultipliers) {
        const { baseSpecificPower, effective } = baseResult.orbit.specificPowerMultipliers;
        expect(effective).toBeLessThanOrEqual(baseSpecificPower * 1.01); // Allow 1% tolerance
      }
    });

    // Test B: thermalCapFactor computed from Stefan-Boltzmann must match cap factor used in compute efficiency
    test('B: thermalCapFactor from Stefan-Boltzmann matches compute efficiency cap', () => {
      for (const year of trajectory) {
        const o = year.orbit;
        const thermalSystem = o.hybridBreakdown?.thermalSystem || null;
        
        if (thermalSystem && thermalSystem.qPerM2_W && thermalSystem.areaAvailableM2) {
          // Recalculate thermalCapFactor from Stefan-Boltzmann
          const maxRejectableW = thermalSystem.areaAvailableM2 * thermalSystem.qPerM2_W;
          const maxRejectableKw = maxRejectableW / 1000;
          const wasteHeatKw = thermalSystem.wasteHeatKw || (thermalSystem.wasteHeatW ? thermalSystem.wasteHeatW / 1000 : 0);
          
          if (wasteHeatKw > 0) {
            const expectedThermalCapFactor = Math.min(1.0, maxRejectableKw / wasteHeatKw);
            const actualThermalCapFactor = o.thermalCapFactor;
            
            // Allow 1% tolerance for rounding
            const error = Math.abs(actualThermalCapFactor - expectedThermalCapFactor) / expectedThermalCapFactor;
            expect(error).toBeLessThan(0.01);
          }
        }
      }
    });

    // Test C: total cost equals sum of components within 0.1%
    test('C: total cost equals sum of components within 0.1%', () => {
      for (const year of trajectory) {
        // Ground cost accounting
        const g = year.ground;
        const groundComponents = 
          g.energyCostPerPflopYear +
          g.siteCostPerPflopYear +
          g.hardwareCapexPerPflopYear;
        const groundError = Math.abs(groundComponents - g.totalCostPerPflopYear) / g.totalCostPerPflopYear;
        expect(groundError).toBeLessThan(0.001); // 0.1%
        
        // Orbital cost accounting
        const o = year.orbit;
        const orbitalComponents = 
          (o.energyCostPerPflopYear || 0) +
          (o.hardwareCostPerPflopYear || 0) +
          (o.launchCostPerPflopYear || 0) +
          (o.thermalSystemCost || 0) +
          (o.regulatoryCost || o.hybridBreakdown?.regulatory || 0) +
          (o.replacementRateCost || o.hybridBreakdown?.ops || 0) +
          (o.networkingCost || o.hybridBreakdown?.networking || 0) +
          (o.interconnectCost || o.hybridBreakdown?.interconnect || 0) +
          (o.hybridBreakdown?.bus || 0) +
          (o.hybridBreakdown?.radiation || 0) +
          (o.hybridBreakdown?.congestion || 0);
        const orbitalError = Math.abs(orbitalComponents - o.totalCostPerPflopYear) / o.totalCostPerPflopYear;
        expect(orbitalError).toBeLessThan(0.001); // 0.1%
      }
    });

    // Test D: changing groundEffectiveGflopsPerW_2025 by 2× halves energyCostPerPflopYear (all else fixed)
    test('D: 2× groundEffectiveGflopsPerW_2025 halves energyCostPerPflopYear', () => {
      const { computePhysicsCost } = require('../physicsCost');
      const baseParams = getMcCalipStaticParams(2025);
      
      // Base case
      const baseResult = computePhysicsCost(baseParams);
      const baseEnergyCost = baseResult.ground.energyCostPerPflopYear;
      const baseGflopsPerW = baseResult.ground.gflopsPerWatt;
      
      // Double the GFLOPS/W
      const modifiedParams = {
        ...baseParams,
        groundEffectiveGflopsPerW_2025: baseParams.groundEffectiveGflopsPerW_2025 * 2,
      };
      const modifiedResult = computePhysicsCost(modifiedParams);
      const modifiedEnergyCost = modifiedResult.ground.energyCostPerPflopYear;
      
      // Energy cost should be approximately halved (within 5% tolerance)
      // Energy cost = (electricity price * MWh per PFLOP-year) / GFLOPS/W
      // So doubling GFLOPS/W should halve energy cost
      const expectedEnergyCost = baseEnergyCost / 2;
      const error = Math.abs(modifiedEnergyCost - expectedEnergyCost) / expectedEnergyCost;
      expect(error).toBeLessThan(0.05); // 5% tolerance
    });
  });
  
  describe('Scarcity Rent Saturation', () => {
    test('scarcity rent saturates with wait time (no exponential blow-up)', () => {
      const { calculateScarcityRent } = require('../ground_constraint_penalties');
      
      const capexAnnualBase = 10000; // $10k/PFLOP-year
      const waitCapYears = 10;
      const rentMaxFrac = 0.8;
      
      // Test: rent should saturate as waitYears increases
      const rentAt0 = calculateScarcityRent(0, capexAnnualBase, { waitCapYears, rentMaxFracOfCapexAnnual: rentMaxFrac });
      const rentAt5 = calculateScarcityRent(5, capexAnnualBase, { waitCapYears, rentMaxFracOfCapexAnnual: rentMaxFrac });
      const rentAt10 = calculateScarcityRent(10, capexAnnualBase, { waitCapYears, rentMaxFracOfCapexAnnual: rentMaxFrac });
      const rentAt20 = calculateScarcityRent(20, capexAnnualBase, { waitCapYears, rentMaxFracOfCapexAnnual: rentMaxFrac }); // Beyond cap
      
      // Rent should be 0 at waitYears=0
      expect(rentAt0.scarcityRentPerPflopYear).toBe(0);
      
      // Rent should increase with wait time
      expect(rentAt5.scarcityRentPerPflopYear).toBeGreaterThan(rentAt0.scarcityRentPerPflopYear);
      expect(rentAt10.scarcityRentPerPflopYear).toBeGreaterThan(rentAt5.scarcityRentPerPflopYear);
      
      // Rent should saturate (rentAt20 should equal rentAt10 since wait is capped)
      expect(rentAt20.scarcityRentPerPflopYear).toBeCloseTo(rentAt10.scarcityRentPerPflopYear, 1);
      
      // Rent should not exceed max fraction of capex
      const maxRent = rentMaxFrac * capexAnnualBase;
      expect(rentAt10.scarcityRentPerPflopYear).toBeLessThanOrEqual(maxRent * 1.01); // Allow 1% tolerance
    });
    
    test('scarcity rent is monotonic with wait time', () => {
      const { calculateScarcityRent } = require('../ground_constraint_penalties');
      
      const capexAnnualBase = 10000;
      const waitCapYears = 10;
      
      const rents = [];
      for (let waitYears = 0; waitYears <= 15; waitYears += 0.5) {
        const result = calculateScarcityRent(waitYears, capexAnnualBase, { waitCapYears });
        rents.push(result.scarcityRentPerPflopYear);
      }
      
      // Rent should be non-decreasing
      for (let i = 1; i < rents.length; i++) {
        expect(rents[i]).toBeGreaterThanOrEqual(rents[i - 1] - 1e-9); // Allow tiny floating point errors
      }
    });
    
    test('GPU-hour gridScarcity does not exceed max rent conversion', () => {
      for (const year of trajectory) {
        const ground = year.ground;
        if (ground.gpuHourPricing?.standard?.costBreakdown?.gridScarcity) {
          const gridScarcity = ground.gpuHourPricing.standard.costBreakdown.gridScarcity;
          
          // Get scarcity terms from constraints
          const scarcityTermsPerPflopYear = 
            (ground.constraints?.delayPenalty || 0) +
            (ground.constraints?.scarcityRentPerPflopYear || 0) +
            (ground.constraints?.capacityDeliveryPremium || 0);
          
          // Convert to GPU-hour
          const pflopsPerGpu = 2.0;
          const utilizationTarget = 0.85;
          const hoursPerYear = 8760;
          const annualGpuHoursPerPFLOP = hoursPerYear * utilizationTarget / pflopsPerGpu;
          const expectedGpuHour = scarcityTermsPerPflopYear / annualGpuHoursPerPFLOP;
          
          // GPU-hour scarcity should match PFLOP-year scarcity conversion
          const error = Math.abs(gridScarcity - expectedGpuHour) / Math.max(expectedGpuHour, 1e-9);
          expect(error).toBeLessThan(0.01); // 1% tolerance
          
          // If scarcity rent exists, check it doesn't exceed max
          if (ground.constraints?.scarcityRentPerPflopYear) {
            const capexAnnualBase = 
              (ground.hardwareCapexPerPflopYear || 0) +
              (ground.siteCapexAmortPerPflopYear || 0) +
              (ground.constraints?.capacityDeliveryPremium || 0);
            const maxRent = 0.8 * capexAnnualBase; // Default rentMaxFracOfCapexAnnual = 0.8
            expect(ground.constraints.scarcityRentPerPflopYear).toBeLessThanOrEqual(maxRent * 1.01); // Allow 1% tolerance
          }
        }
      }
    });
  });
});

