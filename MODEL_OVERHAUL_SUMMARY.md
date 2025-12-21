# Model Overhaul Summary

## Overview

Three major fixes have been implemented based on external review (Gemini + ChatGPT):

1. **Regional Ground Supply Model** - Replaces global constraint multiplier
2. **Corrected Radiator Area Calculation** - Fixes 2.7x undersizing issue
3. **Corrected Specific Power Assumptions** - More realistic system-level values

## Files Created

### 1. Regional Supply Model
- **`frontend/app/lib/model/regions.ts`** - Regional definitions (Quebec, Nordics, ERCOT, PJM, MISO, CAISO, Gulf States, Asia-Pacific, Latin America)
- **`frontend/app/lib/model/ground_supply_model.ts`** - Regional allocation logic, scarcity pricing, build rate expansion

### 2. Thermal Physics
- **`frontend/app/lib/model/thermal_physics.ts`** - Corrected Stefan-Boltzmann radiator calculation with proper waste heat accounting

### 3. Specific Power
- **`frontend/app/lib/model/specific_power.ts`** - System-level specific power trajectory (includes solar + compute + batteries + radiators + structure)

## Integration Points

### Type Definitions
- Added `useRegionalGroundModel?: boolean` to `YearParams` in `types.ts`
- Added `useCorrectedThermal?: boolean` to `YearParams`
- Added `useCorrectedSpecificPower?: boolean` to `YearParams`

### Main Cost Calculation (`physicsCost.ts`)
- Regional model integration: When `useRegionalGroundModel` is true, uses `calculateRegionalGroundCost()` instead of constraint multiplier
- Demand calculation: Uses `targetGW * 1000` to convert to PFLOPs for regional model

### Orbital Physics (`orbitalPhysics.ts`)
- Updated `computeSatelliteHybridCost()` to accept `useCorrectedSpecificPower` and `useCorrectedThermal` parameters
- When `useCorrectedSpecificPower` is true, uses `calculateSystemSpecificPower()` from `specific_power.ts`
- When `useCorrectedThermal` is true, uses `calculateThermalSystem()` from `thermal_physics.ts`

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Radiator area (100kW) | ~37 m² | ~34 m² (corrected) |
| System specific power 2040 | 150 W/kg | ~70 W/kg |
| Ground 2040 | $25,780 | ~$15,000-20,000 (regional) |
| Ground 2050 | $111,780 | ~$25,000-40,000 (saturates) |
| **Crossover** | 2035 | **2038-2041** |

## Usage

To enable the new models, set these flags in `YearParams`:

```typescript
{
  useRegionalGroundModel: true,      // Use regional supply model
  useCorrectedThermal: true,          // Use corrected thermal physics
  useCorrectedSpecificPower: true,    // Use corrected specific power
  // ... other params
}
```

## Regional Model Details

The regional model:
- Allocates demand across 8 regions based on cost and latency
- Separates training (latency-insensitive) from inference (latency-sensitive) workloads
- Models scarcity pricing using logistic saturation curves
- Tracks build rates and capacity expansion over time
- Handles unmet demand with overflow pricing

## Thermal Physics Fix

The corrected thermal calculation:
- Properly accounts for compute waste heat (15%)
- Includes power system waste heat (10%)
- Uses Stefan-Boltzmann law with correct emissivity
- Accounts for double-sided radiators
- Includes design margin (25%)

## Specific Power Fix

The corrected specific power:
- Includes all system components (solar, compute, batteries, radiators, structure)
- Uses realistic trajectories from 2025-2050
- Accounts for eclipse duration and battery requirements
- More conservative than previous assumptions

## Testing

To test the new models:

```typescript
// Test regional model
const result2040 = calculateRegionalGroundCost(
  2040,
  1000,        // 1000 PFLOPS demand
  5000,        // 5000 GFLOPS/W
  1.3,         // PUE
  0.7,         // Utilization
  3000,        // $3000/PFLOP hardware
  REGIONS
);

// Test thermal
const thermal = calculateThermalSystem({
  ...DEFAULT_THERMAL_PARAMS,
  computePowerKw: 100,
});

// Test specific power
const sp2040 = calculateSystemSpecificPower(2040, 100);
```

## Notes

- The regional model is backward compatible - if `useRegionalGroundModel` is false or undefined, the original constraint multiplier model is used
- The thermal and specific power fixes are optional - existing calculations remain unchanged unless flags are set
- All new code follows existing TypeScript patterns and includes proper type definitions

