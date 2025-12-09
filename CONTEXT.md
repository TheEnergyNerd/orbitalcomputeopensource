# Orbital Compute Simulation - Context Document

## Project Overview
A 3D web-based simulation of orbital compute infrastructure deployment, visualizing satellite constellations, routing, and strategy-based growth over time. The application uses Three.js for 3D rendering and Next.js for the frontend framework.

## Tech Stack
- **Frontend Framework**: Next.js 14 (React)
- **3D Rendering**: Three.js + React Three Fiber
- **State Management**: Zustand (multiple stores)
- **Styling**: Tailwind CSS
- **Deployment**: 
  - Frontend: Vercel
  - Backend: Railway (web-production-e6f81.up.railway.app)

## Key Features

### 1. Dual-Class Satellite System
- **Class A (Starlink-compute)**: LEO shells, baseline compute satellites
  - Power: 120 kW
  - Compute: 10 PFLOPs (baseline, grows with tech curve)
  - Lifetime: 6 years
  - Mass: 1.2 tons
- **Class B (Casey SSO slicer)**: Sun-synchronous orbit, inference-focused
  - Power: 130 kW
  - Compute: 200 PFLOPs (much higher density)
  - Lifetime: 7 years
  - Mass: 2.0 tons
  - Available from 2030 onward
  - Always sun-facing orientation

### 2. Strategy-Based Growth
Four strategy modes affect deployment:
- **COST**: Growth multiplier 1.30, favors mid-LEO, 50% Class B share
- **LATENCY**: Growth multiplier 1.10, favors low LEO, 25% Class B share
- **CARBON**: Growth multiplier 1.05, favors sun-sync, 70% Class B share
- **BALANCED**: Growth multiplier 1.18, mixed allocation, 50% Class B share

Annual launch capacity: `L(t) = min(60 * t, 1200)` satellites/year

### 3. Year-Stepped Simulation
- Simulation progresses year by year
- Strategy changes only affect future growth (no history rewriting)
- Tech curves for compute and power improve over time
- Satellite retirement based on lifetime

### 4. 3D Globe Visualization
- Three.js-based globe with Earth texture
- Satellite rendering:
  - If total ≤ 4000: render all satellites
  - If > 4000: density sprites (one sprite = 25-50 satellites)
- Streaming spawn animation for new satellites
- Class A: Small teal circles with subtle halo
- Class B: Larger pill/diamond shapes, bright white/neon blue, strong sun-facing glow

### 5. Routing System
- Dynamic route generation based on satellite count
- Mix of orbit-to-orbit and ground-to-orbit routes
- Routes originate from American data centers
- Visual encoding:
  - Width: based on traffic load
  - Color: green (low load), yellow (medium), red (high), purple (rerouted)
  - Speed: varies with latency
- Routes only show to rendered satellites

### 6. UI Components
- **SatelliteCounters**: Bottom-right panel showing total satellites, power, compute, routes
- **DebugExportPanel**: Only visible on `/data` route, exports CSV/JSON
- **KPI Cards**: Cost, Carbon, Latency metrics with crossover detection
- **Strategy Deck**: Strategy selection and factory management
- **Detail Panel**: Shows selected entity (satellite, launch site, data center) details

## Key Files & Structure

### State Management (Zustand Stores)
- `frontend/app/store/simStore.ts`: Core simulation state (satellites, routes, metrics)
- `frontend/app/store/simulationStore.ts`: Year-by-year timeline, strategy, deployment
- `frontend/app/store/orbitalUnitsStore.ts`: Orbital unit deployment queue
- `frontend/app/state/orbitStore.ts`: Three.js visualization state (satellites, routes)

### 3D Rendering
- `frontend/app/three/OrbitalScene.tsx`: Main Three.js scene setup
- `frontend/app/three/SatellitesOptimized.tsx`: Satellite rendering with performance optimization
- `frontend/app/three/RoutingArrows.tsx`: Animated routing arrows
- `frontend/app/three/TrafficFlows.tsx`: Route visualization
- `frontend/app/three/OrbitalDataSync.tsx`: Syncs simulation state to Three.js

### Core Logic
- `frontend/app/lib/orbitSim/satellitePositioning.ts`: Satellite position generation (physically coherent)
- `frontend/app/lib/orbitSim/orbitalMechanics.ts`: Orbital state calculations
- `frontend/app/lib/orbitSim/shellAssignment.ts`: Assigns satellites to orbital shells
- `frontend/app/lib/orbitSim/strategyDeployment.ts`: Strategy-aware deployment calculations
- `frontend/app/lib/orbitSim/orbitShells.ts`: Shell definitions (VLEO, MID-LEO, SSO, MEO, GEO)

