# Orbital Compute Control Room - Project Context

## Project Overview

**Orbital Compute Control Room** is an interactive 3D simulation and visualization dashboard that models the economics, physics, and deployment of orbital compute infrastructure (satellites) versus ground-based hyperscale data centers. The project demonstrates how orbital compute can become cost-competitive with ground infrastructure by 2032, with significant advantages in latency, carbon emissions, and scalability.

## Core Concept

The simulation models:
- **Orbital Compute**: Satellites in LEO/MEO providing compute services
- **Ground Compute**: Traditional hyperscale data centers
- **Economics**: Cost per PFLOP, OPEX, carbon emissions, latency
- **Physics**: Thermal constraints, backhaul bandwidth, maintenance, power/solar, compute/silicon
- **Deployment**: Year-by-year satellite deployment from 2025-2040

**Key Thesis**: With Starship-era launch economics and manufacturing learning curves, orbital compute becomes cheaper than ground by 2032, with 50%+ carbon savings and 40%+ latency improvements.

## Tech Stack

### Frontend
- **Framework**: Next.js 14.0.4 (App Router)
- **Language**: TypeScript
- **3D Visualization**: Three.js (React Three Fiber) + Drei
- **Charts**: D3.js, Recharts
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **Build Tool**: Next.js built-in webpack

### Key Dependencies
- `three`, `@react-three/fiber`, `@react-three/drei` - 3D globe visualization
- `d3`, `d3-geo` - Data visualization and charting
- `zustand` - State management
- `framer-motion` - Animations
- `jszip` - Chart export functionality

## Project Structure

```
frontend/app/
├── components/          # React components
│   ├── orbitSim/       # Main simulation UI components
│   ├── three/          # 3D globe components
│   └── ...
├── lib/
│   └── orbitSim/       # Core simulation logic
│       ├── yearSteppedDeployment.ts  # Main simulation engine
│       ├── scenarioParams.ts         # Scenario definitions
│       ├── selectors/                # Data selectors for charts
│       ├── debugState.ts             # Debug state management
│       └── ...
├── store/              # Zustand stores
│   ├── simulationStore.ts    # Main simulation state
│   ├── orbitSimStore.ts      # Orbital simulation state
│   └── ...
└── page.tsx            # Main entry point
```

## Key Features

### 1. **3D Globe Visualization** (`app/three/`)
- Interactive Earth with satellite orbits
- Real-time satellite positioning
- Shell visualization (LEO_340, LEO_550, LEO_1100, MEO_8000, MEO_20000, GEO)
- Ground data center markers
- Route visualization between satellites and ground

### 2. **Simulation Engine** (`lib/orbitSim/yearSteppedDeployment.ts`)
- Year-by-year deployment calculation (2025-2040)
- Physics-based constraints (thermal, backhaul, maintenance, power, compute)
- Economics modeling (cost/compute, OPEX, carbon)
- Multi-shell capacity and congestion modeling
- Battery technology progression
- Debris accumulation and collision risk

### 3. **Charts & Visualizations** (`components/orbitSim/`)
- **Cost/Compute Curve**: Shows orbital vs ground cost per PFLOP
- **Carbon River**: Annual carbon emissions (ground vs mix)
- **Power Compute Frontier**: Power vs compute relationship
- **Shell Utilization**: Multi-shell capacity utilization
- **Debris & Collision Risk**: Debris accumulation and collision probability
- **Battery Tech**: Battery density and cost progression
- **Simulation Metrics**: Cost, latency, OPEX, carbon with sparklines

### 4. **Physics Sandbox** (`components/orbitSim/PhysicsSandbox.tsx`)
- Interactive physics calculator
- 6 sections: Thermal, Backhaul, Maintenance, Cost Assumptions, Compute/Silicon, Power/Solar
- Real-time constraint validation
- Parameters override simulation when applied

### 5. **Scenarios** (`lib/orbitSim/scenarioParams.ts`)
- **BASELINE**: Cost crossover in 2032
- **ORBITAL_BULL**: More aggressive (crossover ~2029-2030)
- **ORBITAL_BEAR**: Conservative (crossover ~2036+)

## Core Simulation Logic

### Main Entry Point
`lib/orbitSim/yearSteppedDeployment.ts` - `calculateYearDeployment()`

This function:
1. Calculates satellite deployment for a given year
2. Applies physics constraints (thermal, backhaul, maintenance)
3. Calculates economics (cost/compute, OPEX, carbon)
4. Tracks multi-shell capacity and congestion
5. Stores results in debug state

### Key Calculations

**Power Progression**: 150 kW (2025) → 1 MW (2040) per satellite
**Compute Efficiency**: Moore's Law progression (techGrowthPerYear: 1.25)
**Launch Costs**: Decline from ~$200/kg (2025) to ~$20/kg (2040)
**Cost/Compute**: Starts at 1.8× ground, declines with learning rate (10% per year)

### Physics Constraints

1. **Thermal**: Stefan-Boltzmann law, radiator area, emissivity
2. **Backhaul**: Optical terminals, link capacity, ground stations
3. **Maintenance**: Failure rate, servicer drones, replacement cadence
4. **Power/Solar**: Solar efficiency, degradation, battery sizing
5. **Compute/Silicon**: Process node, radiation hardening, memory bandwidth

## State Management

