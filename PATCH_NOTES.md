# Patch Notes: Remove Double Counting, Expose Assumptions, Fix Market Share

## Files Changed

### 1. Ground Constraints Double Counting
**File: `frontend/app/lib/model/physicsCost.ts`**
- **Lines 800-802**: Removed `energyCost = energyCostBase * penalties.pueMultiplier` - was applying multiplier to energy cost
- **Lines 827-828**: Removed `energyConstraintMultiplier = penalties.pueMultiplier` - was tracking multiplier
- **Lines 855-863**: Removed multiplier tracking in `constraintBreakdown` - multipliers no longer applied
- **Lines 1111-1119**: Removed `energyConstraintMultiplier` assignment and multiplier tracking
- **Lines 1570-1574**: Removed `constraintMultiplier` from output (kept for backward compat but set to 1.0)

**File: `frontend/app/lib/model/types.ts`**
- Added `ground.constraints` debug field with method tracking and applied multipliers flags

### 2. Replacement Assumptions
**File: `frontend/app/lib/model/orbitalPhysics.ts`**
- Added replacement assumptions parameters to `IntegratedPhysicsParams`
- Created `computeReplacementRateCost` function as single source of truth
- Added `replacementAssumptions` debug field to output
- Added sensitivity test in dev mode

**File: `frontend/app/lib/model/types.ts`**
- Added `replacementAssumptions` to orbital breakdown
- Added `replacementSensitivity` for dev mode testing

### 3. Market Share Fixes
**File: `frontend/app/lib/model/trajectory.ts`**
- Changed `orbitalSharePct` to `orbitalShareFrac` (0..1 instead of 0..100)
- Added feasibility gating before share calculation
- Added revenue/capacity consistency checks
- Added debug fields

**File: `frontend/app/lib/model/types.ts`**
- Updated `MarketAnalysis` interface to use fractions
- Added `market.debug` field

## Double Counting Locations (Fixed)

1. **Queue Model (Line 802)**: `energyCost = energyCostBase * penalties.pueMultiplier` - REMOVED
2. **Queue Model (Line 860)**: `energyMultiplier: coolingMultiplier * waterMultiplier` - Set to 1.0, not applied
3. **Queue Model (Line 828)**: `energyConstraintMultiplier = penalties.pueMultiplier` - REMOVED
4. **Old Constraint Model (Line 494)**: Uses multiplier to calculate premium - KEPT (correct: converts to additive)
5. **Regional Model (Line 1066)**: Uses `constraintMultiplier` - Set to 1.0, not applied to costs


