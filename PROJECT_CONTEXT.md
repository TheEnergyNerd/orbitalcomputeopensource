# Orbital Compute Project - Complete Context Document

## Project Overview

**Orbital Compute** is a comprehensive physics-based economic model and simulation platform that compares orbital (satellite-based) compute infrastructure against ground-based data centers. The project includes:

1. **Physics-Based Cost Model**: Derives costs from fundamental physical properties (mass, power, thermal, radiation)
2. **Economic Trajectory Analysis**: Projects year-by-year cost evolution with learning curves
3. **3D Visualization**: Interactive globe showing satellite deployment and routing
4. **Comparison Simulator**: Side-by-side analysis of orbital vs ground economics

**Primary Goal**: Determine when orbital compute becomes economically competitive with ground-based infrastructure, accounting for launch costs, hardware evolution, ground constraints, and operational factors.

---

## Tech Stack

- **Frontend**: Next.js 14 (React), TypeScript, Tailwind CSS
- **3D Visualization**: Three.js + React Three Fiber
- **State Management**: Zustand (multiple stores)
- **Backend**: Python FastAPI (optional, for some simulations)
- **Deployment**: Vercel (frontend), Railway (backend if used)

---

## Core Architecture

### 1. Physics-Based Cost Model (`frontend/app/lib/model/`)

The model derives costs from first principles:

#### Key Files:
- **`orbitalPhysics.ts`**: Core physics calculations
  - Thermal radiator sizing (Stefan-Boltzmann law)
  - Power system sizing (solar + battery)
  - Chip failure rates and radiation degradation
  - Interconnect costs (NVLink, ISL, ground links)
  - Regulatory costs (de-orbit, debris, insurance, spectrum)

- **`physicsCost.ts`**: Economic integration
  - Combines orbital physics with ground constraints
  - Applies constraint multipliers to ground costs
  - Converts $/PFLOP-year to $/GPU-hour with SLA
  - Handles SMR/Fusion toggles, chip evolution, launch trajectories

