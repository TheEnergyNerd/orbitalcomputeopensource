# Physics Engine Fixes - Summary for Next Chat

## Critical Fixes Applied

### 1. Removed Forced Heat Equalization
- **File**: `frontend/app/lib/orbitSim/physicsEngine.ts`
- **Fix**: Removed SAFE mode auto-sizing that forced `heatReject_kw = heatGen_kw`
- **Result**: Heat rejection now follows physics: `heatReject_kw = min(heatGen_kw, radiator_capacity_kw)`
- **Status**: ✅ Fixed

### 2. True Thermal Mass Scaling
- **File**: `frontend/app/lib/orbitSim/physicsEngine.ts`
- **Fix**: `thermal_mass_J_per_C = max(satellite_count * 5e8, 1e8)` (scales with fleet size)
- **Result**: Thermal mass now scales correctly (500 MJ/°C per satellite)
- **Status**: ✅ Fixed

### 3. Maintenance Affects Survival
- **File**: `frontend/app/lib/orbitSim/yearSteppedDeployment.ts`
- **Fix**: Maintenance overload penalty applied BEFORE survival multiplier
- **Formula**: `maintenance_utilization_percent > 100` → `survival_fraction *= exp(-0.25 * overload)`
- **Result**: Maintenance can now kill the fleet when overloaded
- **Status**: ✅ Fixed

### 4. Charts Read from Debug State
- **Files**: 
  - `frontend/app/components/orbitSim/DualClassStackChart.tsx` ✅ Fixed
  - `frontend/app/components/orbitSim/PowerComputeScatter.tsx` ✅ Fixed
  - `frontend/app/components/orbitSim/GlobalKPIStrip.tsx` ✅ Fixed
  - `frontend/app/components/constraints/EnergyReturnOnLaunch.tsx` ✅ Fixed
  - `frontend/app/components/constraints/PowerStrandedChart.tsx` ✅ Fixed
- **Fix**: All charts now read directly from `getDebugState()` instead of recalculating
- **Result**: Single source of truth for all metrics

### 5. Utilization Metrics from Physics
- **File**: `frontend/app/lib/orbitSim/yearSteppedDeployment.ts`
- **Fix**: Utilization metrics now use physics-based values:
  - `utilization_heat = radiator_utilization_percent / 100`
  - `utilization_backhaul = backhaul_utilization_percent / 100`
  - `utilization_autonomy = maintenance_utilization_percent / 100`
  - `utilization_overall = power_utilization_percent / 100`
- **Result**: Utilization reflects actual physics constraints

## Current Issues (If Charts Still Show 0)

### Debug State Population
- **Check**: `runMultiYearDeployment` is called in `simulationRunner.ts` when simulation runs
- **Check**: Debug state is populated in `yearSteppedDeployment.ts` via `addDebugStateEntry()`
- **Verify**: `getDebugState()[year]` returns data for current year

### Common Causes of Zero Values
1. **Debug state not populated**: Simulation hasn't run yet
2. **Wrong year**: Chart reading year that doesn't exist in debug state
3. **Zero values in physics**: `compute_exportable_flops` is actually 0 (backhaul/thermal limited)
4. **Unit conversion**: Values in wrong units (FLOPS vs PFLOPs)

## Key Files to Check

1. **`frontend/app/lib/orbitSim/physicsEngine.ts`**: Core physics engine
2. **`frontend/app/lib/orbitSim/yearSteppedDeployment.ts`**: Year-by-year simulation + debug state population
3. **`frontend/app/lib/orbitSim/debugState.ts`**: Debug state management
4. **`frontend/app/lib/orbitSim/simulationRunner.ts`**: Calls `runMultiYearDeployment` to populate debug state
5. **`frontend/app/store/simulationStore.ts`**: Calls `runSimulationFromPlans` which triggers physics simulation

## Debugging Steps

1. **Check debug state**: `window.getDebugState()` in browser console
2. **Check specific year**: `window.getDebugState()[2030]` to see if data exists
3. **Check compute_exportable_flops**: Should be in FLOPS (divide by 1e15 for PFLOPs)
4. **Check power_total_kw**: Should be in kW (divide by 1000 for MW)
5. **Verify simulation ran**: Check if `runMultiYearDeployment` was called

## Physics Rules Enforced

1. **RULE 1**: Survival is a hard multiplier - if `survival_fraction == 0`, everything = 0
2. **RULE 2**: Thermal mass cannot be zero - `max(satellite_count * 5e8, 1e8)`
3. **RULE 3**: Thermal death is immediate - if `temp_core_C > 450`, `survival_fraction = 0`
4. **RULE 4**: Exportable compute is the only real compute - charts use `compute_exportable_flops`
5. **RULE 5**: Radiator must be sized to allow stable mode (SAFE mode only, but NOT forced)
6. **RULE 6**: Power utilization reflects limiters - `max(radiator, backhaul, maintenance)`

## Backhaul Capacity Fix
- **Changed**: `backhaul_capacity_tbps = (S_A_new + S_B_new) * 0.5` → `* 0.05`
- **Reason**: 50 Gbps per satellite = 0.05 TBps per satellite (not 0.5 TBps)







