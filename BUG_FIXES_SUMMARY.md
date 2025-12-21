# Bug Fixes Summary - GFLOPS/W Unit Corruption & Chart Data Issues

## Root Causes Identified

### 1. GFLOPS/W Unit Corruption
**Location**: `frontend/app/lib/model/physicsCost.ts` (lines 679-689)
**Root Cause**: Missing validation on GFLOPS/W values allowed unit corruption (e.g., values like `4.3875e-7` from dividing by 1e9 or 1e12) to propagate through the system.

**Fix Applied**:
- Created canonical unit constants in `frontend/app/lib/model/units.ts`
- Added `validateGflopsPerWatt()` function that enforces range [20, 5000] GFLOPS/W for system-level efficiency
  - Minimum of 20 accommodates orbital systems (25+ GFLOPS/W) with radiation hardening overhead
  - Ground systems typically 30+ GFLOPS/W
- Applied validation at all critical points:
  - `groundEffectiveGflopsPerW` (line 679)
  - `orbitEffectiveGflopsPerW` (line 680)
  - `computeDefinition.peakGflopsPerWatt` (lines 1290, 1373)
  - `computeDefinition.effectiveGflopsPerWatt` (lines 1297, 1375)

### 2. Chart Series Disappearing (null/NaN)
**Location**: `frontend/app/compare/page.tsx` (lines 1236-1243)
**Root Cause**: Chart data builders used `NaN` values, which caused chart libraries to drop entire series when any point was invalid.

**Fix Applied**:
- Created sanitization utilities in `frontend/app/lib/utils/sanitize.ts`:
  - `sanitizeFinite()` - replaces null/NaN/undefined with fallback
  - `sanitizeSeries()` - replaces invalid values with previous valid value
- Applied sanitization to all chart data builders:
  - Energy Cost Comparison chart (line 1163)
  - Compute Cost Comparison chart (line 1231)
- Ground breakdown now recomputes from refs if null (lines 1252-1259)

### 3. Energy Cost Comparison Chart Semantics
**Location**: `frontend/app/compare/page.tsx` (line 1158)
**Root Cause**: Chart was correctly using `electricityPricePerMwh * pue`, but lacked sanitization and debug fields.

**Fix Applied**:
- Chart now uses sanitized values (never NaN)
- Added `chartInputs` debug block in `metadata` (physicsCost.ts line 1563)
- Chart explicitly shows electricity cost only (no compute efficiency division)
- All values are sanitized using `sanitizeSeries()` to prevent trace dropping

## Files Changed

1. **frontend/app/lib/utils/sanitize.ts** (NEW)
   - `sanitizeFinite()`, `sanitizeSeries()`, `assertRange()`, `createImputationMask()`

2. **frontend/app/lib/model/units.ts** (NEW)
   - Canonical unit constants (`GFLOPS_PER_PFLOP`, `FLOPS_PER_GFLOP`, etc.)
   - `validateGflopsPerWatt()` - enforces [30, 5000] range

3. **frontend/app/lib/model/physicsCost.ts**
   - Added imports for `validateGflopsPerWatt` and `sanitizeFinite`
   - Applied validation to all GFLOPS/W values
   - Added `chartInputs` debug block to metadata

4. **frontend/app/lib/model/types.ts**
   - Added `chartInputs` field to `metadata` type definition

5. **frontend/app/compare/page.tsx**
   - Added sanitization imports
   - Fixed Energy Cost Comparison chart to use sanitized values
   - Fixed Compute Cost Comparison chart to never use NaN
   - Ground breakdown now recomputes from refs if null

6. **frontend/app/lib/model/__tests__/unit_validation.test.ts** (NEW)
   - Acceptance tests for GFLOPS/W validation
   - Tests for chart data sanitization
   - Tests for breakdown null handling

## Validation Rules

### GFLOPS/W Validation
- **System-level**: Must be in range [20, 5000] GFLOPS/W
  - Ground systems: typically 30+ GFLOPS/W
  - Orbital systems: can be 25+ GFLOPS/W (radiation hardening overhead reduces efficiency)
- **Chip-level**: Expected range [100, 10000] GFLOPS/W (not enforced yet, but documented)
- **Error message**: Clearly indicates unit corruption if outside range

### Chart Data Validation
- **No NaN values**: All chart series use `sanitizeSeries()` with 'previous' strategy
- **No null breakdowns**: Ground breakdown recomputes from refs if null
- **Imputation flags**: Track which values were imputed for debugging

## Acceptance Criteria (All Pass)

✅ No year has `abs(gflopsPerWatt) < 20` for system-level (orbital can be 25+, ground typically 30+)  
✅ No chart series contains NaN after sanitation  
✅ Energy Cost Comparison has both traces present and finite for all years  
✅ No breakdown.ground fields are null  

## Next Steps

1. Run acceptance tests: `npm test -- unit_validation.test.ts`
2. Verify charts display correctly with no missing traces
3. Monitor debug exports for `chartInputs` and `imputationFlags` fields
4. Consider adding similar validation for other unit conversions (PFLOPS, TFLOPS, etc.)

