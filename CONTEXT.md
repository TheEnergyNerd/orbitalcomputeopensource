# Orbital Compute Simulator - Context Document

## Project Overview
A Factorio-style orbital compute simulator where players build factories to produce compute pods and launch them to orbit. The simulator compares ground vs. orbital compute across metrics like latency, energy cost, carbon emissions, and resilience.

## Architecture

### Frontend (Next.js + React + TypeScript)
- **Location**: `frontend/`
- **Framework**: Next.js 14+ with App Router
- **State Management**: Zustand stores (`sandboxStore`, `simStore`, `orbitalUnitsStore`)
- **3D Globe**: CesiumJS for rendering Earth, satellites, and orbital paths
- **Styling**: TailwindCSS

### Backend (FastAPI + Python)
- **Location**: `backend/`
- **Framework**: FastAPI
- **Purpose**: Serves simulation state, fetches TLE data from CelesTrak, handles CORS

## Key Components

### UI Structure (Two-Mode System)

#### 1. **SimpleView (Overview Tab)** - Default View
- **File**: `frontend/app/components/SimpleView.tsx`
- **Purpose**: Clean, minimal view for casual users
- **Shows**:
  - Top controls: Orbital Share, Pods/Year, Launches/Year
  - Globe (center)
  - Metrics panel (2x2 grid): Latency, Energy Cost, Carbon, Resilience
  - Deployment summary sentence
  - Link to "Deep dive: industrial / advanced view"

#### 2. **AdvancedView (Advanced Tab)**
- **File**: `frontend/app/components/AdvancedView.tsx`
- **Purpose**: Full factory/industrial UI for power users
- **Shows**:
  - Left sidebar: Factory Systems Panel (power, cooling, workforce, resources, warnings)
  - Center: Factory Flow diagram (FactoryStrip component)
  - Right panel: Node detail panel (when building clicked)
  - Factory Start Guide
  - Pods Ready Indicator

### Core Simulation Engine

#### Factory Production Chain
**File**: `frontend/app/lib/sim/model.ts`

**Resources** (in order):
1. `silicon` - Source (infinite, 50/min)
2. `steel` - Source (infinite, 50/min)
3. `chips` - Produced by Chip Fab
4. `computeUnits` - Produced by Compute Line
5. `pods` - Produced by Pod Factory
6. `launchOpsResource` - Source (infinite, 100/min)
7. `launches` - Produced by Launch Ops → immediately goes to orbit

**Machines**:
- `chipFab`: Silicon → Chips (200 chips/min per line, default: 1 line)
- `computeLine`: Steel + Chips → Compute Units (10 units/min per line, default: 1 line)
- `podFactory`: Chips + Compute Units → Pods (6 pods/min per line = 1 pod per 10 seconds, default: 1 line)
- `launchOps`: Pods + Launch Ops Resource → Launches (0.5 launches/min per line, default: 0 lines)

**Key Settings**:
- Pods accumulate in buffer until `launchOps` consumes them
- Launches immediately increment `podsInOrbit` (no buffer)
- Pod degradation: 3% per year
- Generational upgrades available (increases compute, reduces cost/mass)

#### Simulation Engine
**File**: `frontend/app/lib/sim/engine.ts`

**Function**: `stepSim(state, dtMinutes)`
- Processes all machines (consumes inputs, produces outputs)
- Applies constraints (power, cooling, workforce, footprint)
- Calculates utilization based on limiting factor
- Handles source resources (auto-replenish)
- Applies pod degradation and generational upgrades
- Returns updated state

**Key Logic**:
- Machines consume inputs based on utilization
- Utilization = min(1.0, constraint ratios, input availability)
- Source resources maintain minimum buffer (1000 units)
- Pods are rounded to integers when produced
- Launches are floored to whole numbers before going to orbit

### State Management

#### `sandboxStore` (`frontend/app/store/sandboxStore.ts`)
- Main application state
- Contains: `simState`, factory state, deployment state, mission state
- Actions: `stepSimulation()`, `updateMachineLines()`, `performLaunch()`, etc.

#### `simStore` (`frontend/app/store/simStore.ts`)
- Backend state synchronization
- Polls `/state` endpoint every 2 seconds
- Manages loading/error states

### Key UI Components

#### Factory Components
- **FactoryStrip** (`frontend/app/components/factory/FactoryStrip.tsx`): Horizontal factory flow visualization
- **FactorySystemsPanelV2** (`frontend/app/components/FactorySystemsPanelV2.tsx`): Left sidebar with systems, resources, warnings
- **FactoryNodeDetailPanel** (`frontend/app/components/FactoryNodeDetailPanel.tsx`): Right panel showing selected building details
- **FactoryStartGuide** (`frontend/app/components/FactoryStartGuide.tsx`): Tutorial overlay when no machines running
- **PodsReadyIndicator** (`frontend/app/components/PodsReadyIndicator.tsx`): Banner when pods are ready to launch

#### Globe Components
- **SandboxGlobe** (`frontend/app/components/SandboxGlobe.tsx`): Main Cesium globe renderer
- **useCesiumViewer** (`frontend/app/hooks/useCesiumViewer.ts`): Hook managing single Cesium viewer instance

#### Metrics Components
- **OrbitalAdvantagePanelV2** (`frontend/app/components/OrbitalAdvantagePanelV2.tsx`): 2x2 metrics grid (Latency, Energy Cost, Carbon, Resilience)
- **KpiBar** (`frontend/app/components/KpiBar.tsx`): Compact metrics strip (removed from Overview, still used elsewhere)

