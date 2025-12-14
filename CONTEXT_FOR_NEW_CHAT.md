# Context for New Chat Session

## Project Overview
**Orbital Compute Simulation** - A Next.js/React application that simulates orbital computing infrastructure, including satellite deployment, physics constraints, economics, and visualization.

## Recent Changes (Latest Session)
1. **Visual Guide Updates:**
   - Removed 8 entries: Compute Nodes, Why Compute Nodes Over Pacific, Class B Breathing Glow, Solar Availability Chart, SSO Energy Beams, Ground Solar Glows, Shell Stability, Threshold Alerts
   - Replaced "Route Thickness" with "Number of Route Lines" explaining squares as intermediate relay points
   - Restricted Visual Guide to only appear in **world view** (removed from system overview)
   - Improved button visibility with cyan border and z-index 100

2. **Visual Guide Location:**
   - Component: `frontend/app/components/VisualGlossary.tsx`
   - Only renders when `activeSurface === "world"`
   - Button positioned at `top-[180px] right-6` with `z-[100]`
   - Includes debug logging for troubleshooting

## Key Files & Structure

### Core Simulation
- **`frontend/app/lib/orbitSim/yearSteppedDeployment.ts`** - Main simulation engine, calculates year-by-year deployment
- **`frontend/app/lib/orbitSim/scenarioParams.ts`** - Scenario parameters (Baseline, Bear, Bull)
- **`frontend/app/lib/orbitSim/satelliteClasses.ts`** - Satellite class definitions (Class A, Class B)
- **`frontend/app/lib/orbitSim/debugState.ts`** - Debug state management with `perScenario` structure
- **`frontend/app/store/simulationStore.ts`** - Zustand store for simulation timeline

### Visualization
- **`frontend/app/three/OrbitalScene.tsx`** - Main 3D scene component
- **`frontend/app/three/SatellitesGPUInstanced.tsx`** - GPU-instanced satellite rendering
- **`frontend/app/three/GroundSites.tsx`** - Ground site visualization (blue = data centers, orange = launch sites)
- **`frontend/app/three/StaticOrbitalShells.tsx`** - Orbital shell rings visualization
- **`frontend/app/components/VisualGlossary.tsx`** - Visual guide component (world view only)

### UI Components
- **`frontend/app/page.tsx`** - Main page with surface tabs and routing
- **`frontend/app/components/SurfaceTabs.tsx`** - Navigation tabs (Overview, World, Futures, etc.)
- **`frontend/app/components/SatelliteCounters.tsx`** - Side panel with satellite metrics
- **`frontend/app/components/orbitSim/GlobalKPIStrip.tsx`** - Top KPI strip

## Current State

### Visual Guide Content (Active Entries)
1. Shapes: Circles vs Squares
2. Ground Site Colors
3. Class A Satellites
4. Class B Satellites
5. Number of Route Lines (replaced Route Thickness)
6. Route Jitter
7. Routing Particles
8. Route Colors
9. Bidirectional Routes
10. Orbital Shells
11. Annual Deployment Pulse
12. Carbon World Tint
13. Strategy Visual Cues

### Removed Entries
- Compute Nodes
- Why Compute Nodes Over Pacific
- Class B Breathing Glow
- Solar Availability Chart
- SSO Energy Beams
- Ground Solar Glows
- Shell Stability
- Threshold Alerts

## Technical Stack
- **Framework:** Next.js 14.0.4 (App Router)
- **3D Rendering:** Three.js with @react-three/fiber
- **State Management:** Zustand
- **Charts:** D3.js
- **Language:** TypeScript

## Key Patterns

### Surface Types
- `"overview"` - System overview with charts
- `"world"` - 3D globe visualization (Visual Guide appears here)
- `"futures"` - Scenarios view
- `"constraints"` - Constraints & Risk view
- `"physics"` - Physics & Engineering view
- `"calculator"` - Physics Sandbox

### Satellite Classes
- **Class A:** Teal spheres, LEO orbits, low-latency networking & compute
- **Class B:** White diamonds, SSO orbits (800-1000km), high-power inference compute, always sun-facing

### Ground Sites
- **Blue spheres:** Data centers (compute facilities)
- **Orange spheres:** Launch sites (rocket facilities)

### Route Visualization
- Lines represent routes between satellites/ground stations
- Square nodes appear along routes as intermediate relay points
- More routes = more lines visible

## Important Notes

1. **Visual Guide Visibility:**
   - Only appears in **world view** (`activeSurface === "world"`)
   - Button at `top-[180px] right-6` with `z-[100]`
   - Has debug logging: `[VisualGlossary] Component rendered...`

2. **Debug State Structure:**
   - Uses `perScenario` structure: `debugState.perScenario[scenarioKey][year]`
   - Some components convert back to flat structure for compatibility

3. **Build Status:**
   - Builds successfully with Next.js
   - No linter errors
   - Minor warning: `[CeilingStackChart] No entry for year NaN` (non-critical)

4. **Recent Git Commits:**
   - Latest: `57fa3b4` - "Update Visual Guide: remove entries and restrict to world view only"
   - Branch: `main`

## Common Issues & Solutions

1. **Visual Guide not showing:**
   - Check `activeSurface === "world"`
   - Check console for `[VisualGlossary]` logs
   - Verify z-index is high enough (`z-[100]`)

2. **Hydration errors:**
   - Components use `mounted` state to prevent SSR/client mismatches
   - See `SatelliteCounters.tsx` and `GlobalKPIStrip.tsx` for examples

3. **Build errors:**
   - Clear `.next` cache if chunk loading errors occur
   - Check for `require()` vs `import` mismatches

## Next Steps / Potential Improvements
- Visual Guide could be enhanced with more interactive examples
- Could add tooltips or hover explanations
- May want to add keyboard shortcuts for opening/closing guide
- Consider adding search/filter functionality for glossary items
