# Orbital Compute Model - Context Summary

## Project Overview
This is a financial/physics model comparing orbital vs ground datacenter economics for AI compute. The model projects costs, capacity, and market share over time (2025-2060) and outputs charts and analysis.

**Main Repos:**
- `orbitalcompute` - Core model (localhost:3000)
- `orbitalcomputeopensource` - Public-facing version (synced from core)

## Recent Major Changes (Latest Session)

### 1. Removed Exponential Ground Constraint Bug
**Problem:** Time-based exponential constraint `Math.pow(1.47, yearsFromBase)` was causing ground costs to explode exponentially.

**Fix:** 
- Deleted the exponential calculation from `calculateGroundTotal()` in `physicsCost.ts`
- Legacy path now uses base costs only (real constraints come from buildout/queue models)
- **File:** `frontend/app/lib/model/physicsCost.ts` (lines ~476-508)

### 2. Fixed Delay Penalty Units & Compounding
**Problem:** Delay penalty was compounding exponentially and had unit mismatches (TFLOPS/W vs GFLOPS/W).

**Fix:**
- Added unit guard: auto-converts TFLOPS/W → GFLOPS/W if input < 50
- Removed compounding: changed from `(1+WACC)^waitYears - 1` to linear `WACC * waitYears`
- Reduced `MARGIN_PER_MW_YEAR`: $2M → $500k
- Added cap: penalty ≤ 2.5x reference capex amort
- **File:** `frontend/app/lib/model/ground_constraint_penalties.ts` (lines ~94-167)

### 3. Updated Demand Projection
**Problem:** Demand wasn't hitting stated targets (450 GW by 2040, 3 TW by 2060).

**Fix:**
- Calibrated piecewise CAGR in `getGlobalDemandGw()` to hit exact targets
- Raised `maxBuildRateGwYear` ceiling: 50 → 120 GW/year
- **File:** `frontend/app/lib/model/ground_queue_model.ts` (lines ~30-35, ~44-47)

### 4. Added Feasibility Gating for Earlier Crossover
**Problem:** Crossover was too late because ground constraints weren't gating capacity properly.

**Fix:**
- Hard gate: if `avgWaitYears > 3` OR `backlog > 25% demand`, ground serves only 50% of demand
- Forces spillover to orbital earlier (feasibility-driven, not pricing-driven)
- Crossover already uses effective cost (includes delayPenalty + scarcityRent)
- **File:** `frontend/app/lib/model/trajectory.ts` (lines ~187-195)

### 5. Wait-Time-Based Scarcity Rent (Previous Session)
**Problem:** Grid scarcity was exploding exponentially with backlog.

**Fix:**
- Replaced backlog-based pricing with saturating wait-time-based rent (Hill function)
- Scarcity rent: threshold=1.0 year, maxFrac=0.6, shape=2.0 (smooth, not explosive)
- Delay penalty: strictly linear (WACC * capex * waitYears)
- GPU-hour pricing: only converts PFLOP-year costs (no local computation)
- **Files:** 
  - `frontend/app/lib/model/ground_constraint_penalties.ts` (calculateScarcityRent)
  - `frontend/app/lib/model/physicsCost.ts` (ground GPU-hour pricing)

## Key Architecture

### Cost Model Structure
1. **Orbital Costs:** Launch, hardware, replacement, operations, power (solar)
2. **Ground Costs:** Hardware, energy, site capex, buildout premiums, delay penalties, scarcity rent

### Constraint Models (Ground)
Three models available (mutually exclusive):
1. **Legacy (`calculateGroundTotal`)**: Base costs only (exponential constraint removed)
2. **Queue Model (`useQueueBasedConstraint`)**: Uses `ground_queue_model.ts` for supply/demand dynamics
3. **Buildout Model (`useBuildoutModel`)**: Uses `ground_ramping_mobilization.ts` for ramping buildout with bottlenecks

### Cost Accounting Rules
- **Adders only** (no multipliers): `capacityDeliveryPremium` + `delayPenalty` + `scarcityRent`
- **Headline cost** = base (excludes delay penalty)
- **Effective cost** = base + delayPenalty + scarcityRent (used for crossover)
- **Double counting prevention**: Runtime assertions prevent multiplier + adders simultaneously

### Market Share Calculation
- **Feasibility gating**: Ground capacity reduced by backlog/wait time
- **Hard gate**: If `avgWaitYears > 3` OR `backlog > 25% demand`, ground serves only 50%
- **Served compute** cannot exceed feasible compute
- **Shares** are always 0..1 fractions