### Zustand Stores
- `simulationStore.ts`: Main simulation state (timeline, config, plans)
- `orbitSimStore.ts`: Orbital simulation state (satellites, routes)
- `simStore.ts`: Legacy simulation state
- `tutorialStore.ts`: Tutorial state

### Debug State
`lib/orbitSim/debugState.ts` - Single source of truth for simulation data
- Stores per-year, per-scenario debug entries
- Used by charts, KPI strip, side panels
- Exported via `DebugExportPanel.tsx`

## Recent Work (Latest Session)

### Fixed Issues
1. **Power Discrepancy**: Fixed `orbital_power_total_gw` to match KPI (235 GW)
2. **OPEX Calculation**: Changed from 5% fleet value to operational costs ($15k/sat/year)
3. **Time Series orbital_power**: Fixed fallback calculation
4. **Side Panel Breakdown**: Now uses debug state shell breakdown
5. **Side Panel Compute**: Added fallback to class counts
6. **Collision Risk**: Fixed 900,000% display bug (clamped to 0-100%)

### Updated Parameters
- **Baseline Scenario**: Updated for 2032 cost crossover
  - `orbitInitialCostMultiple`: 2.2 → 1.8
  - `orbitLearningRate`: 0.08 → 0.10
  - `launchCostDeclinePerYear`: 0.94 → 0.90
  - `techGrowthPerYear`: 1.20 → 1.25

## Important Files

### Core Simulation
- `lib/orbitSim/yearSteppedDeployment.ts` - Main simulation engine
- `lib/orbitSim/scenarioParams.ts` - Scenario parameters
- `lib/orbitSim/debugState.ts` - Debug state management
- `lib/orbitSim/congestionModel.ts` - Congestion and debris modeling
- `lib/orbitSim/batteryModel.ts` - Battery progression curves

### UI Components
- `components/orbitSim/SimpleModeView.tsx` - Main view
- `components/orbitSim/PhysicsSandbox.tsx` - Physics calculator
- `components/orbitSim/GlobalKPIStrip.tsx` - Top KPI bar
- `components/SatelliteCounters.tsx` - Side panel metrics
- `components/orbitSim/SimulationMetrics.tsx` - Metrics panel

### Charts
- `components/orbitSim/CostComputeChart.tsx` - Cost/compute curve
- `components/orbitSim/CarbonRiver.tsx` - Carbon emissions
- `components/orbitSim/PowerComputeFrontier.tsx` - Power vs compute
- `components/orbitSim/ShellUtilizationChart.tsx` - Shell utilization
- `components/orbitSim/DebrisCollisionChart.tsx` - Debris and collision

### Selectors (Data Transformations)
- `lib/orbitSim/selectors/economics.ts` - Cost and OPEX series
- `lib/orbitSim/selectors/carbonStreams.ts` - Carbon series
- `lib/orbitSim/selectors/physics.ts` - Physics series
- `lib/orbitSim/selectors/constraints.ts` - Constraint series

### 3D Visualization
- `three/OrbitalScene.tsx` - Main 3D scene
- `three/SatellitesGPUInstanced.tsx` - Satellite rendering
- `three/OrbitalShells.tsx` - Shell visualization
- `three/OrbitalDataSync.tsx` - Syncs simulation data to 3D

## Data Flow

1. **User Interaction** → Updates `simulationStore` (year plans, scenario)
2. **Simulation Runner** → Calls `calculateYearDeployment()` for each year
3. **Debug State** → Stores results per year, per scenario
4. **Selectors** → Transform debug state to chart data
5. **Components** → Render charts, KPI strip, side panels
6. **3D Globe** → Syncs satellite positions from `orbitSimStore`

## Key Concepts

### Satellite Classes
- **Class A**: Standard satellites, LEO (340-550km)
- **Class B**: Dawn-dusk SSO satellites, LEO_1100 (600-800km)

### Orbital Shells
- **LEO_340**: 340km altitude, 30k capacity
- **LEO_550**: 550km altitude, 80k capacity
- **LEO_1100**: 1100km altitude (SSO), 50k capacity
- **MEO_8000**: 8000km altitude, 40k capacity
- **MEO_20000**: 20000km altitude, 20k capacity
- **GEO**: 35786km altitude, 500 capacity

### Physics Sandbox
- Allows users to override physics parameters
- Parameters stored in `window.__physicsSandboxParams`
- Overrides applied in `yearSteppedDeployment.ts`
- Validates constraints before allowing deployment

## Development Workflow

### Running the App
```bash
cd frontend
npm run dev  # Starts on localhost:3000
```

### Building
```bash
npm run build  # Production build
```

### Common Issues
- **404 errors**: Clear `.next` cache and restart dev server
- **Extension errors**: Ignore Firefox extension errors (not app errors)
- **Type errors**: Run `npm run build` to check TypeScript errors

## Current State

- ✅ All critical bugs fixed
- ✅ Data consistency across KPI, charts, side panels
- ✅ Physics sandbox integrated
- ✅ Baseline scenario updated for 2032 crossover
- ✅ Charts rendering correctly
- ✅ 3D globe working

## Next Steps (If Needed)

1. Scale to 150 GW target (currently ~235 GW)
2. Further OPEX refinement if needed
3. Additional chart improvements
4. Performance optimizations for large satellite counts

## Notes

- Scenario is locked to BASELINE (no user selection)
- Physics sandbox parameters override simulation when applied
- Debug state is single source of truth for all metrics
- Charts use selectors to transform debug state data
- 3D visualization uses representative rendering for performance (>2000 satellites)
