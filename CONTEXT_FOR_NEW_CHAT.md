# Orbital Compute Simulator - Complete Context Document

## Project Overview

This is a **physics-validated orbital compute simulator** that models the economics, physics, and deployment of large-scale orbital datacenters. The project simulates how orbital compute could compete with ground-based datacenters, with scenarios ranging from conservative (BEAR) to optimistic (BULL) based on Elon Musk/Casey Handmer engineering philosophies.

## Architecture

### Frontend (Next.js 14 + TypeScript)
- **Location**: `frontend/`
- **Framework**: Next.js 14 with App Router
- **Styling**: Tailwind CSS
- **Charts**: D3.js for custom visualizations
- **3D Visualization**: Three.js for orbital visualizations

### Backend (Python FastAPI)
- **Location**: `backend/`
- **Framework**: FastAPI
- **Orbital Mechanics**: Uses SPICE kernels (de421.bsp) for accurate orbital calculations
- **Services**: Celestrak TLE fetching, orbital modeling

## Key Features

### 1. Physics-Validated Simulation
- **Thermal Physics**: Stefan-Boltzmann heat rejection, thermal equilibrium solving
- **Mass Budgeting**: Power-coupled mass model (solar, battery, radiator scale with power)
- **Compute Scaling**: Moore's Law-based compute density growth
- **Battery Economics**: Class A (eclipse batteries) vs Class B (safe mode only)

### 2. Scenario Modeling
Three scenarios with different assumptions:
- **BASELINE**: Conservative assumptions
- **ORBITAL_BEAR**: Pessimistic (slower tech progress, higher costs)
- **ORBITAL_BULL**: Optimistic (Starship-class satellites, aggressive scaling)

### 3. Chart Visualizations
Multiple chart types across different views:
- **Futures Tab**: Cost/compute, OPEX, carbon, adoption share, fleet growth, cost crossover, compute efficiency
- **Physics Tab**: Power-compute frontier, mass breakdown, radiator area vs compute, thermal balance
- **Constraints Tab**: Utilization gauges, failure/recovery timelines

## Recent Major Changes (December 2024)

### Physics & Scale Overhaul
Applied 4 critical fixes to align with Elon Musk/Casey Handmer engineering thesis:

1. **Fixed Aggregation Math (10x Bug)**
   - `power_total_kw = satellitesTotal * bus_power_kw` (simple multiplication)
   - Carbon intensity: `(total_carbon_kg * 1000) / (orbitEnergyServedTwh * 1e9)`

2. **Scaled Up to Starship Class**
   - ORBITAL_BULL: `basePowerPerSatKw = 50.0 kW` (scaling to 100kW+)
   - Mass scales automatically with power through physics bus design

3. **Linked Compute to Moore's Law**
   - `baseComputeTflopsPerSat = 500.0 TFLOPS` (starting 2025)
   - Growth: 1.5x/year (BULL), 1.4x/year (BEAR), 1.45x/year (BASELINE)
   - Hard-linked: `compute_raw_flops = satellitesTotal * bus_compute_tflops_nominal * 1e12`

4. **Enforced Battery Economics**
   - Class A (Standard LEO): `battery_kwh = bus_power_kw * 0.6` (35 min eclipse)
   - Class B (Dawn-Dusk SSO): `battery_kwh = bus_power_kw * 0.1` (safe mode only)
   - Cost: `battery_kwh * 1000` ($1k/kWh)
   - Mass: `battery_kwh / 0.2` (200Wh/kg)

### New Futures Tab Charts
Added 3 new charts to the Futures (Scenarios) tab:
1. **Fleet Growth (Stacked Area)**: Shows constellation buildout by orbital shell (LOW, MID, SSO)
2. **Orbit vs Ground Cost Crossover**: Highlights when orbit becomes cheaper than ground
3. **Compute Efficiency Trajectory**: Bar chart showing PFLOPS/kW with Moore's Law reference

## File Structure

### Core Simulation Logic
- `frontend/app/lib/orbitSim/yearSteppedDeployment.ts`: Main year-by-year simulation orchestration
- `frontend/app/lib/orbitSim/physicsEngine.ts`: Physics state machine and thermal calculations
- `frontend/app/lib/orbitSim/physics/designBus.ts`: Satellite bus design from first principles
- `frontend/app/lib/orbitSim/debugState.ts`: Centralized debug state storage

### Chart Components
- `frontend/app/components/orbitSim/ScenariosView.tsx`: Futures tab with scenario comparisons
- `frontend/app/components/orbitSim/MultiScenarioChart.tsx`: Generic multi-scenario line chart
- `frontend/app/components/orbitSim/FleetGrowthChart.tsx`: Stacked area chart for fleet growth
- `frontend/app/components/orbitSim/CostCrossoverChart.tsx`: Cost crossover with annotations
- `frontend/app/components/orbitSim/ComputeEfficiencyChart.tsx`: Efficiency bars with Moore's Law

