# Animation and Cone Charts Implementation Context

## Current State

### 5-Tab Layout
The application uses a 5-tab navigation system:

1. **OVERVIEW** - Executive summary with key metrics
   - Cost/Compute Curve
   - Latency Curve
   - Annual OPEX (Streamgraph)
   - Carbon Curve (River visualization)
   - Power → Compute Frontier
   - Adoption Share Over Time

2. **WORLD VIEW** - Global utilization map and fleet visualization

3. **FUTURES (SCENARIOS)** - Scenario comparisons
   - Currently shows: MultiScenarioChart for Cost, OPEX, Carbon, Adoption
   - 3D Futures Scene (Futures3DScene component)
   - 2D Particle charts (FuturesConeVisualization)

4. **CONSTRAINTS & RISK** - System limitations
   - Constraint Utilization Over Time
   - Headroom to Limits
   - Fleet Survival / Reliability
   - Launch Mass vs Ceiling

5. **PHYSICS & LIMITS** - Physical constraints
   - Power → Compute Frontier
   - Mass Breakdown per Satellite
   - Radiator Area vs Compute
   - Temperatures and Heat Ceiling
   - Solar Uptime / Irradiance
   - Constraint Dial
   - Power vs Compute Scatter
   - Dual Class Stack Chart

### Current Chart Implementation
- **D3.js** for most charts (PowerComputeFrontier, OpexStreamgraph, CarbonRiver, etc.)
- **Recharts** available but not extensively used
- Charts are responsive with standardized sizing: `h-[300px] sm:h-[350px]`
- All charts have hover tooltips
- Scenario switching works but transitions are instant (no animation)

### Scenario System
- Three scenarios: `BASELINE`, `ORBITAL_BEAR`, `ORBITAL_BULL`
- Scenario data stored in `debugState.ts` with structure: `perScenario: Record<ScenarioKey, Record<number, DebugStateEntry>>`
- Scenario selector in mobile menu
- Charts read from selected scenario via `getDebugStateEntries(scenarioKey)`

## Required Implementations

### 1. Smooth Scenario Transitions

**Goal:** When switching between Baseline → Bear → Bull, lines should morph smoothly instead of snapping.

**Implementation:**
- Use Recharts `Line` component with animation:
  ```tsx
  <Line
    isAnimationActive={true}
    animationDuration={400}
    animationEasing="easeOutQuad"
  />
  ```
- For D3 charts, implement D3 transitions:
  ```typescript
  .transition()
  .duration(400)
  .ease(d3.easeQuadOut)
  ```
- Apply to: MultiScenarioChart, CostComputeChart, LatencyChart, OpexStreamgraph, CarbonRiver

**Files to modify:**
- `frontend/app/components/orbitSim/MultiScenarioChart.tsx`
- `frontend/app/components/orbitSim/CostComputeChart.tsx`
- `frontend/app/components/orbitSim/LatencyChart.tsx`
- `frontend/app/components/orbitSim/OpexStreamgraph.tsx`
- `frontend/app/components/orbitSim/CarbonRiver.tsx`

### 2. Year Scrub Animation

**Goal:** When `selectedYear` changes (slider drag/click), vertical reference line and active dots should transition smoothly (200-300ms).

**Implementation:**
- Add transition to vertical reference line in all charts
- Update active dot positions with D3 transition
- Use `currentYear` prop that changes, trigger transition on prop change

**Files to modify:**
- All chart components that use `currentYear` prop
- Add `useEffect` to watch `currentYear` changes and trigger transitions

### 3. Crossover Highlight Pulse

**Goal:** On cost chart, when `cost_mix` first goes below `cost_ground`, show a pulsing dot that pulses 2-3 times then stops.

**Implementation:**
- Detect crossover point: `cost_mix < cost_ground` for first time
- Add CSS animation:
  ```css
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.5); opacity: 0.7; }
  }
  ```
- Trigger one-shot animation when crossover detected
- Place dot at crossover point (year, cost value)

**Files to modify:**
- `frontend/app/components/orbitSim/CostComputeChart.tsx`
- Add crossover detection logic in `KpiCard.tsx` or CostComputeChart

### 4. World Map "Breathing"

**Goal:** Very light opacity pulsing in map's "green" zones, tied to carbon savings growth.

**Implementation:**
- Modulate opacity: `opacity = baseOpacity + sin(time) * f(carbonAvoided) * 0.1`
- Keep amplitude tiny (0.05-0.1)
- Update in animation loop tied to `carbonAvoided` value

**Files to modify:**
- World View component (likely in globe/map visualization)
- Add animation loop that reads carbon savings data

### 5. Particles (Limited Use)

**Goal:** Subtle particle effect ONLY behind Power → Compute Frontier or World View map.

