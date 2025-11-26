# Sandbox Mode Documentation

## Overview
Sandbox mode is an interactive exploration tool that lets you experiment with different compute infrastructure configurations by adjusting orbital compute units and ground data center capacity.

## How It Works

### Core Concept
The sandbox allows you to:
1. **Add Orbital Compute Units** - Increase the number of orbital compute satellites
2. **Reduce Ground DCs** - Decrease the number of ground data centers
3. **See Real-Time Impact** - Watch metrics change as you adjust the configuration

### Controls

#### Orbital Compute Units
- **Range**: 0-100 units
- **Effect**: Each unit represents a percentage of orbital compute capacity
- **Visualization**: More satellites appear on the globe as you add units
- **Power**: Each satellite uses **0.1 MW (100 kW)** in sandbox mode (demonstration value, not realistic)

#### Ground DC Reduction
- **Range**: 0-100% reduction
- **Effect**: Removes ground data centers proportionally
- **Visualization**: Ground sites fade out as reduction increases
- **Impact**: Reduces cooling costs, energy consumption, and carbon footprint

### Presets

1. **All Earth** (0 orbital, 0% reduction)
   - Traditional ground-only infrastructure
   - Highest latency, highest energy costs

2. **Hybrid 2035** (30 orbital, 0% reduction)
   - Balanced mix of ground and orbital compute
   - Moderate improvements across all metrics

3. **Orbit-Dominant 2060** (75 orbital, 20% reduction)
   - Mostly orbital compute with reduced ground infrastructure
   - Significant latency and cost improvements

4. **100% Orbit** (100 orbital, 100% reduction)
   - Fully orbital compute infrastructure
   - Maximum efficiency, lowest latency

### Visual Indicators

#### Satellite Display
- **Yellow/Gold**: Sunlit satellites (powered by solar)
- **Cyan/Blue**: Satellites in Earth's shadow (battery-powered)
- **Size**: Varies based on utilization (4-6 pixels)
- **Count**: Shows up to 2x more satellites than simulator mode for better visualization

#### Ground Sites
- **Green**: Normal operation
- **Red**: Surge event active (North America sites)
- **Opacity**: Fades when in "Mostly Space Mode" (>50% orbit share)

#### Job Flows
- **Blue arcs**: Orbital job flows (ground → satellite)
- **Green lines**: Ground job flows (ground → ground)
- **Count**: Increases with orbit share

### Metrics

The sandbox calculates and displays:

1. **Energy Relief**: Percentage reduction in energy costs
2. **Carbon Reduction**: Percentage reduction in carbon emissions
3. **Avg Latency**: Average job latency (decreases with orbit share)
4. **Cooling Saved**: Annual cooling cost savings (orbit has no cooling needs)

### Mostly Space Mode

When orbital compute exceeds 50% of total capacity:
- Ground sites become more transparent
- Satellites become slightly larger
- Visual emphasis shifts to orbital infrastructure
- Special indicator appears showing "🌌 Mostly Space Compute Mode Active"

### Surge Event Demo

The sandbox includes a "Surge Event" demo button that:
1. Triggers a simulated traffic surge in North America
2. Ground sites turn red to show stress
3. Automatically adds 3 orbital compute units to handle the surge
4. Demonstrates how orbital compute can handle sudden demand spikes

### How It Differs from Simulator Mode

| Feature | Simulator Mode | Sandbox Mode |
|---------|---------------|--------------|
| **Satellite Power** | 0.003 MW (realistic) | 0.1 MW (demonstration) |
| **Data Source** | Real Starlink TLE data | Same data, different visualization |
| **Interactivity** | View-only with scenarios | Fully interactive controls |
| **Purpose** | Realistic simulation | Educational exploration |
| **Satellite Count** | All 8938 satellites | Subset based on orbital units |

### Technical Details

#### Orbit Share Calculation
```
orbitShare = orbitalComputeUnits / (orbitalComputeUnits + (100 - groundDCReduction)) * 100
```

#### Visible Satellites
```
baseVisibleSats = (orbitalComputeUnits / 100) * totalSatellites
numVisibleSats = min(baseVisibleSats * 2.0, totalSatellites)
```

#### Metric Calculations
- **Latency**: Decreases linearly with orbit share (45ms → 5ms)
- **Energy Cost**: Decreases with orbit share (less cooling, more solar)
- **Carbon**: Decreases proportionally with ground DC reduction
- **Cooling**: Eliminated as ground DCs are reduced

### Use Cases

1. **Education**: Understand the trade-offs between ground and orbital compute
2. **Planning**: Explore different infrastructure configurations
3. **Demonstration**: Show stakeholders the benefits of orbital compute
4. **Experimentation**: Test "what-if" scenarios without affecting real systems

### Tips

- Start with "Hybrid 2035" preset to see a balanced configuration
- Use the slider for fine-grained control
- Watch the metrics panel to see real-time impact
- Try the surge event demo to see orbital compute handle sudden demand
- Experiment with extreme configurations (100% orbit) to see theoretical limits

