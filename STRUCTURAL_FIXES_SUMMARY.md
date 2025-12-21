# Structural Fixes Summary

## Overview
Fixed three structural issues in the model:
1. **Ground constraints double counting** - Removed multipliers, kept only additive terms
2. **Replacement/ops assumptions** - Exposed and tested replacement assumptions
3. **Market share** - Fixed units, added feasibility gating, fixed revenue consistency

## Files Changed

### 1. Ground Constraints Double Counting

**File: `frontend/app/lib/model/physicsCost.ts`**
- **Lines 800-802**: Removed `energyCost = energyCostBase * penalties.pueMultiplier` - was applying multiplier to energy cost
- **Lines 827-863**: Removed all multiplier tracking and application - all multipliers set to 1.0 (not applied)
- **Lines 1111-1119**: Removed `energyConstraintMultiplier` assignment and multiplier tracking
- **Lines 475-495**: Updated `calculateGroundTotal` to use additive terms only (capacityDeliveryPremium, timeToEnergizePenalty)
- **Lines 1607-1611**: Added `constraints` debug field with method tracking

**File: `frontend/app/lib/model/types.ts`**
- Added `ground.constraints` debug field with:
  - `method: 'adders'`
  - `capacityDeliveryPremium: number`
  - `delayPenalty: number`
  - `appliedMultipliers: { constraintMultiplierUsed: false, energyMultiplierUsed: false, siteMultiplierUsed: false }`

**Key Changes:**
- All constraint multipliers are now set to 1.0 and never applied to dollar amounts
- Ground costs are computed as: `totalCost = baseCost + capacityDeliveryPremium + delayPenalty`
- Added invariant check in dev mode to detect double counting

### 2. Replacement/Ops Assumptions

**File: `frontend/app/lib/model/orbitalPhysics.ts`**
- **Lines 1276-1284**: Added `ReplacementAssumptions` interface
- **Lines 1286-1350**: Added `computeReplacementRateCost` function (single-source-of-truth)
- **Lines 1713-1750**: Integrated replacement cost calculation into `computeSatelliteHybridCost`
- **Lines 1752-1800**: Added sensitivity test in dev mode (finite difference test for 2028)

**File: `frontend/app/lib/model/types.ts`**
- Added `replacementAssumptions` to orbital breakdown
- Added `replacementCostBreakdown` with annual rates and costs
- Added `replacementSensitivity` for dev mode testing

**Key Changes:**
- Replacement assumptions are now explicit parameters:
  - `annualFailureRate: 0..1`
  - `repairabilityFraction: 0..1`
  - `sparesMultiplier: >=1`
  - `replacementMassKg`, `swapLaborCostPerKg`, `logisticsCostPerKg` (optional)
  - `replacementCapexModel: 'replace_mass_fraction' | 'replace_unit_fraction'`
- Single-source-of-truth function `computeReplacementRateCost` used everywhere
- Sensitivity test runs in dev mode for year 2028, validates linear response within 10% tolerance
- Unit/range invariants enforced (throws errors if violated)

### 3. Market Share Fixes

**File: `frontend/app/lib/model/trajectory.ts`**
- **Lines 34-69**: Updated `calculateMarketShare` function:
  - Changed from `orbitalSharePct` (0..100) to `orbitalShareFrac` (0..1)
  - Added feasibility gating parameters
  - Added revenue/capacity consistency checks
  - Added debug field with feasibility flags
- **Lines 182-197**: Updated call site to pass feasibility flags

**File: `frontend/app/lib/model/types.ts`**
- Updated `MarketAnalysis` interface to use fractions instead of percentages
- Added `debug` field with feasibility flags and detailed breakdown

**Key Changes:**
- Standardized naming: `orbitalShareFrac` / `groundShareFrac` (0..1)
- Feasibility gating:
  - `orbitalFeasible = orbitalCapacityGW > 0 AND orbit.costAccountingValid`
  - `groundFeasible = groundCapacityGW > 0 AND ground.costAccountingValid`
  - If not feasible, share = 0
- Revenue/capacity consistency:
  - `orbitalCapacityGW == 0 => orbitalShareFrac == 0 AND orbitalRevenue == 0`
  - `orbitalRevenue > 0 => orbitalCapacityGW > 0`
  - Shares sum to 1.0 when both feasible (invariant)

## Double Counting Locations (Fixed)

1. **Queue Model (Line 802)**: `energyCost = energyCostBase * penalties.pueMultiplier` - **REMOVED**
2. **Queue Model (Line 860)**: `energyMultiplier: coolingMultiplier * waterMultiplier` - **Set to 1.0, not applied**
3. **Queue Model (Line 828)**: `energyConstraintMultiplier = penalties.pueMultiplier` - **REMOVED**
4. **Old Constraint Model (Line 494)**: Uses multiplier to calculate premium - **KEPT (correct: converts to additive)**
5. **Regional Model (Line 1066)**: Uses `constraintMultiplier` - **Set to 1.0, not applied to costs**

## Acceptance Checks

### Ground Constraints
- ✅ Constraint multipliers are not applied to any $ term (confirmed in debug flags)
- ✅ `totalCost = base + premiums` only (exact decomposition)
- ✅ `constraints.appliedMultipliers` all set to `false`

### Orbit Replacement
- ✅ Replacement assumptions appear in debug (`replacementAssumptions`)
- ✅ Finite-difference sensitivity test logs near-linear response (within 10% tolerance)
- ✅ Unit/range invariants enforced (throws errors if violated)

### Market Share
- ✅ If `orbitalCapacityGW == 0` then `orbitalShareFrac == 0` and `orbitalRevenue == 0`
- ✅ Shares sum to 1.0 when both feasible
- ✅ Feasibility gating prevents invalid shares

## Testing

All changes maintain backward compatibility where possible:
- Multipliers are kept in debug fields but set to 1.0 (not applied)
- Old field names preserved but deprecated
- New debug fields added for transparency