### Crossover Logic
- Uses **effective ground cost** (includes delayPenalty + scarcityRent)
- Compares to orbital cost
- Also computes GPU-hour crossover (includes all scarcity adders)

## Key Files

### Core Model Files
- `frontend/app/lib/model/physicsCost.ts` - Main cost calculation engine
- `frontend/app/lib/model/trajectory.ts` - Trajectory generation, market share, crossover
- `frontend/app/lib/model/orbitalPhysics.ts` - Orbital physics (launch, power, thermal, etc.)
- `frontend/app/lib/model/ground_constraint_penalties.ts` - Ground constraint penalties (delay, scarcity rent)
- `frontend/app/lib/model/ground_buildout.ts` - Buildout capex premiums
- `frontend/app/lib/model/ground_ramping_mobilization.ts` - Ramping mobilization model
- `frontend/app/lib/model/ground_queue_model.ts` - Queue-based supply/demand model

### UI Files
- `frontend/app/compare/page.tsx` - Main comparison page
- `frontend/app/components/orbitSim/SimulationMetrics.tsx` - Simulation metrics display

### Type Definitions
- `frontend/app/lib/model/types.ts` - All TypeScript interfaces

## Important Constants & Defaults

### Ground Constraints
- `BASE_SITE_2025 = 1500` ($/PFLOP-year)
- `MARGIN_PER_MW_YEAR = 500_000` ($500k/MW-year lost margin)
- `CAPEX_PER_MW = 3_000_000` ($3M/MW capex at risk)
- `BASE_SITE_COST_PER_MW_YEAR = 150_000` ($150k/MW-year)

### Scarcity Rent (Wait-Time-Based)
- `waitThresholdYears = 1.0` (scarcity starts early)
- `rentMaxFracOfCapexAnnual = 0.6` (max 60% of annualized capex)
- `rentShapeP = 2.0` (smooth, not explosive)
- `waitCapYears = 10` (max wait time for rent calculation)

### Demand Targets
- 2025: 120 GW
- 2040: 450 GW
- 2060: 3,000 GW (3 TW)

### Buildout Limits
- `maxBuildRateGwYear = 120` GW/year (raised from 50)
- `MAX_WAIT_YEARS = 10` (capped wait time)

## Known Issues Fixed

1. ✅ **Exponential ground cost explosion** - Removed `1.47^yearsFromBase`
2. ✅ **Delay penalty compounding** - Changed to linear `WACC * waitYears`
3. ✅ **Unit mismatches** - Added auto-conversion for TFLOPS/W → GFLOPS/W
4. ✅ **GPU-hour price explosion** - Replaced with saturating wait-time rent
5. ✅ **Crossover too late** - Added feasibility gating + effective cost comparator
6. ✅ **Double counting** - Runtime assertions prevent multiplier + adders

## Design Principles

1. **Single source of truth**: Demand scalar (`demandComputeGW`) used consistently
2. **Adders only**: No constraint multipliers (except legacy compatibility)
3. **Unit consistency**: All conversions explicit, with guards
4. **Saturating functions**: No exponential blowups (Hill functions, caps)
5. **Feasibility gating**: Physical limits enforced before cost comparison
6. **Effective cost**: Crossover uses scarcity-inclusive cost

## Testing & Validation

- Invariant tests in `frontend/app/lib/model/__tests__/model_invariants.test.ts`
- Runtime assertions in development mode
- Unit validation for shares (0..1 fractions)
- Demand scalar consistency checks
- Double counting prevention checks

## Next Steps / Potential Improvements

1. Expose replacement/ops assumptions in UI (currently in debug only)
2. Add sensitivity analysis for key parameters
3. Improve chart validation (ensure ground series never disappears)
4. Add more comprehensive regression tests
5. Document parameter ranges and their effects

## Sync Process

When making changes:
1. Make changes in `orbitalcompute` (core repo)
2. Sync to `orbitalcomputeopensource`:
   ```bash
   cp orbitalcompute/frontend/app/lib/model/*.ts orbitalcomputeopensource/app/lib/model/
   ```

## Key Commands

- Dev server: `cd frontend && npm run dev` (runs on localhost:3000)
- Tests: `npm test` (in frontend directory)

---

**Last Updated:** After removing exponential constraint bug and fixing delay penalty units/compounding