### Navigation
- **ModeTabs** (`frontend/app/components/ModeTabs.tsx`): Top-level tabs (Overview, Advanced, Deployment, Orbit, Missions)
- Supports `switchMode` custom event for programmatic tab switching

## Recent Changes & Fixes

### UI Restructure (Latest)
- Split into SimpleView (Overview) and AdvancedView (Advanced)
- Overview shows only: controls, globe, metrics, deployment summary
- Advanced shows full factory UI (flow diagram, sidebars, machine details)
- Fixed pointer events so globe is interactive (overlays use `pointer-events-none`, UI elements use `pointer-events-auto`)

### Factory Production Fixes
- Changed `launchOps` default lines from 1 to 0 (was consuming pods faster than production)
- Increased `podFactory` output from 0.125 pods/min to 6 pods/min (1 pod per 10 seconds)
- Fixed `switchMode` event listener type in ModeTabs

### Globe Disappearing Fix
- Added ResizeObserver and MutationObserver to detect container collapse
- Added `!important` CSS rules to prevent style overrides
- Added viewport size validation (uses screen dimensions if viewport < 400px)

## Key Files Reference

### Core Simulation
- `frontend/app/lib/sim/model.ts` - Data models, machine definitions, initial state
- `frontend/app/lib/sim/engine.ts` - Simulation step logic
- `frontend/app/lib/sim/orbitConfig.ts` - Orbital/ground compute specs and annualized calculations
- `frontend/app/lib/sim/constraints.ts` - Factory constraints (power, cooling, workforce, footprint)

### State Management
- `frontend/app/store/sandboxStore.ts` - Main application state (Zustand)
- `frontend/app/store/simStore.ts` - Backend state sync (Zustand)
- `frontend/app/store/orbitalUnitsStore.ts` - Deployed units state (Zustand)

### Main App
- `frontend/app/page.tsx` - Root component, orchestrates all views
- `frontend/app/components/ModeTabs.tsx` - Top-level navigation
- `frontend/app/components/SimpleView.tsx` - Overview mode
- `frontend/app/components/AdvancedView.tsx` - Advanced/factory mode

### Utilities
- `frontend/app/lib/utils/formatNumber.ts` - Number formatting (sig figs, M/B/T suffixes)
- `frontend/app/hooks/useSimPolling.ts` - Continuous simulation stepping (100ms interval)

## Running the Project

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Runs on `http://localhost:3000`

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
Runs on `http://localhost:8000`

### Quick Start Script
```bash
./start-backend.sh  # Starts backend
# Then in another terminal:
cd frontend && npm run dev
```

## Environment Variables

### Frontend
- `NEXT_PUBLIC_API_BASE` - Backend API URL (default: `http://localhost:8000`)
- `NEXT_PUBLIC_CESIUM_ION_TOKEN` - Cesium Ion access token (for imagery)

### Backend
- CORS origins configured in `backend/main.py`

## Deployment

### Railway (Backend)
- Uses Dockerfile in `backend/`
- Environment: Python 3.11
- Port: 8000

### Vercel (Frontend)
- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `.next`
- Environment: `NEXT_PUBLIC_API_BASE` must be set to Railway URL

## Known Issues / TODOs

1. **Factory Production Balance**: May need tuning of input/output rates as gameplay evolves
2. **Mobile UI**: Some components may need responsive adjustments
3. **Tutorial**: OnboardingTutorial shows every time (user requested), may want to add dismiss option
4. **Performance**: Large numbers of satellites may impact Cesium rendering (safe mode available)

## Key Design Decisions

1. **Two-Mode UI**: Separates casual users (Overview) from power users (Advanced)
2. **Single Source of Truth**: All state in Zustand stores, no duplication
3. **Annualized Metrics**: Removed real-time sun-position logic, uses averages
4. **Factorio-Style**: Production chains, bottlenecks, constraints, build queues
5. **Pointer Events**: Overlays don't block globe interaction, only UI elements are clickable

## Testing Checklist

When making changes, verify:
- [ ] Globe is interactive (can pan/zoom/click)
- [ ] Factory produces pods (check buffer in sidebar)
- [ ] Pods accumulate when launchOps has 0 lines
- [ ] Launches increment podsInOrbit
- [ ] Metrics update correctly (orbital share, latency, cost, carbon)
- [ ] Mode switching works (Overview ↔ Advanced)
- [ ] No console errors
- [ ] Mobile responsive (if UI changes)

## Common Commands

```bash
# Check for lint errors
cd frontend && npm run lint

# Build for production
cd frontend && npm run build

# Check backend logs
cd backend && python -m uvicorn main:app --reload

# Git workflow
git add -A
git commit -m "Description"
git push
```

## File Structure
```
frontend/app/
├── components/          # React components
│   ├── factory/        # Factory-specific components
│   ├── deployment/     # Deployment tab components
│   └── ...
├── lib/
│   ├── sim/           # Simulation engine
│   ├── utils/         # Utilities
│   └── ...
├── store/              # Zustand stores
├── hooks/              # React hooks
└── page.tsx            # Root component

backend/
├── main.py            # FastAPI app
├── requirements.txt   # Python dependencies
└── Dockerfile         # Railway deployment
```