- **`trajectory.ts`**: Multi-year projections
  - Generates year-by-year cost trajectories (2025-2050)
  - Applies learning curves (Wright's Law)
  - Sensitivity analysis and scenario generation
  - Market price projections

- **`types.ts`**: Type definitions
  - `YearParams`: Input parameters for a given year
  - `YearlyBreakdown`: Output cost breakdown (orbital vs ground)
  - `FinalModelOutput`: Complete analysis with sensitivity, scenarios, validation

#### Key Concepts:

**Ground Constraints Model**:
- Ground costs have 3 components: Energy, Site/Infrastructure, Hardware
- Energy and Site costs are multiplied by constraint multipliers (grid, cooling, water, land)
- Hardware costs are NOT multiplied (global market pricing)
- Constraint multipliers grow over time (1x → 50x cap, then 3% post-cap growth)
- Base costs are constant 2025 values; constraints handle all growth

**Orbital Cost Components**:
- Hardware (GPUs, chips, ECC overhead)
- Power system (solar arrays, batteries)
- Thermal system (radiators)
- Launch (mass-based, declining over time)
- Operations (scales with failure rate, autonomous ops reduce by 30%)
- Regulatory (de-orbit, debris, traffic management, insurance, spectrum)
- Interconnect (intra-satellite, inter-satellite, ground links)

**Chip Evolution Timeline**:
- Commercial chips improve radiation tolerance over time
- Failure rates decline: 15% (2025) → 5% (2035) → 2% (2045)
- ECC overhead reduces: 15% → 5% → 2%
- Cost multipliers decrease: 2.5x → 1.5x → 1.2x

**Launch Cost Trajectory**:
- Uses piecewise exponential interpolation between waypoints
- Aggressive baseline: $1,500/kg (2025) → $100/kg (2030) → $50/kg (2035) → $20/kg (2040)
- Includes commercial markup, insurance, integration costs

### 2. Simulation Engine (`frontend/app/lib/orbitSim/`)

Year-stepped deployment simulation:

#### Key Files:
- **`yearSteppedDeployment.ts`**: Main simulation loop
  - Calculates year-by-year satellite deployment
  - Applies physics constraints (thermal, backhaul, launch capacity)
  - Tracks fleet growth, retirements, failures
  - Calls `computePhysicsCost` for each year

- **`physicsEngine.ts`**: Physics constraints
  - Thermal derating (radiator utilization > 100%)
  - Backhaul capacity limits
  - Launch mass budgets
  - Satellite lifetime and failure rates

- **`debugState.ts`**: Debug state management
  - Stores per-year, per-scenario debug entries
  - Single source of truth for visualization
  - Includes `physics_cost_per_pflop_year_ground`, `physics_cost_per_pflop_year_orbit`, `physics_cost_per_pflop_year_mix`

- **`satelliteClasses.ts`**: Satellite definitions
  - Class A: LEO, 120kW, 10 PFLOPs baseline
  - Class B: SSO, 130kW, 200 PFLOPs, available 2030+

- **`scenarioParams.ts`**: Scenario configurations
  - Baseline, Bear, Bull cases
  - Different launch costs, efficiency curves, constraint scenarios

### 3. Visualization (`frontend/app/three/` and `frontend/app/components/`)

- **3D Globe**: Three.js-based Earth visualization with satellite rendering
- **Charts**: Recharts for cost trajectories, latency, carbon
- **Metrics Cards**: Real-time KPI display with sparklines

### 4. Comparison Simulator (`frontend/app/compare/page.tsx`)

Main UI for cost model analysis:
- Parameter sliders (launch cost, efficiency, constraints)
- Scenario toggles (Elon, Global Latency, Space Manufacturing, AI Winter, SMR, Fusion)
- Trajectory charts ($/PFLOP-year, $/GPU-hour)
- Sensitivity analysis display
- Market comparison (AWS, Azure, GCP projections)

---

## Recent Critical Fixes (Latest Session)

### 1. Ground Constraint Application Bug (FIXED)
**Problem**: Constraint multipliers were calculated but not multiplied against base costs.

**Solution**: 
- Changed `siteCostBase` from growing independently to constant 2025 value
- Changed `energyCostBase` to constant 2025 value
- Constraint multipliers now multiply constant bases: `constrainedSite = BASE_SITE * constraint * postCap`
- Ground costs now correctly increase from $7k → $160k/PFLOP-year by 2050

**Files**: `frontend/app/lib/model/physicsCost.ts` (function `calculateGroundTotal`)

### 2. Chart Domain Calculation (FIXED)
**Problem**: GPU-hour chart showed orbital and ground starting at same position even when 8x apart.

**Solution**:
- Changed `costMix` to use `physics_cost_per_pflop_year_orbit` instead of `physics_cost_per_pflop_year_mix`
- Improved domain calculation: when ratio > 3x, use centered domain with minimum range (30% of max)
- Prevents small values from being compressed to near-zero

**Files**: `frontend/app/components/orbitSim/SimulationMetrics.tsx`

### 3. Console Log Cleanup (DONE)
- Removed all `[THERMAL HARD CAP]` logs from `physicsEngine.ts`
- Removed all `[FLEET GROWTH DEBUG]` logs from `yearSteppedDeployment.ts`

**Files**: `frontend/app/lib/orbitSim/physicsEngine.ts`, `frontend/app/lib/orbitSim/yearSteppedDeployment.ts`

### 4. Satellite Self-Sufficiency Documentation (ADDED)
- Added documentation explaining satellite advantages:
  - Autonomous relocation (can reposition into optimal orbits)
  - Always "plugged in" (phased arrays, solar panels)
  - No site infrastructure (no land, cooling, water, grid)
  - Reduced maintenance (autonomous operations)

**Files**: `frontend/app/lib/model/orbitalPhysics.ts`

---

## Key Economic Metrics

### Primary Metrics:
- **$/PFLOP-year**: Total annual cost per PFLOP of compute capacity
- **$/GPU-hour**: Market-facing pricing with SLA (99.9% availability, 15min recovery, 25% credit)
- **Crossover Year**: Year when orbital becomes cheaper than ground

### Cost Breakdowns:

**Orbital**:
- Hardware (GPUs, chips, ECC)
- Power (solar, batteries)
- Thermal (radiators)
- Launch (mass-based)
- Operations (scales with failure rate)
- Regulatory (de-orbit, debris, insurance, spectrum)
- Interconnect (NVLink, ISL, ground stations)

**Ground**:
- Energy (electricity, PUE, capacity factor)
- Site/Infrastructure (land, cooling, water, grid connections) - **multiplied by constraints**
- Hardware (GPUs, servers) - **NOT multiplied by constraints**

### Constraint Model:
- **Grid Multiplier**: Grows 8-12% annually (constrained scenario)
- **Cooling Multiplier**: Grows 6-10% annually
- **Water Multiplier**: Grows 4-8% annually
- **Land Multiplier**: Grows 3-6% annually
- **Demand Pressure**: 15% per AI demand doubling (15-month doubling)
- **Cap**: 50x maximum (stressed scenario)
- **Post-Cap Growth**: 3% annually after cap is reached

---

## Important Constants and Assumptions

### Physical Constants:
- **Stefan-Boltzmann**: σ = 5.67e-8 W/(m²·K⁴)
- **LEO Sink Temperature**: 250K (accounts for Earth IR + Albedo)
- **Radiator Temperature**: 343K (70°C typical)
- **Radiator Emissivity**: 0.85-0.90
- **View Factor**: 0.8-1.0 (obstruction from structure)
- **Fouling Derate**: 0.9-1.0 (degradation over time)
- **Engineering Margin**: 1.1-1.2 (20% margin)

### Economic Constants:
- **Ground Hardware Cost 2025**: $5,000/PFLOP-year (amortized)
- **Ground Energy Cost 2025**: $581/PFLOP-year (base, before constraints)
- **Ground Site Cost 2025**: $1,500/PFLOP-year (base, before constraints)
- **Electricity Price 2025**: $120/MWh
- **PUE Ground**: 1.2 (grows 0.01/year)
- **Capacity Factor Ground**: 0.85

### Orbital Constants:
- **Starlink Ops Cost**: 1% of hardware cost annually
- **Autonomous Ops Reduction**: 30% (2028+)
- **Shared Infrastructure Reduction**: 20% (2027+)
- **Inference Workload Reduction**: 20% (failure tolerance)
- **Regulatory Costs**: ~$50-200/PFLOP-year (de-orbit, debris, insurance, spectrum)

### Learning Curves:
- **Launch Cost**: Aggressive decline (Starship timeline)
- **Hardware Efficiency**: 5% annual improvement (ground), 3% (orbital)
- **Hardware Cost**: 10% decline (years 0-3), 5% (years 3-6), 2% (years 6-10), 0.5% (years 10+)

---

## Scenario Toggles

### Strategic Adjustments:
1. **Elon Scenario**: 30% launch discount, 30% power discount, 10% networking discount, 5% operator margin
2. **Global Latency**: 3x ground overprovisioning penalty (2028+)
3. **Space Manufacturing**: 60% mass reduction (2032+, 5-year ramp)
4. **AI Winter**: Slower demand growth, less constraint pressure
5. **SMR Toggle**: Reduces grid constraints, adds SMR capex premium
6. **Fusion Toggle**: Significantly reduces electricity costs, eliminates grid constraints
7. **Power Scaling**: Mass penalty for power systems > 100kW

---

## File Structure Overview

```
orbitalcompute/
├── frontend/
│   ├── app/
│   │   ├── compare/          # Main comparison simulator
│   │   ├── mccalip/          # McCalip baseline analysis
│   │   ├── components/       # React components
│   │   │   └── orbitSim/     # Simulation-specific components
│   │   ├── lib/
│   │   │   ├── model/         # Physics-based cost model
│   │   │   │   ├── orbitalPhysics.ts    # Core physics
│   │   │   │   ├── physicsCost.ts       # Economic integration
│   │   │   │   ├── trajectory.ts        # Multi-year projections
│   │   │   │   └── types.ts             # Type definitions
│   │   │   ├── orbitSim/     # Simulation engine
│   │   │   │   ├── yearSteppedDeployment.ts  # Main loop
│   │   │   │   ├── physicsEngine.ts          # Physics constraints
│   │   │   │   ├── debugState.ts             # Debug state
│   │   │   │   ├── satelliteClasses.ts        # Satellite definitions
│   │   │   │   └── scenarioParams.ts          # Scenarios
│   │   │   └── three/        # 3D visualization
│   │   └── store/            # Zustand stores
│   └── package.json
└── README.md
```

---

## Key Design Decisions

1. **Constant Base Costs**: Ground energy and site costs use constant 2025 bases. All growth comes from constraint multipliers. This ensures constraints actually multiply costs, not just grow independently.

2. **Hardware Not Constrained**: Hardware costs are global market pricing and NOT affected by local ground constraints (grid, cooling, water, land). Only energy and site costs are constrained.

3. **Post-Cap Growth**: After constraint cap (50x) is reached, costs continue growing at 3% annually to model inflation and continued scarcity pressure.

4. **Chip Evolution**: Models improving radiation tolerance in commercial chips over time, reducing failure rates and ECC overhead. This is critical for making orbital compute viable.

5. **Autonomous Operations**: Satellites are more self-sufficient than datacenters (can relocate, always "plugged in", no site infrastructure). This reduces ops costs by 30% from 2028.

6. **Inference Optimization**: Inference workloads tolerate failures better (can retry), reducing ops costs by 20%.

7. **Regulatory Costs**: Includes de-orbit, debris liability, space traffic management, insurance, and spectrum licensing. These are real costs that must be accounted for.

---

## Common Issues and Solutions

### Issue: Chart shows lines starting at same place
**Cause**: Domain calculation compresses values when ratio is large
**Solution**: Use centered domain with minimum range (30% of max) when ratio > 3x

### Issue: Ground costs too low / no crossover
**Cause**: Constraint multipliers not being multiplied against base costs
**Solution**: Ensure base costs are constant 2025 values, multipliers multiply them

### Issue: Console spam with debug logs
**Solution**: All debug logs have been removed from production code

### Issue: GPU-hour pricing incorrect
**Cause**: Using mix cost instead of orbital cost for comparison
**Solution**: Use `physics_cost_per_pflop_year_orbit` for orbital line

---

## Validation and Testing

The model includes validation checks:
- **Cost Accounting**: Sum of breakdown components = total cost (must be 0% error)
- **Trajectory Monotonicity**: Ground costs should increase, orbital should decrease
- **Parameter Ranges**: All parameters within physical/economic bounds
- **Crossover Consistency**: Crossover year consistent across scenarios

---

## Next Steps / Known Issues

1. **Chart Domain**: May need further refinement if values still appear compressed
2. **McCalip Mode**: Should use realistic parameters (constraints enabled, realistic efficiency)
3. **Documentation**: Some assumptions could be better documented in UI
4. **Performance**: Large trajectory calculations may need optimization

---

## Key Contacts / References

- **Model Version**: 4.2.0
- **Primary Cost Metric**: $/PFLOP-year (converted to $/GPU-hour for market comparison)
- **Time Horizon**: 2025-2050
- **Base Year**: 2025 (all base costs and parameters)

---

## Important Notes for New Chat

1. **Ground constraints MUST multiply constant 2025 base costs** - this was a critical bug that was fixed
2. **Hardware costs are NOT constrained** - only energy and site costs are affected by local constraints
3. **Chart domain calculation** uses centered approach with minimum range for large value differences
4. **All console logs have been removed** - no debug logging in production
5. **Orbital cost uses `physics_cost_per_pflop_year_orbit`** - not mix cost
6. **Chip evolution timeline** is critical for making orbital compute viable (reduces failure rates over time)
7. **Autonomous operations** reduce ops costs by 30% (satellites are more self-sufficient than datacenters)

---

This document should provide sufficient context for continuing work on the project. The model is physics-based and publication-ready, with comprehensive validation and sensitivity analysis.


