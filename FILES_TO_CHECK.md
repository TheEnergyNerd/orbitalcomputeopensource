# Files to Check for Ground Queue Issues

## 🔴 CRITICAL FILES (Check These First)

### 1. `frontend/app/lib/model/ground_queue_model.ts`
**What it does:** Core queue model logic
**Key sections:**
- **Line 24-25**: Initial backlog = 50 GW, build rate = 12 GW/year
- **Line 27-39**: Initial state (capacity = 120, backlog = 50)
- **Line 56-119**: `stepGroundSupply()` - Main queue update logic
  - Line 69: `unservedGw = max(0, demandGw - capacityGw)` 
  - Line 72: `deliveredFromBacklogGw = min(backlogGw, maxBuildRateGwYear)`
  - Line 75: `backlogGw = max(0, prev.backlogGw + unservedGw - deliveredFromBacklogGw)`
  - Line 88-90: Wait time (smooth saturation, NOT hard clamp)

**Check:** Is backlog growing when it shouldn't? Is wait time stuck at max?

### 2. `frontend/app/lib/model/physicsCost.ts`
**What it does:** Uses queue model to compute costs
**Key sections:**
- **Line 802**: `useQueueModel` flag - MUST be true
- **Line 804-950**: Queue model path
  - Line 840: `capacityDeliveryPremium = 0` (should be 0, not used)
  - Line 843: `timeToEnergizePenaltyPerPflopYear` (delay penalty)
  - Line 852-863: `calculateHillScarcityPremium()` call
  - Line 870: Effective cost includes delay + scarcity

**Check:** 
- Is `useQueueModel = true`?
- Is `capacityDeliveryPremium = 0`?
- Are delayPenalty and scarcityRent being added correctly?

### 3. `frontend/app/lib/model/ground_constraint_penalties.ts`
**What it does:** Computes delay penalty and scarcity rent
**Key sections:**
- **Line 178-223**: `calculateGroundConstraintPenalties()` - Delay penalty (bounded linear)
- **Line 230-280**: `calculateHillScarcityPremium()` - Hill-based scarcity

**Check:**
- Delay penalty should be linear: `capex * wacc * waitYears` (capped at 75% of capex)
- Scarcity uses: `queuePressure = backlogGW / (backlogGW + 100)`
- Scarcity uses: `utilPressure = sigmoid(utilization - 0.88)`

## 🟡 SECONDARY FILES

### 4. `frontend/app/compare/page.tsx`
**What it does:** Displays the charts
**Check:** Is the GPU-hour chart showing correct data?

## 🐛 Common Issues to Look For

1. **Backlog exists when capacity > demand**
   - **Symptom:** `demandGw < capacityGw` but `backlogGw > 0`
   - **Fix:** Backlog should shrink when `unservedGw = 0`
   - **Check:** Line 75 in `ground_queue_model.ts`

2. **Wait time stuck at max (6-8 years)**
   - **Symptom:** `avgWaitYears = 8` even when backlog is small
   - **Fix:** Smooth saturation should prevent this
   - **Check:** Line 88-90 in `ground_queue_model.ts`

3. **Price not rising with backlog**
   - **Symptom:** Ground price flat even when backlog grows
   - **Fix:** Check if `scarcityRentPerPflopYear` is being added
   - **Check:** Line 870 in `physicsCost.ts`

4. **Triple-charging (price too high)**
   - **Symptom:** Ground price way too high
   - **Fix:** `capacityDeliveryPremium` should be 0
   - **Check:** Line 840 in `physicsCost.ts`

## 🔍 Quick Debug Commands

Open browser console on `/compare` page and run:

```javascript
// Get trajectory data
const trajectory = window.trajectoryData || [];

// Check queue state
trajectory.forEach(d => {
  const g = d.ground?.supplyMetrics;
  if (g) {
    const issue = (g.demandGw < g.capacityGw && g.backlogGw > 10) ? '⚠️' : '✓';
    console.log(`${issue} ${d.year}: demand=${g.demandGw?.toFixed(1)}, capacity=${g.capacityGw?.toFixed(1)}, backlog=${g.backlogGw?.toFixed(1)}, wait=${g.avgWaitYears?.toFixed(2)}`);
  }
});

// Check pricing
trajectory.forEach(d => {
  const price = d.ground?.gpuHourPricing?.standard?.pricePerGpuHour;
  const delay = d.ground?.constraints?.delayPenalty;
  const scarcity = d.ground?.constraints?.scarcityRentPerPflopYear;
  console.log(`${d.year}: price=$${price?.toFixed(2)}, delay=$${delay?.toFixed(0)}, scarcity=$${scarcity?.toFixed(0)}`);
});
```

## 📊 Expected Behavior

- **2025**: backlog=50, wait≈4.2yr, price elevated
- **2026-2030**: If demand grows faster than build rate, backlog grows, wait increases, price rises
- **2030+**: If build catches up, backlog shrinks, wait decreases, price falls
- **NEVER**: `demand < capacity` AND `backlog > 0` (unless backlog is from previous years being cleared)

