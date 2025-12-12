# Implementation Plans for Simulation Engagement Features

## 1. Real-Time Feedback & Celebrations

### Implementation Approach:

**A. Confetti/Particle Effects:**
- Use `canvas-confetti` library (lightweight, ~2KB)
- Trigger on milestone detection in `yearSteppedDeployment.ts`:
  ```typescript
  if (cost_crossover_triggered && !previousCostCrossover) {
    triggerConfetti();
    showToast("🎉 Cost Crossover Achieved!");
  }
  ```
- Add to `SpecialMoments.tsx` component (already exists for threshold animations)
- **Time: 2-3 hours**

**B. Sound Design:**
- Use Web Audio API or `howler.js` for cross-browser support
- Preload small sound files (~10-50KB each):
  - `launch.wav` - subtle whoosh on satellite launch
  - `crossover.wav` - chime on cost/carbon crossover
  - `milestone.wav` - gentle ping on threshold reached
- Add audio context in `OrbitalScene.tsx` or global audio manager
- **Time: 3-4 hours**

**C. Visual Pulses:**
- Already partially implemented in `SpecialMoments.tsx`
- Enhance with:
  - Chart glow: Add CSS animation to chart containers when thresholds crossed
  - Shell pulse: Use `useFrame` in `StaticOrbitalShells.tsx` to pulse shell radius
  - Metric cards: Add pulse animation to KPI cards
- **Time: 2-3 hours**

**D. Toast Notifications:**
- Already have `showToast` utility
- Enhance with:
  - Different styles for different event types (success, warning, info)
  - Auto-dismiss with progress bar
  - Stack multiple toasts
- **Time: 1-2 hours**

**Total: ~8-12 hours**

---

## 2. Story Mode / Scenarios

### Implementation Approach:

**A. Scenario System Architecture:**
```typescript
interface Scenario {
  id: string;
  title: string;
  description: string;
  startYear: number;
  endYear: number;
  goals: Goal[];
  constraints: Constraint[];
  narrative: NarrativeEvent[];
}

interface Goal {
  type: "orbit_share" | "latency" | "carbon" | "cost";
  target: number;
  byYear: number;
  description: string;
}
```

**B. Scenario Components:**
- Create `ScenarioMode.tsx` component
- Add scenario selector in menu/overview
- Store active scenario in Zustand store (`scenarioStore.ts`)
- Modify `yearSteppedDeployment.ts` to check scenario constraints

**C. Narrative Events:**
- Popup cards that appear at specific years
- "The 2030 Energy Crisis hits. Grid costs spike 40%..."
- Use existing toast/notification system

**D. Scenario Examples:**
1. **"The 2030 Energy Crisis"**
   - Constraint: Ground energy costs spike 40% in 2030
   - Goal: Achieve 50% orbit share by 2032
   - Narrative: Energy crisis events at 2028, 2030, 2032

2. **"Latency Wars"**
   - Constraint: Competitor launches low-latency constellation
   - Goal: Beat competitor latency by 2035
   - Narrative: Competitive updates every 2 years

3. **"Carbon Neutral by 2040"**
   - Constraint: Carbon tax increases 10% per year
   - Goal: Zero net carbon by 2040
   - Narrative: Climate events, policy changes

**Time: 2-3 days**

---

## 3. Comparison Mode

### Implementation Approach:

**A. Dual Strategy System:**
```typescript
interface ComparisonState {
  strategyA: StrategyMode;
  strategyB: StrategyMode;
  yearA: number;
  yearB: number;
  metricsA: Metrics;
  metricsB: Metrics;
}
```

**B. UI Layout:**
- Split view: Left = Strategy A, Right = Strategy B
- Side-by-side charts using existing chart components
- Diff highlighting: Green = better, Red = worse
- Toggle button to switch between single/comparison mode

**C. Implementation Steps:**
1. Create `ComparisonView.tsx` component
2. Duplicate simulation state for Strategy B
3. Run both simulations in parallel (or sequentially)
4. Create comparison chart components
5. Add diff visualization

**D. "What If" Feature:**
- Button: "Compare with Cost-first"
- Runs quick simulation of alternative strategy
- Shows side-by-side comparison
- Non-destructive (doesn't change current state)

**Time: 3-4 days**

---

## 4. Time-Lapse / Replay

### Implementation Approach:

**A. State History System:**
```typescript
interface SimulationHistory {
  [year: number]: {
    state: YearDeploymentState;
    metrics: Metrics;
    satellites: Satellite[];
    routes: Route[];
  };
}
```

**B. History Storage:**
- Store complete state at each year in `yearSteppedDeployment.ts`
- Use Zustand store: `simulationHistoryStore.ts`
- Limit to last 50 years to prevent memory issues

**C. Timeline Scrubber:**
- Add timeline component below year counter
- Horizontal slider: `2025 ──────●────── 2050`
- Click/drag to jump to any year
- Show preview tooltip: "2035: 45% orbit share"

**D. Replay Functionality:**
- "Replay" button in menu
- Animate through years automatically (1 year per second)
- Pause/play controls
- Speed control: 0.5x, 1x, 2x, 5x

**E. Undo/Redo:**
- Store action history (deployments, strategy changes)
- Undo button: revert to previous year
- Redo button: re-apply undone action
- Visual indicator: "Undo available" badge

**Time: 4-5 days**

---

## 8. Micro-Interactions

### Implementation Approach:

**A. Satellite Pulse on Click:**
- In `SatellitesGPUInstanced.tsx`:
  - Track clicked satellite ID
  - Add scale animation using `useFrame`
  - Pulse: scale 1.0 → 1.2 → 1.0 over 300ms
  - Use `useSpring` from `@react-spring/three` for smooth animation

**B. Routes Animate on Hover:**
- In `TrafficFlowsBatched.tsx`:
  - Detect hover using raycasting
  - Increase line width on hover: `lineWidth: 2 → 4`
  - Add glow effect: increase emissive intensity
  - Smooth transition using `lerp`

**C. Charts Respond to Mouse:**
- In chart components (e.g., `CostChart.tsx`):
  - Track mouse position over chart
  - Show tooltip with exact values
  - Highlight nearest data point
  - Add vertical line indicator

**D. Smooth Transitions:**
- Use `framer-motion` for UI transitions
- Use `@react-spring/three` for 3D transitions
- Add transition config:
  ```typescript
  const transition = {
    type: "spring",
    stiffness: 100,
    damping: 15
  };
  ```

**E. Haptic Feedback (Mobile):**
- Use Vibration API: `navigator.vibrate([50])`
- Trigger on:
  - Satellite click: short vibration
  - Milestone achieved: double vibration
  - Error: long vibration
- Check support: `'vibrate' in navigator`

**Time: 2-3 days**

---

## Summary

| Feature | Time Estimate | Complexity |
|---------|--------------|------------|
| 1. Real-Time Feedback | 8-12 hours | Medium |
| 2. Story Mode | 2-3 days | High |
| 3. Comparison Mode | 3-4 days | High |
| 4. Time-Lapse/Replay | 4-5 days | High |
| 8. Micro-Interactions | 2-3 days | Medium |

**Total: ~12-18 days**

## Recommended Order:
1. **Micro-Interactions (#8)** - Quick wins, immediate UX improvement
2. **Real-Time Feedback (#1)** - High impact, relatively quick
3. **Comparison Mode (#3)** - Useful for strategy exploration
4. **Time-Lapse/Replay (#4)** - Great for understanding progression
5. **Story Mode (#2)** - Most complex, but adds narrative depth