**Implementation:**
- Use absolutely positioned `<canvas>` or SVG
- 50-100 dots, slow drift, minor alpha changes
- React to orbit share growth (subtle movement)
- Freeze/slow when tab is not active

**Where to add:**
- Behind PowerComputeFrontier in Physics & Limits tab
- Behind World View map (optional)

**Files to create:**
- `frontend/app/components/orbitSim/SubtleParticleField.tsx`

**Files to modify:**
- `frontend/app/components/orbitSim/PowerComputeFrontier.tsx` (add particle background)
- World View component (if adding particles)

### 6. Cone Futures Charts

**Goal:** Show "band of plausible futures" using min/max/median from three scenarios.

**Data Model:**
Create `frontend/app/lib/orbitSim/selectors/cones.ts`:
```typescript
export type ScenarioKey = "BASELINE" | "ORBITAL_BEAR" | "ORBITAL_BULL";

export interface ConePoint {
  year: number;
  min: number;
  max: number;
  median: number;
}

export function buildConeSeries(
  field: keyof DebugStateEntry
): ConePoint[] {
  // Get data from all three scenarios
  // Sort values for each year: [bear, baseline, bull]
  // Return { year, min: bear, max: bull, median: baseline }
}
```

**Chart Component:**
Create `frontend/app/components/orbitSim/ConeChart.tsx` using Recharts:
- Use `AreaChart` with two stacked `Area` components
- First area: max value (translucent fill)
- Second area: min value (background color fill to "cut out" lower band)
- `Line` for median (baseline)
- Smooth animations on data changes

**Integration:**
- Add to FUTURES tab only
- Create cones for:
  - Cost: `buildConeSeries("cost_per_compute_mix")`
  - Carbon: `buildConeSeries("annual_carbon_mix")`
  - Adoption: `buildConeSeries("orbit_compute_share")`

**Files to create:**
- `frontend/app/lib/orbitSim/selectors/cones.ts`
- `frontend/app/components/orbitSim/ConeChart.tsx`

**Files to modify:**
- `frontend/app/components/orbitSim/ScenariosView.tsx` (add ConeChart components)

## Animation Principles

### DO:
- Smooth transitions that explain structure
- Motion that helps users understand relationships
- Subtle, professional animations
- Animations tied to user interactions (scenario change, year scrub)
- One-shot animations for important events (crossover)

### DON'T:
- Constant camera spins
- Big bouncy transitions
- Game-like effects
- Particles on every chart
- Confetti-like effects
- Animations that distract from data

## Technical Notes

### Recharts Integration
- Install if not present: `npm install recharts`
- Use for cone charts and any charts needing smooth transitions
- Leverage built-in animation props

### D3 Transitions
- Use `d3.transition()` for existing D3 charts
- Duration: 200-400ms for most transitions
- Easing: `d3.easeQuadOut` or `d3.easeCubicOut`

### Performance
- Freeze animations when tab is not active
- Use `requestAnimationFrame` for particle effects
- Debounce rapid year changes
- Use `will-change` CSS property for animated elements

### State Management
- Scenario changes trigger re-renders with new data
- Year changes come from `highlightedYear` state
- Crossover detection happens in data processing layer

## Current File Structure

```
frontend/app/
├── components/
│   ├── orbitSim/
│   │   ├── SystemOverviewView.tsx (OVERVIEW tab)
│   │   ├── ScenariosView.tsx (FUTURES tab)
│   │   ├── ConstraintsRiskView.tsx (CONSTRAINTS & RISK tab)
│   │   ├── PhysicsEngineeringView.tsx (PHYSICS & LIMITS tab)
│   │   ├── MultiScenarioChart.tsx (scenario comparison)
│   │   ├── PowerComputeFrontier.tsx
│   │   ├── CostComputeChart.tsx
│   │   ├── LatencyChart.tsx
│   │   ├── OpexStreamgraph.tsx
│   │   ├── CarbonRiver.tsx
│   │   └── ... (other chart components)
│   └── futures/
│       ├── Futures3DScene.tsx
│       └── FuturesConeVisualization.tsx
├── lib/
│   └── orbitSim/
│       ├── debugState.ts (scenario data storage)
│       └── selectors/
│           ├── scenarios.ts
│           ├── frontier.ts
│           └── ... (other selectors)
└── store/
    └── simulationStore.ts (Zustand store)
```

## Next Steps

1. Create cone chart selector (`cones.ts`)
2. Create ConeChart component using Recharts
3. Add cone charts to ScenariosView
4. Implement smooth transitions on scenario change
5. Add year scrub animations
6. Implement crossover pulse detection
7. Add subtle particles (if desired)
8. Add world map breathing effect (if desired)







