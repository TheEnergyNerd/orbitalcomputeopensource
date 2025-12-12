# Orbital Compute Simulation Algorithms

This document describes the ground truth algorithms used in the orbital compute simulation. All metrics (cost/compute, latency, annual OPEX, carbon) are calculated from physics-based models and stored in the debug state as the single source of truth.

## Table of Contents

1. [Physics Engine](#physics-engine)
2. [Cost & Economics](#cost--economics)
3. [Carbon Calculation](#carbon-calculation)
4. [Latency Calculation](#latency-calculation)
5. [Compute Calculation](#compute-calculation)
6. [Thermal Dynamics](#thermal-dynamics)
7. [Maintenance & Survival](#maintenance--survival)
8. [Backhaul Constraints](#backhaul-constraints)

---

## Physics Engine

**Location:** `frontend/app/lib/orbitSim/physicsEngine.ts`

The physics engine is the core simulation that calculates thermal dynamics, compute capacity, and survival rates.

### Key Equations

#### 1. Heat Generation
```
heatGen_kw = power_total_kw × (1 - electrical_efficiency)
```

#### 2. Radiator Capacity
```
radiator_capacity_kw = radiatorArea_m2 × radiator_kw_per_m2 × emissivity × (1 - eclipse_fraction) × (1 - shadowing_loss)
```

#### 3. Heat Rejection
```
heatReject_kw = min(heatGen_kw, radiator_capacity_kw)
```

#### 4. Net Heat Flow
```
net_heat_flow_kw = heatGen_kw - heatReject_kw
```

#### 5. Temperature Update
**CRITICAL FIX:** Each tick represents 1 year, so calculate temperature change per year directly:
```
joules_per_year = net_heat_flow_kw × 1000 × 3600 × 24 × 365
thermal_drift_C_per_year = joules_per_year / thermal_mass_J_per_C
temp_core_C = temp_core_C + thermal_drift_C_per_year
```

**Note:** The previous documentation incorrectly showed per-hour calculation then per-year addition. The implementation correctly calculates per-year directly.

#### 6. Survival Fraction (SAFE Mode)
```
if temp_core_C > TARGET_TEMP_C (70°C):
  degradation_factor = min(0.03, (temp_core_C - 70) / 20 × 0.03)
  survival_fraction = max(0.97, 1.0 - degradation_factor)  // Minimum 97%
else:
  survival_fraction = min(1.0, survival_fraction + 0.01)  // 1% recovery per year
```

#### 7. Survival Fraction (AGGRESSIVE Mode)
```
if temp_core_C > MAX_TEMP_SOFT_C (90°C):
  degradation_factor = min(0.9, (temp_core_C - 90) / 360)
  survival_fraction = max(0.1, 1.0 - degradation_factor)  // Minimum 10%
else:
  survival_fraction = min(1.0, survival_fraction + 0.05)  // 5% recovery per year
```

#### 7b. Survival Fraction (YOLO Mode)
```
if temp_core_C > MAX_TEMP_SOFT_C (90°C):
  degradation_factor = min(1.0, (temp_core_C - 90) / 360)
  survival_fraction = max(0.0, 1.0 - degradation_factor)  // Can reach 0.0 (fleet can die)
else:
  survival_fraction = min(1.0, survival_fraction + 0.05)  // 5% recovery per year
```

**CRITICAL:** YOLO mode is the only mode where `survival_fraction` can reach 0.0, allowing the fleet to completely die from thermal/maintenance failures.

#### 8. Compute Exportable
```
compute_exportable_flops = min(
  compute_raw_flops × survival_fraction,
  backhaul_capacity_tbps × FLOPS_PER_TBPS
)
```

Where `FLOPS_PER_TBPS = 1e15 / 1e12 = 1000 PFLOPs per TBps`

---

## Cost & Economics

**Location:** `frontend/app/lib/orbitSim/yearSteppedDeployment.ts` (lines 650-700)

### Ground Cost

**NOTE:** The value `groundCostPerTwh = 340` is stylized for relative comparisons. Real grid prices are typically $30-100 per MWh, not TWh. This is normalized for the simulation's cost units.

```
groundCostPerTwh = 340  // Normalized cost units (not literal $/TWh)
groundCostUSD = totalPowerTwh × groundCostPerTwh
```

### Orbital Cost

**CRITICAL:** Orbital cost is built from **first principles** (physical quantities only). No magic costs are allowed.

#### Tech Progress & Cost Dynamics

**B. ADD MINIMAL TECH / COST DYNAMICS:** To prevent cost/compute from being perfectly flat, we introduce time-varying parameters:

```
yearIndex = year - 2025
techProgressFactor = pow(1.20, yearIndex / 5)  // +20% compute every 5 years
launchCostDeclineFactor = pow(0.90, yearIndex / 5)  // -10% $/kg every 5 years
```

These factors are applied to:
- Compute per satellite: `computePerA = baseComputePerA × techProgressFactor`
- Launch cost: `cost_per_kg_to_leo = base_cost_per_kg_to_leo × launchCostDeclineFactor`

This ensures `cost_per_compute_orbit` curves downward over time instead of staying flat.

#### Physical Quantities
```
totalLaunchMassKg = (satellitesTotal × avgMassPerSatellite) + totalRadiatorMassKg
base_cost_per_kg_to_leo = (launchBudgetM × 1e6) / (totalMassT × 1000)  // Base launch cost
cost_per_kg_to_leo = base_cost_per_kg_to_leo × launchCostDeclineFactor  // With tech progress
avgCostPerSatellite = (costA + costB) / 2  // Manufacturing + bus + payload
totalRadiatorMassKg = (final_S_A_new × massA × 0.2 + final_S_B_new × massB × 0.4) × 1000
```

#### Launch Cost
```
launchCostUSD = totalLaunchMassKg × cost_per_kg_to_leo
```

#### Replacement Cost
```
replacementCostUSD = replacementCadence × avgCostPerSatellite
```

#### Radiator Cost Multiplier
```
radiatorCostMultiplier = 1.0 + (totalRadiatorMassKg / 1_000_000)  // 1% cost increase per 1000 kg
```

#### Total Orbital Cost
```
totalOrbitalCostUSD = (launchCostUSD + replacementCostUSD) × radiatorCostMultiplier
```

**RULE:** All orbital costs must be tied to:
- Launch mass (satellite count, per-sat mass, radiators)
- Replacement cadence (satellite count, lifetime, failures)
- Radiator mass (radiator area × mass per m²)

**NO magic costs** that aren't derived from physical quantities.

### Cost Per Compute

**CRITICAL FIX:** Cost per compute now uses direct $/PFLOP calculation, not TWh conversion.

#### Ground
```
cost_per_compute_ground = 340  // Reference $ per PFLOP (not literal $/TWh)
```

#### Orbital
```
exportedPFLOPs = compute_exportable_PFLOPs
cost_per_compute_orbit = totalOrbitalCostUSD / exportedPFLOPs
```

**Clamping:**
- If `exportedPFLOPs = 0` and `totalOrbitalCostUSD > 0`: `cost_per_compute_orbit = Infinity`
- If `cost_per_compute_orbit > 1e7`: clamp to `1e7` (for visualization)

#### Mix
```
cost_per_compute_mix = groundComputeShare × cost_per_compute_ground + orbitComputeShare × cost_per_compute_orbit
```

**Sanity Clamp:**
```
display_cost_per_compute_mix = sane(cost_per_compute_mix, 1e7)
```

### Annual OPEX

**CRITICAL FIX:** Annual OPEX now uses fixed demand (10,000 TWh) instead of variable power, preventing ground OPEX from going to $0M.

**A. FIX GROUND OPEX DISPLAY BUG:** Ground OPEX label must show all-ground baseline, not share-adjusted value.

```
baseDemandTWh = 10000  // Fixed annual demand: 10,000 TWh

// Ground-only baseline (what you'd spend if you stayed all-ground)
allGroundOpexUSD = baseDemandTWh × groundCostPerTwh

// Mix: split that demand by compute share (for mix calculation)
annual_opex_ground = groundComputeShare × allGroundOpexUSD

// Orbit OPEX is the actual orbital cost for that year
annual_opex_orbit = totalOrbitalCostUSD

// Mix
annual_opex_mix = annual_opex_ground + annual_opex_orbit

// Store both for display
annual_opex_ground_all_ground = allGroundOpexUSD  // For "Ground: $XM" label
annual_opex_mix_raw = annual_opex_mix  // Raw mix value
```

**Display Values:**
- Ground OPEX label: `annual_opex_ground_all_ground` (all-ground baseline, NOT share-adjusted)
- Mix OPEX curve: `sane(annual_opex_mix, 1e12)` (clamped for visualization)

**CRITICAL:** The "Ground: $XM" label uses `annual_opex_ground_all_ground`, not the share-adjusted `annual_opex_ground`. This prevents showing "$0M" when orbit share is high.

---

## Carbon Calculation

**Location:** `frontend/app/lib/orbitSim/yearSteppedDeployment.ts` (lines 618-648)

### Orbital Carbon

#### Launch Carbon
```
launchCarbonKg = totalLaunchMassKg × 300  // 300 kg CO2 per kg to LEO
```

#### Replacement Carbon
```
replacementCarbonKg = replacementCadence × avgRadiatorMassPerSat × 1000 × 300
```

#### Total Orbital Carbon
```
totalOrbitalCarbonKg = launchCarbonKg + replacementCarbonKg
```

#### Carbon Intensity
**CRITICAL FIX:** Single physics-based formula. No duplicate definitions. All carbon calculations use cumulative amortization.

**D. CARBON: AMORTIZE OVER CUMULATIVE USE:** To prevent carbon intensity from monotonically rising, we amortize launch carbon over cumulative energy served:

```
baseDemandTWh = 10_000  // Fixed annual demand: 10,000 TWh
carbon_ground = 400  // kg CO2 per TWh

// Get previous year's cumulative values
prevCumulativeCarbonKg = previousYear?.cumulativeOrbitalCarbonKg ?? 0
prevCumulativeOrbitEnergyTwh = previousYear?.cumulativeOrbitEnergyTwh ?? 0

// Cumulative orbital carbon (launch + replacements for THIS year)
cumulativeOrbitalCarbonKg = prevCumulativeCarbonKg + totalOrbitalCarbonKg

// Orbit energy served this year
orbitEnergyServedTwh = orbitComputeShare × baseDemandTWh
cumulativeOrbitEnergyTwh = prevCumulativeOrbitEnergyTwh + orbitEnergyServedTwh

// Carbon intensity using cumulative values (amortized over lifetime)
if cumulativeOrbitEnergyTwh > 0 AND cumulativeOrbitalCarbonKg > 0:
  carbon_orbit = cumulativeOrbitalCarbonKg / cumulativeOrbitEnergyTwh
else:
  carbon_orbit = carbon_ground × 5  // Fallback: worse than ground for initial years
```

**Key:** Early years: small energy, big launch events → `carbon_orbit >> carbon_ground`. Later years: energy accumulates faster than incremental launch carbon → `carbon_orbit` drops and can cross below ground.

**RULE:** There is only ONE definition of `carbon_orbit`. It uses cumulative amortization, not yearly division.

### Ground Carbon

```
groundCarbonPerTwh = 400  // kg CO2 per TWh (constant)
carbon_ground = groundCarbonPerTwh
```

### Carbon Mix

```
carbon_mix = groundComputeShare × carbon_ground + orbitComputeShare × carbon_orbit
```

**Sanity Clamp:**
```
display_carbon_mix = sane(carbon_mix, 1e6)
```

### Carbon Delta

```
carbon_delta = carbon_orbit - carbon_ground
carbon_crossover_triggered = carbon_delta < 0
```

---

## Latency Calculation

**Location:** `frontend/app/lib/orbitSim/yearSteppedDeployment.ts` (lines 702-705)

### Baseline Latencies

```
latency_ground_ms = 120  // Baseline ground latency
latency_orbit_ms = 90    // Baseline orbit latency
```

### Mix Latency

```
latency_mix_ms = groundComputeShare × latency_ground_ms + orbitComputeShare × latency_orbit_ms
```

**Note:** These are simplified constants. In a full model, orbital latency could vary based on:
- Constellation geometry
- Ground station coverage
- Network congestion
- Satellite-to-satellite routing

---

## Compute Calculation

**Location:** `frontend/app/lib/orbitSim/yearSteppedDeployment.ts` and `physicsEngine.ts`

### Raw Compute

Raw compute is calculated from satellite counts and tech curves:

```
compute_raw_flops = (classA_satellites_alive × computePerA) + (classB_satellites_alive × computePerB)
```

### Effective Compute (After Survival)

```
compute_effective_flops = compute_raw_flops × survival_fraction
```

### Exportable Compute (After Backhaul)

```
compute_exportable_flops = min(
  compute_effective_flops,
  backhaul_capacity_tbps × FLOPS_PER_TBPS
)
```

### Compute Share

**CRITICAL FIX:** Compute share calculation now includes clamping to prevent "all orbit" or "all ground" glitches.

**C. MAKE ORBIT SHARE ACTUALLY CHANGE IN TIME:** To ensure orbit share changes over time (so latency and cost-mix curves have proper slope):

```
yearIndex = year - 2025
demandGrowthFactor = pow(1.10, yearIndex)  // Demand grows at ~10%/yr
baseDemandPFLOPs = 1000
totalComputePFLOPs = baseDemandPFLOPs × demandGrowthFactor  // Demand (grows over time)

// Actual compute capacity from satellites (with tech progress)
actualComputePFLOPs = S_A_new × computePerA + S_B_new × computePerB
compute_exportable_PFLOPs = compute_exportable_flops / 1e15
totalDemandFlops = totalComputePFLOPs × 1e15  // FLOPS

// Compute shares from actual exportable compute with clamping
orbitComputeShare = totalDemandFlops > 0
  ? clamp(compute_exportable_flops / totalDemandFlops, 0, 1)
  : 0

groundComputeShare = clamp(1 - orbitComputeShare, 0, 1)

// If orbit is basically irrelevant, snap back to all-ground for clarity
if orbitComputeShare < 1e-4:
  orbitComputeShare = 0
  groundComputeShare = 1
```

**Key:** Early years: demand grows faster than orbital capability (low orbit share). Later years: orbital capability outpaces demand due to tech progress (orbit share increases). This gives latency and cost-mix curves proper slope.

---

## Thermal Dynamics

**Location:** `frontend/app/lib/orbitSim/physicsEngine.ts`

### SAFE Mode Thermal Design

When `auto_design_mode = true` AND `risk_mode = "SAFE"`:

**IMPORTANT NOTE:** SAFE mode is a **constrained design solver**, not pure physics. It uses clamping and convergence zones to ensure safe operation, which means it's not physically honest but is appropriate for a design sandbox.

**CRITICAL FIX:** SAFE thermal order is now enforced as a strict pipeline: `heatGen → SAFE sizing → capacity → heatReject → net_heat → temp`

#### Pipeline Order (ENFORCED)

**Step 1: Compute Heat Generation**
```
heatGen_kw = power_total_kw × (1 - electrical_efficiency)
```

**Step 2: SAFE Mode Sizing (if applicable)**
```
TARGET_TEMP_C = 70
MAX_ALLOWED_UTILIZATION = 0.9  // 90% design margin

// Calculate effective radiator capacity per m² (used throughout)
effective_per_m2 = radiator_kw_per_m2 × emissivity × (1 - eclipse_fraction) × (1 - shadowing_loss)

// Solve for required radiator area
required_radiator_capacity_kw = heatGen_kw / MAX_ALLOWED_UTILIZATION
required_radiator_area_m2 = required_radiator_capacity_kw / effective_per_m2

// Auto-resize if needed
if radiatorArea_m2 < required_radiator_area_m2:
  radiatorArea_m2 = required_radiator_area_m2
```

**Step 3: Compute Radiator Capacity (AFTER potential resize)**
```
// CRITICAL: Must recompute after resize, before using capacity
radiator_capacity_kw = radiatorArea_m2 × effective_per_m2
```

**Step 4: Compute Heat Rejection**
```
heatReject_kw = min(heatGen_kw, radiator_capacity_kw)
```

**Step 5: Compute Net Heat Flow**
```
net_heat_flow_kw = heatGen_kw - heatReject_kw
```

**Step 6: SAFE Mode Convergence Zone**
```
if abs(net_heat_flow_kw) < (0.02 × heatGen_kw):
  net_heat_flow_kw = 0  // Convergence zone
```

**Step 7: Temperature Update**
```
joules_per_year = net_heat_flow_kw × 1000 × 3600 × 24 × 365
thermal_drift_C_per_year = joules_per_year / thermal_mass_J_per_C
temp_core_C = temp_core_C + thermal_drift_C_per_year
```

**Step 8: Hard Safe Bounds (AFTER temperature update)**
```
if temp_core_C > 90:
  temp_core_C = 90
  net_heat_flow_kw = 0
else if temp_core_C < 40:
  temp_core_C = 40
  net_heat_flow_kw = 0
```

**CRITICAL:** No code should overwrite `heatReject_kw` with `heatGen_kw` or `net_heat_flow_kw` with `0` except in the explicit SAFE clamps above. The pipeline order ensures correct thermal calculations.

**NOTE:** These hard bounds mean SAFE mode is not "physics" - it's a "solve-for-a-safe-design and clamp" approach. This is fine for a design sandbox, but should not be presented as physically honest.

#### Burnout & Overdrive Disabled
In SAFE mode, radiator burnout, emissivity decay, and thermal death are **DISABLED**. They only activate in AGGRESSIVE or YOLO modes.

### AGGRESSIVE/YOLO Mode Thermal Design

#### Radiator Burnout (utilization > 120%)
```
if radiator_utilization > 120:
  overload = radiator_utilization / 100
  radiatorArea_m2 *= exp(-0.05 × overload)
  emissivity *= exp(-0.02 × overload)
  // Recalculate capacity after burnout
```

#### Thermal Damage
```
if temp_core_C > MAX_TEMP_SOFT_C (90°C) OR temp_core_C < -40°C:
  degraded_pods += abs(temp_core_C) / 200

if temp_core_C > MAX_TEMP_HARD_C (450°C):
  temp_core_C = MAX_TEMP_HARD_C  // Cap temperature
  degraded_pods += (temp_core_C - 90) / 50  // Severe degradation
```

---

## Thermal Mass

**Location:** `frontend/app/lib/orbitSim/physicsEngine.ts`

### Thermal Mass Definition

**CRITICAL FIX:** Thermal mass must scale with satellite count to prevent numerical instability:

```
MASS_PER_SAT_J_PER_C = 5e8  // Joules per degree C per satellite
MIN_THERMAL_MASS = 1e8  // Minimum thermal mass (J/°C) to prevent numerical issues
thermal_mass_J_per_C = max(satellite_count × MASS_PER_SAT_J_PER_C, MIN_THERMAL_MASS)
```

**Note:** If thermal mass is too small, temperature changes will be extreme. If too large, temperature barely moves. The current implementation scales with fleet size, which is physically correct.

---

## Maintenance & Survival

**Location:** `frontend/app/lib/orbitSim/deploymentConstraints.ts` and `yearSteppedDeployment.ts`

### Repair Capacity

```
baseRepairRate = 0.02  // 2% base repair rate
repairRate = baseRepairRate × pow(autonomyLevel, 0.5)  // Square root growth
maxRepairRate = 0.20  // 20% maximum repair rate
repairCapacity = satellitesTotal × min(repairRate, maxRepairRate)
```

### Maintenance Penalty on Survival

**CRITICAL FIX:** Maintenance workload is failures only, not failures + recovered. Recovered satellites represent completed work, not workload.

```
total_maintenance_workload = satellitesFailed  // Only failures need maintenance attention
maintenance_utilization_percent = (total_maintenance_workload / repairCapacity) × 100

if maintenance_utilization_percent > 100:
  overload = maintenance_utilization_percent / 100
  maintenance_penalty = exp(-0.1 × overload)  // Reduced from -0.25
  final_survival_fraction = physics_survival × maintenance_penalty
  
  // Respect risk mode minimums
  if risk_mode === "SAFE":
    final_survival_fraction = max(0.97, final_survival_fraction)  // Minimum 97%
  else if risk_mode === "YOLO":
    // No minimum - can reach 0.0 (fleet can die)
  else:  // AGGRESSIVE
    final_survival_fraction = max(0.1, final_survival_fraction)  // Minimum 10%
```

### Satellite State Transitions

```
satellitesTotal_start = previous_year_satellitesTotal
satellitesTotal_after_launches_retirements = satellitesTotal_start + launchesThisYear - satellitesRetiredThisYear
satellitesFailedThisYear = satellitesTotal_after_launches_retirements × failureRate
satellitesRecoveredThisYear = min(satellitesFailedThisYear, repairCapacity)
satellitesTotal_end = satellitesTotal_after_launches_retirements × survival_fraction
```

**CRITICAL:** `satellitesTotal` must be aggregated from class counts:
```
satellitesTotal = classA_satellites_alive + classB_satellites_alive
```

**NOTE:** Both `failureRate` and `survival_fraction` act as loss factors. The current implementation:
- Uses `failureRate` to calculate `satellitesFailedThisYear`
- Uses `survival_fraction` from physics engine (which includes thermal degradation)
- Applies maintenance penalty to `survival_fraction` based on maintenance utilization
- Final count = `satellitesTotal_after_launches_retirements × final_survival_fraction`

This means failures are accounted for through `survival_fraction`, not directly subtracted. The `failureRate` is used for maintenance workload calculation, not direct satellite loss.

---

## Backhaul Constraints

**Location:** `frontend/app/lib/orbitSim/yearSteppedDeployment.ts` and `physicsEngine.ts`

### Backhaul Capacity

```
backhaul_capacity_tbps = (satelliteCountA + satelliteCountB) × 0.5  // 0.5 TBps per satellite
```

### Backhaul Used

```
backhaul_used_tbps = compute_exportable_flops / FLOPS_PER_TBPS
```

### Backhaul Utilization

```
backhaul_utilization_percent = (backhaul_used_tbps / backhaul_capacity_tbps) × 100
```

### Compute Exportable (Backhaul-Limited)

```
FLOPS_PER_TBPS = 1e15 / 1e12 = 1000 PFLOPs per TBps
compute_exportable_flops = min(
  compute_effective_flops,
  backhaul_capacity_tbps × FLOPS_PER_TBPS
)
```

---

## Data Flow

### Single Source of Truth

All metrics are calculated in `yearSteppedDeployment.ts` and stored in the debug state:

1. **Physics Engine** (`physicsEngine.ts`) calculates:
   - Thermal dynamics
   - Survival fraction
   - Compute exportable (after backhaul)

2. **Year Deployment** (`yearSteppedDeployment.ts`) calculates:
   - Cost per compute (ground, orbit, mix)
   - Annual OPEX (ground, orbit, mix)
   - Latency (ground, orbit, mix)
   - Carbon (ground, orbit, mix)

3. **Debug State** stores all values (both raw and display):
   - `cost_per_compute_ground`, `cost_per_compute_orbit`, `cost_per_compute_mix` (display, clamped)
   - `raw_cost_per_compute_mix` (raw, unclamped for internal calculations)
   - `annual_opex_ground`, `annual_opex_orbit`, `annual_opex_mix` (display, clamped)
   - `raw_annual_opex_mix` (raw, unclamped for internal calculations)
   - `latency_ground_ms`, `latency_orbit_ms`, `latency_mix_ms`
   - `carbon_ground`, `carbon_orbit`, `carbon_mix` (display, clamped)
   - `raw_carbon_mix` (raw, unclamped for internal calculations)

4. **Timeline** (`simulationRunner.ts`) reads from debug state:
   - If debug state available: use ground truth values
   - If not available: fall back to formula-based calculations (for early years)

### Key Constants

```
groundCostPerTwh = 340  // $/TWh
groundCarbonPerTwh = 400  // kg CO2/TWh
latency_ground_ms = 120  // ms
latency_orbit_ms = 90  // ms
FLOPS_PER_TBPS = 1000  // PFLOPs per TBps
backhaul_per_satellite = 0.5  // TBps per satellite
launch_carbon_per_kg = 300  // kg CO2 per kg to LEO
baseDemandTWh = 10000  // Fixed annual demand: 10,000 TWh
techProgressFactor = pow(1.20, yearIndex / 5)  // +20% compute every 5 years
launchCostDeclineFactor = pow(0.90, yearIndex / 5)  // -10% $/kg every 5 years
demandGrowthFactor = pow(1.10, yearIndex)  // +10% demand per year
```

---

## Chart Data Flow

**E. ENSURE CHARTS USE DISPLAY VALUES:** All charts read from the debug state, which stores both raw and display (clamped) values.

### Data Flow to Charts

1. **Physics Engine** (`physicsEngine.ts`) calculates:
   - Thermal dynamics, survival fraction, compute exportable

2. **Year Deployment** (`yearSteppedDeployment.ts`) calculates:
   - Cost per compute (with tech progress factors)
   - Annual OPEX (with all-ground baseline)
   - Latency (with changing orbit share)
   - Carbon (with cumulative amortization)
   - Stores both raw and display values in debug state

3. **Debug State** stores:
   - `cost_per_compute_mix` (display, clamped to 1e7)
   - `annual_opex_ground_all_ground` (all-ground baseline for label)
   - `annual_opex_mix` (display, clamped to 1e12)
   - `carbon_mix` (display, clamped to 1e6)
   - `latency_mix_ms` (already bounded)

4. **Timeline** (`simulationRunner.ts`) reads from debug state:
   - If debug state available: uses ground truth values (display values)
   - If not available: falls back to formula-based calculations

5. **Charts** (`KpiCard.tsx`, `SimpleModeView.tsx`) read from timeline:
   - Cost/Compute: `costPerComputeMix` (from timeline, which uses `cost_per_compute_mix` from debug)
   - Annual OPEX: `opexMix` (from timeline, which uses `annual_opex_mix` from debug)
   - Carbon: `carbonMix` (from timeline, which uses `carbon_mix` from debug)
   - Latency: `latencyMixMs` (from timeline, which uses `latency_mix_ms` from debug)

**CRITICAL:** Charts MUST use display values, not raw values. All display values are clamped using the `sane()` function to prevent chart blowups from extreme values.

---

## Sanity Clamping

**Location:** `frontend/app/lib/orbitSim/yearSteppedDeployment.ts`

To prevent single weird years from wrecking charts, all display values are clamped using a sanity function:

```
function sane(x: number, maxAbs: number): number {
  if (!Number.isFinite(x)) return maxAbs;
  if (x > maxAbs) return maxAbs;
  if (x < -maxAbs) return -maxAbs;
  return x;
}
```

### Applied Clamps

```
display_cost_per_compute_mix = sane(cost_per_compute_mix, 1e7)
display_carbon_mix = sane(carbon_mix, 1e6)
display_annual_opex_mix = sane(annual_opex_mix, 1e12)
```

These clamped values are used in the debug state for UI display, preventing visualization issues from extreme values.

**CRITICAL:** Charts MUST use display values (`display_cost_per_compute_mix`, `display_annual_opex_mix`, `display_carbon_mix`), not raw values. Raw values are stored for internal calculations only.

---

## Validation Rules

### Satellite Aggregation
```
satellitesTotal MUST EQUAL classA_satellites_alive + classB_satellites_alive
```

### Survival Fraction
```
survival_fraction minimums by risk mode:
- SAFE mode: minimum 0.97 (97%) - fleet cannot die
- AGGRESSIVE mode: minimum 0.1 (10%) - fleet can degrade severely but not die
- YOLO mode: can reach 0.0 (0%) - fleet can completely die from thermal/maintenance failures
```

### Temperature Bounds
```
SAFE mode: 40°C ≤ temp_core_C ≤ 90°C
AGGRESSIVE/YOLO mode: MIN_TEMP_CORE_C ≤ temp_core_C ≤ MAX_TEMP_HARD_C (450°C)
```

### Compute Exportable
```
compute_exportable_flops ≤ compute_raw_flops × survival_fraction
compute_exportable_flops ≤ backhaul_capacity_tbps × FLOPS_PER_TBPS
```

**NOTE:** `FLOPS_PER_TBPS = 1000` is a stylized mapping between bandwidth and useful compute, not a physical relationship. It's a modeling choice for the simulation.

---

## Sanity Assertions

**Location:** `frontend/app/lib/orbitSim/yearSteppedDeployment.ts`

To surface edge-case bugs, the following warnings are logged:

```
// Cost sanity
if cost_per_compute_orbit < 0:
  console.warn("Negative orbit cost/compute")
if !Number.isFinite(cost_per_compute_orbit):
  console.warn("Orbit cost/compute not finite")

// Carbon sanity
if !Number.isFinite(carbon_orbit):
  console.warn("carbon_orbit not finite")

// Thermal sanity
if !Number.isFinite(temp_core_C):
  console.warn("temp_core_C not finite")
```

These warnings help identify calculation errors early in development.

---

## Notes

1. **Units:**
   - Power: kW (kilowatts)
   - Compute: FLOPS (floating point operations per second)
   - Mass: kg (kilograms) or tons (metric tons)
   - Cost: USD ($)
   - Carbon: kg CO2
   - Latency: ms (milliseconds)
   - Time: years

2. **Conversions:**
   - 1 PFLOP = 1e15 FLOPS
   - 1 TBps = 1e12 bits per second
   - 1 TWh = 1e12 watt-hours
   - 1 ton = 1000 kg

3. **Ground Truth:**
   - All calculations use actual satellite counts, not theoretical maximums
   - All costs are based on actual launch mass, replacement cadence, and radiator mass (physics-first)
   - All carbon is based on actual launch mass and replacement cadence
   - All compute is based on actual exportable compute (min of effective and backhaul-limited)

4. **Display vs. Raw Values:**
   - Display values are clamped using `sane()` function to prevent chart blowups
   - Raw values are stored for internal calculations and debugging
   - Charts MUST use display values, not raw values

