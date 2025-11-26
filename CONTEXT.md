# Orbital Compute Simulator - Context Document

## Project Overview
This is an interactive web application that simulates orbital compute infrastructure, allowing users to deploy satellites and orbital compute units to shift compute workloads from ground data centers to space. The application demonstrates the benefits of orbital compute including reduced latency, lower carbon emissions, and improved resilience.

## Tech Stack
- **Frontend**: Next.js 14+ (React), TypeScript, Tailwind CSS
- **3D Globe**: CesiumJS for 3D globe visualization
- **State Management**: Zustand stores
- **Backend**: FastAPI (Python) with Skyfield for orbital mechanics
- **Satellite Data**: CelesTrak TLE data for real Starlink satellites

## Key Features

### 1. Sandbox Mode
- **Freeplay**: Users can deploy orbital units freely
- **Missions**: Guided missions with objectives and constraints
- **Tutorial**: 4-step interactive tutorial (recently reduced from 5 steps)

### 2. Orbital Unit Types
- **LEO Pod**: Starlink Cluster Compute Pod
  - Power: 0.15 MW per pod
  - Each pod represents ~50 satellites
  - Rendered as 50 clickable green satellite entities on the globe
  - Cost: $50M
  - Build time: 6 months (displayed), 5 seconds (actual)
  
- **GEO Hub**: GEO Compute Hub
  - Power: 1.0 MW per hub
  - Rendered as 1 purple satellite at GEO altitude (~35,786 km)
  - Cost: $200M
  - Build time: 1 year (displayed), 5 seconds (actual)
  
- **Server Farm**: In-Space Server Farm
  - Power: 5.0 MW per farm
  - Rendered as 1 orange satellite at GEO altitude
  - Cost: $500M
  - Build time: 2 years (displayed), 5 seconds (actual)

### 3. Deployment System
- Units are queued and built in parallel (logarithmic scaling for build time)
- All deployed orbital compute is automatically used at full capacity
- Orbit share is calculated automatically: `(deployed orbital capacity) / (deployed orbital + remaining ground capacity)`
- No manual slider - orbit share is read-only and based on deployments

### 4. Ground Infrastructure
- Baseline: 42 GW (42,000 MW) global data center capacity
- Ground DCs can be reduced via slider (missions mode only)
- Ground sites are rendered as green points on the globe

### 5. Metrics & Visualizations
- **Latency**: Decreases as orbit share increases (global coverage)
- **Energy Cost**: Lower for orbital (solar power) vs ground (grid)
- **Carbon**: Significantly lower for orbital (includes launch carbon)
- **Cooling**: Only applies to ground DCs (40% of energy cost)

### 6. Presets
- **All Earth**: 0% orbit share, all ground
- **Hybrid**: ~3% orbit share (200 server farms + 200 GEO hubs + 500 LEO pods = 1.275 GW)
- **Orbit-Dominant**: Higher orbit share
- **100% Orbit**: Maximum orbital deployment

## Recent Changes

### Performance Optimizations
- Reduced hybrid preset deployment from 7800 LEO pods to 500 pods for tutorial performance
- Each LEO pod creates 50 satellite entities (500 pods = 25,000 entities vs 390,000 before)
- Server farms and GEO hubs now render as single satellite entities (not 50 each)

### Tutorial Updates
- Removed "Orbit Share Slider" step (was step 3)
- Now 4 steps:
  1. Baseline: Ground-only
  2. Hybrid deployment: Click Hybrid preset
  3. Surge Event demo
  4. Presets + Reset

### Orbit Share Calculation
- **Removed**: Interactive slider for orbit share
- **Added**: Read-only display showing current orbit share
- Orbit share is automatically calculated from deployed units
- All deployed orbital compute is used at full capacity

## File Structure

