# 3D Financial Visualizations Integration

## Overview

This implementation follows the core principle: **2D analytics in 3D space, NOT 3D charts**.

All financial values are encoded in 2D geometry (colors, shapes, positions in 2D planes). Only spatial context is 3D.

## Components

### 1. FuturesRibbon3D
- **Purpose**: Curved ribbon orbiting Earth at fixed altitude
- **Encoding**: Cost trends via COLOR (green→teal for orbit, red→orange for ground)
- **NOT**: Z-depth encoding of cost values
- **Features**:
  - CatmullRomCurve3 ring around Earth
  - Vertical ticks for each forecast year
  - Slow rotation locked to Earth
  - Color transitions on forecast updates

### 2. UncertaintyCones3D
- **Purpose**: 2D confidence bands rendered as flat meshes above ribbon
- **Encoding**: Uncertainty via polygon shape and opacity
- **NOT**: Extruded 3D surfaces
- **Features**:
  - Inner cone (68% confidence, p16-p84)
  - Outer cone (95% confidence, p2.5-p97.5)
  - Centerline (mean forecast)
  - Billboard effect (faces camera with slight tilt)
  - Z-position does NOT encode value

### 3. SentimentParticleField
- **Purpose**: Volumetric particle system showing market mood
- **Encoding**: 
  - Vertical drift direction = sentiment (up = bullish, down = bearish)
  - Density = volatility level
  - Color = sentiment (green/red)
- **Features**:
  - Particles spawn in torus around ribbon
  - Sentiment-based vertical movement
  - Volatility-based speed jitter and spawn rate
  - Instanced rendering for performance

### 4. AnalyticsBillboard
- **Purpose**: Render 2D React components (SVG charts) as textures on 3D planes
- **Features**:
  - Always faces camera (billboard)
  - Preserves world location
  - Can be used for cost/compute/latency/carbon charts

## Integration

### Option 1: Overlay on Existing Globe

```tsx
import Futures3DScene from './components/futures/Futures3DScene';

// In your globe wrapper component:
<div style={{ position: 'relative', width: '100%', height: '100%' }}>
  <VizHubGlobe {...props} />
  <div ref={futures3DContainerRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
    <Futures3DScene containerRef={futures3DContainerRef} />
  </div>
</div>
```

### Option 2: Integrate into SimpleThreeGlobe

If using SimpleThreeGlobe, add the components directly to the scene:

```tsx
// In SimpleThreeGlobe.tsx
import FuturesRibbon3D from '../futures/FuturesRibbon3D';
import UncertaintyCones3D from '../futures/UncertaintyCones3D';
import SentimentParticleField from '../futures/SentimentParticleField';

// In the scene setup:
{sceneRef.current && cameraRef.current && futuresForecast && (
  <>
    <FuturesRibbon3D
      forecast={futuresForecast}
      type="orbit"
      earthRadius={1.0}
      ribbonAltitude={0.1}
      scene={sceneRef.current}
      camera={cameraRef.current}
    />
    {/* ... other components */}
  </>
)}
```

## Backend Validation

The router policy allocations are now validated in `VizHubGlobe.tsx`:

- **Console Debug Output** (dev mode only):
  ```javascript
  [RouterPolicy] Allocation Summary: {
    realtime: { groundEdge: X, groundCore: Y, orbit: Z },
    interactive: { ... },
    batch: { ... },
    cold: { ... },
    totalOrbitFlow: X,
    totalGroundFlow: Y,
    totalParticles: Z
  }
  ```

- **Validation Checks**:
  - Allocation sums must equal 1.0 per job type
  - Orbit share matches policy expectations
  - Traffic density matches backend volume

## Key Principles Enforced

1. ✅ **Never encode numerical variables using Z-depth**
2. ✅ **All analytic shapes remain true 2D geometry**
3. ✅ **Render analytics as PLANES/RIBBONS placed in 3D**
4. ✅ **Financial values = 2D, Spatial context = 3D**
5. ✅ **Camera and controls do NOT distort data**

## Performance Considerations

- Particle systems use `THREE.Points` with instanced rendering
- Billboard updates are optimized (only on camera change)
- Geometry is reused and updated, not recreated
- Transparent backgrounds allow overlay on existing globe

## Future Enhancements

- Hover tooltips on ribbon ticks
- Interactive year scrubbing
- Multiple strategy comparison (overlay multiple cones)
- Time-scrubber animation
- Shadow casting from cones onto Earth