### Components
- `frontend/app/page.tsx`: Main application page
- `frontend/app/components/SatelliteCounters.tsx`: Bottom-right metrics panel
- `frontend/app/components/DebugExportPanel.tsx`: Data export (only on `/data` route)
- `frontend/app/components/orbitSim/SimpleModeView.tsx`: Main overview view
- `frontend/app/components/orbitSim/KpiCard.tsx`: Metric cards with charts

## Recent Changes

### Removed Dependencies
- **Cesium**: Removed entirely (was causing build issues, not used)
- **react-globe.gl**: Removed (not installed, not used)

### Fixed Issues
- All TypeScript errors resolved
- Build compiles successfully on Vercel
- Coordinate system fixed (markers align with Earth texture)
- Satellite persistence fixed (no longer disappearing after deployment)
- Routing only shows to rendered satellites
- Map iteration issues fixed (using `Array.from()`)

### UI Adjustments
- SatelliteCounters moved to bottom-right
- DebugExportPanel only shows on `/data` route
- Satellite rendering optimized (2% sampling when > 4000 total)
- Launch sites limited to American locations (Florida, California, Texas)
- Data centers and launch sites are clickable

## Coordinate System

### For Static Markers (Launch Sites, Data Centers)
Uses texture-aligned conversion in `coordinateUtils.ts`:
- Aligns with `webgl-earth` texture
- Markers appear in correct geographic locations

### For Satellites
Uses physically coherent positioning in `satellitePositioning.ts`:
- Proper orbital mechanics
- Latitude distribution: `asin(uniform(-sin(maxInc), sin(maxInc)))` to avoid pole clustering
- Longitude: uniform -180° to 180°
- Altitude-based shell assignment

## Deployment

### Frontend (Vercel)
- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Install command: `npm ci`
- Environment variables: (check `vercel.json` or Vercel dashboard)

### Backend (Railway)
- URL: `web-production-e6f81.up.railway.app`
- CORS configured for frontend

## Important Constants

### Satellite Specifications
```typescript
// Class A
SAT_A_POWER_KW = 120
SAT_A_COMPUTE_PFLOPS_0 = 10
SAT_A_LIFETIME_Y = 6
SAT_A_MASS_T = 1.2

// Class B
SAT_B_POWER_KW_0 = 130
SAT_B_COMPUTE_PFLOPS_0 = 200
SAT_B_LIFETIME_Y = 7
SAT_B_MASS_T = 2.0
SAT_B_AVAILABLE_FROM = 2030
```

### Tech Curves
```typescript
// Class A
computePerA(t) = 10 * (1 + 0.18 * dtA)
powerPerA(t) = 120 * (1 + 0.04 * dtA)

// Class B
computePerB(t) = 200 * (1 + 0.14 * dtB)
powerPerB(t) = 130 * (1 + 0.03 * dtB)
```

### Launch Capacity
```typescript
L(t) = min(60 * t, 1200) // satellites/year
```

## Known Issues / TODOs

1. **Class B Visualization**: SSO ring visualization could be enhanced
2. **Strategy Phase Diagram**: Not yet implemented (from user spec)
3. **Power → Compute Frontier Chart**: Not yet implemented (from user spec)
4. **Dual-Class Stack Chart**: Not yet implemented (from user spec)
5. **Global KPI Strip**: Not yet implemented (from user spec)

## File Locations for Common Tasks

- **Change satellite appearance**: `frontend/app/three/SatellitesOptimized.tsx`
- **Modify routing logic**: `frontend/app/three/RoutingArrows.tsx`, `frontend/app/three/TrafficFlows.tsx`
- **Update strategy effects**: `frontend/app/lib/orbitSim/strategyDeployment.ts`
- **Change satellite positioning**: `frontend/app/lib/orbitSim/satellitePositioning.ts`
- **Modify UI layout**: `frontend/app/page.tsx`, `frontend/app/components/orbitSim/SimpleModeView.tsx`
- **Export data format**: `frontend/app/components/DebugExportPanel.tsx`

## Environment Variables

Check Vercel dashboard and Railway dashboard for:
- Backend API URL
- Any API keys
- CORS settings

## Git Status
- Main branch: `main`
- Recent commits: All TypeScript errors fixed, build passing
- Last major change: Removed Cesium, fixed all build errors, moved UI components

## Next Steps (From User Spec)

The user requested these features but they're not yet implemented:
1. Dual-Class Satellite Stack Chart (stacked area chart)
2. Power → Compute Frontier (animated scatter)
3. Strategy Phase Diagram (timeline with micro-graphs)
4. Global KPI Strip (top HUD with 5 metrics)

These should be added to the overview/deployment views.