### Data Selectors
- `frontend/app/lib/orbitSim/selectors/scenarios.ts`: Scenario data aggregation
- `frontend/app/lib/orbitSim/selectors/physics.ts`: Physics data for charts
- `frontend/app/lib/orbitSim/selectors/frontier.ts`: Power-compute frontier data

## Key Data Structures

### DebugStateEntry
Central data structure for all simulation outputs:
```typescript
interface DebugStateEntry {
  year: number;
  satellitesTotal: number;
  power_total_kw: number;
  compute_raw_flops: number; // FLOPS
  compute_effective_flops: number; // FLOPS
  compute_exportable_PFLOPs: number;
  cost_per_compute_orbit: number; // $/PFLOP
  cost_per_compute_ground: number; // $/PFLOP
  carbon_orbit: number; // g CO2/kWh
  carbon_ground: number; // g CO2/kWh
  shellOccupancy: { LOW: number; MID: number; SSO: number };
  temp_radiator_C: number;
  temp_core_C: number;
  heatGen_kw: number;
  heatReject_kw: number;
  radiatorArea: number; // m²
  // ... many more fields
}
```

### Scenario Parameters
```typescript
interface ScenarioParams {
  orbitInitialCostMultiple: number;
  orbitLearningRate: number;
  computePerKwGrowth: number;
  powerGrowthPerYear: number;
  techGrowthPerYear: number;
  launchCostDeclinePerYear: number;
  // ...
}
```

## Chart Data Ranges

For determining axis scales, use `listChartDataRanges.ts`:
- **Compute Over Time Class A/B**: PFLOPs (typically 0 to millions)
- **Power vs Compute Class A/B**: Power in kW, Compute in PFLOPs
- **Radiator Area vs Compute**: Area in m², Compute in PFLOPs
- **Power Compute Frontier**: Power in MW, Compute in PFLOPs

## Build & Development

### Frontend
```bash
cd frontend
npm install
npm run dev  # Development server
npm run build  # Production build
```

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

## Known Issues & Notes

1. **Removed Export Buttons**: The "Download All Charts", "Print to PDF", and "Save Charts as PNGs" buttons have been removed from ScenariosView.tsx as requested.

2. **Type Safety**: Fixed type error in DetailPanel.tsx where `activeSurface` was compared to "deployment" (now uses "world").

3. **Chart Responsiveness**: Charts are responsive with 300px height on mobile, 600px on desktop for Futures tab.

4. **Data Validation**: The simulation includes physics validation checks (temperature gradients, heat balance, compute efficiency sanity checks).

## Key Constants & Formulas

### Thermal Physics
- Stefan-Boltzmann constant: `σ = 5.67e-8 W/m²K⁴`
- Emissivity: `ε = 0.9`
- Radiator capacity: `Q = A × ε × σ × (T_rad⁴ - T_space⁴)`

### Mass Budget
- Solar: `M_solar = P_kW × 5 kg/kW` (Elon/Handmer optimistic: 200 W/kg)
- Battery: `M_battery = kWh / 0.2` (200 Wh/kg)
- Radiator: `M_radiator = A_m² × 5 kg/m²`

### Compute Scaling
- Base compute (2025): `500 TFLOPS/satellite`
- Moore's Law growth: `1.4x - 1.5x per year`
- Hard link: `compute_raw_flops = satellitesTotal × bus_compute_tflops_nominal × 1e12`

## Next Steps for New Chat

1. **Chart Axis Scaling**: Use `listChartDataRanges.ts` to determine appropriate scales for the 4 charts mentioned
2. **Scenario Selector**: Consider adding scenario selector to new Futures charts (currently shows BASELINE only)
3. **Performance**: Monitor build times and optimize if needed
4. **Testing**: Add unit tests for physics calculations and data selectors

## Important Files to Review

- `frontend/app/lib/orbitSim/yearSteppedDeployment.ts`: Core simulation logic
- `frontend/app/lib/orbitSim/physics/designBus.ts`: Satellite bus design
- `frontend/app/components/orbitSim/ScenariosView.tsx`: Futures tab UI
- `frontend/app/lib/orbitSim/debugState.ts`: Data storage structure
- `frontend/app/lib/orbitSim/selectors/scenarios.ts`: Data selectors for charts

## Contact Points

- Physics model: `yearSteppedDeployment.ts` and `physicsEngine.ts`
- Chart rendering: Components in `frontend/app/components/orbitSim/`
- Data access: Selectors in `frontend/app/lib/orbitSim/selectors/`
