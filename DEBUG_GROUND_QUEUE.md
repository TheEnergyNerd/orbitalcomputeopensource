# Debug Ground Queue Model

## Key Files to Check

### 1. `frontend/app/lib/model/ground_queue_model.ts`
**Lines to check:**
- **Line 24**: `INITIAL_BACKLOG_GW = 50` - Initial backlog in 2025
- **Line 27-39**: `INITIAL_SUPPLY_STATE` - Starting state
- **Line 56-120**: `stepGroundSupply()` - Main queue logic
  - Line 69: `unservedGw = max(0, demandGw - capacityGw)`
  - Line 72: `deliveredFromBacklogGw = min(backlogGw, maxBuildRateGwYear)`
  - Line 75: `backlogGw = max(0, prev.backlogGw + unservedGw - deliveredFromBacklogGw)`
  - Line 88-90: Wait time calculation (smooth saturation)

**What to look for:**
- Is `capacityGw` starting at 120 (demand level) or 150?
- Is initial backlog = 50 GW?
- Does backlog grow when `unservedGw > 0`?
- Does backlog shrink when `deliveredFromBacklogGw > 0`?

### 2. `frontend/app/lib/model/ground_constraint_penalties.ts`
**Lines to check:**
- **Line 178-223**: `calculateGroundConstraintPenalties()` - Delay penalty (bounded linear)
- **Line 230-280**: `calculateHillScarcityPremium()` - Hill-based scarcity rent

**What to look for:**
- Is delay penalty linear (not exponential)?
- Is it capped at 75% of capex?
- Does Hill function use queue pressure + utilization?

### 3. `frontend/app/lib/model/physicsCost.ts`
**Lines to check:**
- **Line 802**: `useQueueModel` flag - Is queue model enabled?
- **Line 804-950**: Queue model path
  - Line 840: `capacityDeliveryPremium = 0` (should be 0)
  - Line 843: `timeToEnergizePenaltyPerPflopYear` (delay penalty)
  - Line 850-862: `calculateHillScarcityPremium()` call
  - Line 869: `siteCostPerPflopYear_base` (should NOT include premium)
  - Line 870: `siteCostPerPflopYear_effective` (includes delay + scarcity)

**What to look for:**
- Is `useQueueModel = true`?
- Is `capacityDeliveryPremium = 0`?
- Are both delayPenalty and scarcityRent being added?

## Quick Diagnostic

Add this to browser console to see the state:

```javascript
// In browser console on /compare page
const data = JSON.parse(localStorage.getItem('trajectoryData') || '[]');
data.forEach(d => {
  if (d.ground?.supplyMetrics) {
    console.log(`Year ${d.year}:`, {
      demand: d.ground.supplyMetrics.demandGw?.toFixed(1),
      capacity: d.ground.supplyMetrics.capacityGw?.toFixed(1),
      backlog: d.ground.supplyMetrics.backlogGw?.toFixed(1),
      waitYears: d.ground.supplyMetrics.avgWaitYears?.toFixed(2),
      util: (d.ground.supplyMetrics.utilizationPct * 100)?.toFixed(1) + '%',
      unserved: d.ground.supplyMetrics.unservedGw?.toFixed(1),
      price: d.ground?.gpuHourPricing?.standard?.pricePerGpuHour?.toFixed(2),
    });
  }
});
```

## Common Issues

1. **Backlog not growing**: Check if `unservedGw` is being calculated correctly
2. **Wait time stuck at 0**: Check if `backlogGw > 0` and `maxBuildRateGwYear > 0`
3. **Price not rising**: Check if `scarcityRentPerPflopYear` is being added to effective cost
4. **Capacity > demand but backlog exists**: This is the bug - backlog should be 0 when capacity >= demand

## Expected Behavior

- **2025**: backlog = 50 GW, wait ≈ 4.2 years, price should be elevated
- **2026-2030**: backlog grows as demand outruns build rate, wait increases, price rises
- **2030-2040**: If build catches up, backlog shrinks, wait decreases, price falls
- **Never**: demand < capacity AND backlog > 0 (impossible state)

