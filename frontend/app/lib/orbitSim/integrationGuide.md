# New Power-First Orbital Compute System - Integration Guide

## ✅ Completed Core Models

1. **4-Shell Orbital Model** (`orbitShells.ts`) - VLEO, MID-LEO, SSO, MEO
2. **Power-First Pod Spec** (`orbitalPodSpec.ts`) - 100kW minimum enforced
3. **Power-Derived Compute** (`computeEfficiency.ts`) - Efficiency curves by year
4. **Launch Power Model** (`launchPowerModel.ts`) - Starship-equivalent (6MW/launch)
5. **Ground System** (`groundSystem.ts`) - Learning rate model
6. **Cost Crossover** (`costCrossover.ts`) - Orbital vs ground comparison
7. **Carbon Model** (`carbonModel.ts`) - Monotonic carbon curves
8. **Congestion Routing** (`congestionRouting.ts`) - Shell capacity limits
9. **Monte Carlo Futures** (`monteCarloFutures.ts`) - Trajectory simulation
10. **RL-Lite Control** (`rlLiteControl.ts`) - Routing decisions
11. **Validation System** (`validation.ts`) - Auto-repair on violations

## 🔄 Integration Status

### Fixed
- ✅ `scenarioCalculator.ts` - Now uses power-derived compute
- ✅ `yearSeriesCalculator.ts` - Now uses power-derived compute
- ✅ `orbitConfigs.ts` - Removed sub-100kW pods
- ✅ `podSpecs.ts` - Compute derived from power
- ✅ `podTiers.ts` - Updated to 100kW minimum
- ✅ `orbitalUnitsStore.ts` - Removed GEO types
- ✅ `OrbitalShells.tsx` - Updated to 4-shell visualization

### Still Needs Integration

#### Backend (Celestrak TLE Removal)
- `backend/main.py` - Remove `fetch_tles()` calls, replace with synthetic satellites
- `backend/services/starlink.py` - Remove TLE fetching, use orbital shell model
- `backend/routes/state.py` - Remove TLE references

#### Factory Manufacturing Removal
- `frontend/app/lib/orbitSim/simulationRunner.ts` - Replace factory throughput with launch-driven power
- `frontend/app/lib/orbitSim/factoryModel.ts` - Mark as deprecated, use launch power model
- `frontend/app/lib/orbitSim/factoryHelpers.ts` - Replace with launch cadence calculations

#### New Model Integration
- Connect `costCrossover.ts` to UI components
- Connect `carbonModel.ts` to visualization
- Connect `congestionRouting.ts` to routing system
- Connect `monteCarloFutures.ts` to futures visualization
- Connect `rlLiteControl.ts` to routing decisions

## 📝 Usage Examples

### Calculate Compute from Power
```typescript
import { calculateComputeFromPower } from './computeEfficiency';

const powerKW = 100; // 100kW minimum
const year = 2025;
const computePFLOPs = calculateComputeFromPower(powerKW * 1000, year);
```

### Get Shell by Altitude
```typescript
import { getShellByAltitude } from './orbitShells';

const shell = getShellByAltitude(550); // Returns MID-LEO shell
```

### Calculate Launch Power
```typescript
import { calculateAnnualOrbitalPower, STARSHIP_EQUIV } from './launchPowerModel';

const launchesPerYear = 100;
const annualPowerGW = calculateAnnualOrbitalPower(launchesPerYear, STARSHIP_EQUIV);
```

### Cost Crossover
```typescript
import { calculateCostCrossover } from './costCrossover';

const result = calculateCostCrossover(orbitalCosts, groundCosts);
console.log(result.message); // "Orbital compute becomes cheaper than ground in YEAR X."
```

### Validation
```typescript
import { validateAndRepair } from './validation';

const { state, validation, repaired } = validateAndRepair(simState);
if (!validation.valid) {
  console.error("Model broken:", validation.errors);
}
```