### Key Frontend Files
- `app/page.tsx`: Main entry point, renders SandboxGlobe
- `app/components/SandboxGlobe.tsx`: Cesium globe for sandbox mode
- `app/components/SandboxControls.tsx`: Deployment controls, presets
- `app/components/SandboxTutorial.tsx`: Tutorial overlay and step management
- `app/components/SandboxMetrics.tsx`: Metrics display (latency, energy, carbon, cooling)
- `app/components/DetailPanel.tsx`: Shows details when clicking satellites/ground sites
- `app/components/BuildPanel.tsx`: UI for deploying orbital units
- `app/components/DeploymentQueue.tsx`: Shows building/queued units

### State Management
- `app/store/sandboxStore.ts`: Sandbox state (orbit share, ground DC reduction, tutorial progress)
- `app/store/orbitalUnitsStore.ts`: Deployment queue and unit management
- `app/store/simStore.ts`: Backend simulation state (satellites, ground sites)

### Backend
- `backend/main.py`: FastAPI server, satellite propagation, state management
- Uses Skyfield for orbital mechanics
- Fetches TLE data from CelesTrak (with caching)
- Calculates sunlit status for satellites

## Known Issues & Performance

### Performance Issues
- Tutorial can be slow when deploying many units (especially LEO pods)
- Each LEO pod creates 50 satellite entities (rendering overhead)
- Solution: Reduced hybrid preset to 500 LEO pods for tutorial

### Rendering
- **LEO Pods**: 50 green satellites per pod
- **Server Farms**: 1 orange satellite at GEO altitude
- **GEO Hubs**: 1 purple satellite at GEO altitude
- **Ground Sites**: Green points on the globe
- **Backend Satellites**: Gold (sunlit) or gray (in shadow)

## Current State

### Working
- ✅ Sandbox mode with freeplay and missions
- ✅ Deployment system with queue
- ✅ Orbit share auto-calculation
- ✅ Tutorial (4 steps)
- ✅ Presets (All Earth, Hybrid, Orbit-Dominant, 100% Orbit)
- ✅ Clickable satellites showing unit details
- ✅ Metrics calculation and display

### Needs Attention
- ⚠️ Tutorial performance (can be slow with many deployments)
- ⚠️ Server farms and GEO hubs rendering (recently added, may need testing)
- ⚠️ Mission system (5 missions defined, may need integration work)

### Recent Fixes (Latest Session)
- ✅ Fixed camera reset issue: Camera now only sets initial view once on mount, not on every render
- ✅ Fixed deployment visibility: Entity cleanup now preserves deployed unit satellites (deployed_pod_, deployed_server_farm_, deployed_geo_hub_)
- ✅ Added debug logging for deployment rendering to help diagnose visibility issues

## Next Steps / TODO
1. Verify deployment visibility is working correctly (check console logs)
2. Test camera behavior - ensure it doesn't reset when scrolling
3. Optimize tutorial performance further (maybe reduce LEO pods even more or batch rendering)
4. Ensure missions are properly integrated and working
5. Consider adding visual distinction between unit types on globe
6. Add more missions or refine existing ones

## Known Bugs (Being Fixed)
- Camera sometimes resets to initial view when scrolling (fixed with cameraInitializedRef flag)
- Deployed satellites not always visible (fixed with entity cleanup preservation)

## Important Constants
- `BASE_GROUND_CAPACITY_GW = 42` (42,000 MW)
- LEO pod power: 0.15 MW
- GEO hub power: 1.0 MW
- Server farm power: 5.0 MW
- Satellites per LEO pod: 50
- Build time (actual): 5 seconds for all units
- Build time (displayed): 6 months (LEO), 1 year (GEO), 2 years (Server Farm)

## API Endpoints
- `GET /api/state`: Get current simulation state (satellites, ground sites, metrics)
- `GET /api/tle`: Get TLE data for satellites

## Environment Variables
- `NEXT_PUBLIC_CESIUM_ION_TOKEN`: Cesium Ion access token for globe imagery
- Backend runs on port 8000 (default)

