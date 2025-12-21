# Coupled Slider Implementation

## Overview

A physical consistency system for sliders that ensures parameters maintain valid relationships. Some sliders are **independent** (user-set) while others are **derived** (auto-calculated).

## Files Created

1. **`frontend/app/lib/ui/sliderCoupling.ts`** - Core coupling logic and configurations
2. **`frontend/app/lib/ui/useCoupledSliders.ts`** - React hook for managing coupled sliders
3. **`frontend/app/components/ui/DerivedValue.tsx`** - Component to display read-only derived values
4. **`frontend/app/components/ui/ValidationWarnings.tsx`** - Component to display validation warnings/errors

## Key Features

### 1. Slider Types

- **Independent**: User can freely adjust (e.g., `targetGW`, `flopsPerWattOrbital2025`)
- **Derived**: Auto-calculated from independent sliders (e.g., `powerRequiredKw`, `totalSatelliteMassKg`)
- **Constrained**: User can adjust within physics-valid range (future enhancement)

### 2. Physical Coupling Chains

#### Power-Mass Chain
```
Target Compute (PFLOPs) → Power (kW) → Total Mass (kg) → Launch Cost
         ↓                    ↓              ↓
    GFLOPS/W            Solar Mass     Launch Cost
   (efficiency)         Radiator Mass
                        Battery Mass
                        Structure Mass
```

#### Thermal Chain
```
Power (kW) → Waste Heat (kW) → Radiator Area (m²) → Radiator Mass
                    ↑                   ↑
            Compute Efficiency    Radiator Temp
```

### 3. Validation

The system automatically validates configurations and shows:
- **Errors**: Impossible configurations (e.g., radiator area > 500m²)
- **Warnings**: Unrealistic but possible configs (e.g., satellite mass > 20,000kg)
- **Info**: Helpful suggestions (e.g., power density limits)

## Usage Example

```tsx
import { useCoupledSliders } from '../lib/ui/useCoupledSliders';
import { DerivedValue } from '../components/ui/DerivedValue';
import { ValidationWarnings } from '../components/ui/ValidationWarnings';

function MyComponent() {
  const {
    values,
    derivedValues,
    warnings,
    updateValue,
    isDerived,
  } = useCoupledSliders({
    initialValues: {
      targetGW: 1,
      flopsPerWattOrbital2025: 1500,
      specificPower2025: 36.5,
      launchCost2025: 1500,
    },
  });

  return (
    <div>
      {/* Independent sliders */}
      <Slider
        label="Target Capacity"
        value={values.targetGW}
        onChange={(v) => updateValue('targetGW', v)}
        disabled={isDerived('targetGW')}
      />

      {/* Derived values (read-only) */}
      <DerivedValue
        label="Power Required"
        value={derivedValues.powerRequiredKw}
        unit=" kW"
      />
      <DerivedValue
        label="Total Mass"
        value={derivedValues.totalSatelliteMassKg}
        unit=" kg"
      />

      {/* Validation warnings */}
      <ValidationWarnings warnings={warnings} />
    </div>
  );
}
```

## Integration into Compare Page

To integrate into `frontend/app/compare/page.tsx`:

1. **Import the hook and components**:
```tsx
import { useCoupledSliders } from '../lib/ui/useCoupledSliders';
import { DerivedValue } from '../components/ui/DerivedValue';
import { ValidationWarnings } from '../components/ui/ValidationWarnings';
```

2. **Initialize the hook** (replace existing state management):
```tsx
const coupledSliders = useCoupledSliders({
  initialValues: {
    targetGW,
    flopsPerWattOrbital2025,
    specificPower2025,
    launchCost2025,
    // ... other independent values
  },
  allParams: {
    // Any additional parameters needed for calculations
  },
});
```

3. **Update sliders to use the hook**:
```tsx
// Instead of:
<Slider value={targetGW} onChange={setTargetGW} />

// Use:
<Slider 
  value={coupledSliders.values.targetGW} 
  onChange={(v) => coupledSliders.updateValue('targetGW', v)}
  disabled={coupledSliders.isDerived('targetGW')}
/>
```

4. **Display derived values**:
```tsx
<SliderGroup title="Derived Values">
  <DerivedValue
    label="Power Required"
    value={coupledSliders.derivedValues.powerRequiredKw}
    unit=" kW"
  />
  <DerivedValue
    label="Total Satellite Mass"
    value={coupledSliders.derivedValues.totalSatelliteMassKg}
    unit=" kg"
  />
  <DerivedValue
    label="Launch Cost per Satellite"
    value={coupledSliders.derivedValues.launchCostPerSatellite}
    unit=" $"
  />
</SliderGroup>
```

5. **Show validation warnings**:
```tsx
<ValidationWarnings warnings={coupledSliders.warnings} />
```

## Presets

Presets that maintain physical consistency can be added:

```tsx
const PRESETS = {
  '2025_baseline': {
    targetGW: 1,
    flopsPerWattOrbital2025: 1500,
    specificPower2025: 36.5,
    launchCost2025: 1500,
    radiatorTempC: 70,
  },
  '2030_optimistic': {
    targetGW: 1,
    flopsPerWattOrbital2025: 3000,
    specificPower2025: 200,
    launchCost2025: 75,
    radiatorTempC: 70,
  },
  '2040_aggressive': {
    targetGW: 1,
    flopsPerWattOrbital2025: 8000,
    specificPower2025: 300,
    launchCost2025: 20,
    radiatorTempC: 70,
  },
};

// Apply preset:
<button onClick={() => coupledSliders.updateValues(PRESETS['2025_baseline'])}>
  Load 2025 Baseline
</button>
```

## Ground Constraint Coupling

Ground constraints are already correctly implemented in `physicsCost.ts`:

- Constraint multiplier is calculated from growth rates and demand pressure
- Site cost = `BASE_SITE_2025 * constraintMultiplier`
- Energy cost = `BASE_ENERGY_2025 * constraintMultiplier`

When constraint sliders change, the physics model automatically recalculates costs. No additional coupling needed for ground constraints.

## Next Steps

1. **Integrate into compare page** - Replace existing slider state with `useCoupledSliders`
2. **Add more derived values** - Expand the coupling chain as needed
3. **Add presets** - Create preset configurations that maintain consistency
4. **UI polish** - Style derived value displays to match existing design
5. **Performance** - Optimize calculations if needed for real-time updates

## Testing

To test the coupling:

1. Change `targetGW` → should update `powerRequiredKw`
2. Change `flopsPerWattOrbital2025` → should update `powerRequiredKw`
3. Change `powerRequiredKw` (via dependencies) → should update `wasteHeatKw`, `radiatorAreaM2`, `totalSatelliteMassKg`
4. Set unrealistic values → should show validation warnings

## Notes

- Derived sliders cannot be directly edited (they're read-only)
- All calculations use physics-based formulas
- Validation warnings help prevent impossible configurations
- The system maintains dependency order automatically

