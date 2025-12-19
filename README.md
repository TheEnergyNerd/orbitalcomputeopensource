# Orbital Compute Open Source

A research-grade physics-based economic model for comparing orbital vs ground-based AI compute infrastructure.

## Overview

This repository contains the core comparison engine and UI for analyzing the economics of orbital compute platforms versus traditional ground-based datacenters. The model includes:

- **Physics-based cost modeling** for orbital satellites (power, thermal, launch, operations)
- **Ground infrastructure constraints** with buildout rates, backlog queues, and scarcity pricing
- **Market share analysis** based on served compute capacity (not just cost)
- **Interactive parameter exploration** with coupled sliders and validation

## Key Features

### 1. Demand Model
- Piecewise exponential growth calibrated to 450 GW by 2040, multi-TW by 2060
- Facility load tracking with PUE adjustments
- Incremental demand calculation for buildout constraints

### 2. Ground Buildout Model
- Ramping mobilization with configurable build rates (25→60→140→220 GW/yr)
- Backlog queue tracking when demand exceeds build rate
- Wait time calculation: `avgWaitYears = backlogGW / buildRateGWyr`
- Pipeline capacity modeling with lead times

### 3. Constraint Economics
- **Delay penalty**: `avgWaitYears × valueOfTime × (queuePressure^1.3)`
- **Buildout premium**: Scarcity-adjusted capex with convex scaling
- **Queue pressure**: `1 + backlogGW / buildableGW`
- All constraints as **adders only** (no multipliers) to prevent double-counting

### 4. Market Share
- **Capacity-served model**: Shares based on feasible served compute, not cost softmax
- Ground feasible: `max(0, demandGW - backlogGW)`
- Orbital feasible: Limited by launch/manufacturing constraints
- Feasibility gating: If capacity = 0, share = 0

### 5. GPU-Hour Pricing
- Includes `gridScarcity` adder from constraint penalties
- Converts delay penalty + buildout premium to $/GPU-hour
- Margin applied after scarcity (market charges for constraints)

## Installation

```bash
npm install
npm run dev
```

Open [http://localhost:3000/compare](http://localhost:3000/compare)

## Project Structure

```
app/
  compare/
    page.tsx          # Main comparison UI
  lib/
    model/            # Core physics and economic models
      physicsCost.ts  # Main cost calculation engine
      trajectory.ts  # Multi-year simulation
      ground_ramping_mobilization.ts  # Demand and buildout model
      ground_buildout.ts  # Constraint economics
      orbitalPhysics.ts  # Orbital satellite physics
      types.ts        # Type definitions
      ...
    ui/              # UI utilities (slider coupling, etc.)
    utils/           # Utilities (sanitization, etc.)
  components/
    ui/              # React components (sliders, validation, etc.)
```

## Core Models

### Demand Curve
```typescript
// Piecewise exponential with anchors
r1 = ln(450 / demand2025) / (2040-2025)
r2 = ln(demand2060 / 450) / (2060-2040)
demandGw(t) = t<=2040 ? demand2025*exp(r1*(t-2025)) : 450*exp(r2*(t-2040))
```

### Buildout Constraints
```typescript
backlogGw(t) = max(0, backlogGw(t-1) + demandNewGw(t) - buildableGw(t))
avgWaitYears(t) = backlogGw(t) / max(buildRateGwYear(t), 1e-9)
queuePressure = 1 + backlogGw / buildableGw
```

### Constraint Economics
```typescript
// Delay penalty with panic regime
delayPenalty = avgWaitYears × wacc × (hardwareCapex + siteCapex) × (queuePressure^1.3)

// Buildout premium with scarcity scaling
scarcityIndex = max(0, demandNewGw / buildableGw - 1)
buildoutCapex = base × (1 + 2.0 × scarcityIndex^1.7)
buildoutPremium = amortize(buildoutCapex, wacc, lifetime) × kW_per_PFLOP
```

### Market Share
```typescript
groundFeasibleComputeGW = max(0, demandGW - backlogGW)
groundServedComputeGW = min(demandGW, groundFeasibleComputeGW)
orbitServedComputeGW = min(remainingDemand, orbitFeasibleComputeGW)
orbitalShareFrac = orbitServed / (groundServed + orbitServed)
```

## Key Parameters

### Demand Anchors
- `demandAnchorsGW: { 2025: 120, 2040: 450, 2060: 3000 }`
- `demandIsFacilityLoad: true` (includes PUE)

### Buildout Anchors
- `buildoutAnchorsGWyr: { 2025: 25, 2030: 60, 2040: 140, 2060: 220 }`
- `buildoutSmoothingYears: 3`
- `pipelineLeadTimeYears: 3`

### Constraint Scaling
- `buildoutK: 2.0` (scarcity scaling factor)
- `buildoutExponent: 1.7` (convex exponent)
- `panicExponent: 1.3` (delay penalty panic regime)

## Validation

The model includes hard asserts in development mode:
- Demand anchors: `abs(demandGw(2040)-450)/450 < 0.03`
- Backlog invariant: If `demandNewGW > buildRateGWyr`, backlog must increase
- Constraint invariant: If `queuePressure>1.1` OR `scarcityIndex>0`, at least one adder must be >0
- Market share: Shares sum to 1.0 when both feasible

## License

MIT License - See LICENSE file for details

## Citation

If you use this model in research, please cite:

```
Orbital Compute Open Source - Physics-Based Economic Model
https://github.com/[your-username]/orbitalcomputeopensource
```

## Contributing

This is an open-source research tool. Contributions welcome! Please open issues for bugs or feature requests.

