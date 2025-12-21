# Regional Ground Supply Model - Now Enabled

## Changes Made

### 1. Added Demand Conversion Utilities (`ground_supply_model.ts`)

- **`convertPflopsToMw()`**: Converts compute demand from PFLOPS to power demand in MW
  - Accounts for PUE and utilization
  - Formula: `MW = (PFLOPS * 1e6 / GFLOPS_per_W) * PUE / utilization / 1e6`

- **`getGlobalDemandPflops()`**: Calculates global datacenter compute demand trajectory
  - 120 GW in 2025 → 2000 GW in 2050 (exponential growth)
  - Converts power trajectory to PFLOPS based on current year's efficiency

### 2. Updated Regional Model Integration (`physicsCost.ts`)

- Changed from `targetGW * 1000` to `getGlobalDemandPflops(year, flopsPerWattGround)`
- Uses proper global demand trajectory instead of rough estimate
- Enhanced constraint breakdown with regional allocation data

### 3. Enabled Regional Model (`compare/page.tsx`)

- Set `useRegionalGroundModel: true` by default
- Regional model now active when `groundConstraintsEnabled` is true

## Expected Behavior

| Year | Demand (GW) | Capacity (GW) | Utilization | Avg $/MWh | Ground $/PFLOP-yr |
|------|-------------|---------------|-------------|-----------|-------------------|
| 2025 | 120 | 150 | 80% | $65 | ~$7,000 |
| 2030 | 300 | 250 | 95%+ | $90 | ~$12,000 |
| 2035 | 500 | 400 | 95%+ | $120 | ~$18,000 |
| 2040 | 800 | 600 | 95%+ | $150 | ~$25,000 |
| 2050 | 2000 | 1200 | 95%+ | $180 | ~$35,000 |

## Key Differences from Constraint Multiplier Model

1. **Costs saturate** as regions fill (not exponential forever)
2. **Backlog grows** when demand > capacity (shows unmet demand)
3. **Regional breakdown** shows where compute goes (8 regions)
4. **Constraint severity** is 0-1 metric (not 5000x multiplier)
5. **Training vs Inference** split (latency-sensitive workloads go to low-latency regions)

## Regional Allocation

The model allocates demand across 8 regions:
- **Tier 1** (Cheap hydro): Quebec, Nordics
- **Tier 2** (US grid): ERCOT, PJM, MISO, CAISO
- **Tier 3** (International): Gulf States, Asia-Pacific
- **Tier 4** (Emerging): Latin America

Training workloads go to cheapest regions first.
Inference workloads prioritize low-latency regions.

## Validation

After enabling, verify:
- Ground 2025: $5,000 - $10,000 (not $1.2M)
- Ground increases but saturates (not exponential)
- Ground 2050: < $50,000 (not $111k or $1M)
- Crossover: 2035-2042 (not 2025)
- Regional allocations present in breakdown

## Disabling Regional Model

To revert to constraint multiplier model:
```typescript
useRegionalGroundModel: false
```

The constraint multiplier model will be used instead.

