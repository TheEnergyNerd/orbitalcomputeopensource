# Orbital Compute Model (Physics-Based Economics)

This directory contains the core mathematical and physical derivations used to calculate the economics of orbital compute vs. ground-based infrastructure. It is designed to be self-contained and open-source ready.

## 📂 Core Modules

- **`orbitalPhysics.ts`**: The "Truth Source" for physics-based derivations.
  - Sizing thermal radiators using the Stefan-Boltzmann Law.
  - Sizing power systems based on solar irradiance and Starlink empirical data.
  - Calculating chip failure rates and effective throughput (PFLOPS).
  - Interconnect modeling (NVLink intra-sat vs ISL inter-sat).
- **`physicsCost.ts`**: The hybrid economic engine.
  - Integrates orbital physics with ground-based infrastructure constraints.
  - Handles LCOE (Levelized Cost of Energy) calculations for orbit.
  - Implements ground grid/cooling/land bottleneck multipliers.
  - Converts abstract $/PFLOP-year into market pricing ($/GPU-hour).
- **`trajectory.ts`**: Simulation engine for multi-year projections.
  - Interpolates learning curves (Wright's Law) for launch and hardware.
  - Generates year-by-year data points for economic comparison.
- **`types.ts`**: Standardized data structures.
  - Defines `YearParams` (inputs) and `YearlyBreakdown` (outputs).

## 🚀 Key Derivations

### 1. Thermal Rejection
We derive the required radiator area using:
\[ Q = \epsilon \cdot \sigma \cdot A \cdot (T_{radiator}^4 - T_{sink}^4) \]
Where \(T_{sink}\) is modeled at 250K for LEO to account for Earth IR and Albedo.

### 2. GPU Pricing ($/Hour)
We transform capital and operational expenditures into market-comparable rates:
\[ Price_{hour} = \frac{Cost_{year} \cdot PFLOPS_{GPU}}{Hours_{year} \cdot Utilization} \cdot (1 + Margin) \]
This includes buffers for SLA risk, spares, and interconnect overhead.

### 3. Ground Constraints
Ground costs are not static. We model 4 primary bottlenecks:
- **Grid Multiplier**: Increasing cost of power distribution.
- **Cooling/Water**: Scarcity of low-cost heat rejection.
- **Land Scarcity**: Proximity to fiber vs. availability of space.
- **SMR Mitigation**: Capping constraints via modular nuclear adoption.

## 🔬 Parity with Simulator
The calculations in this directory are the **exact same** calculations used by the main orbital simulator's economic engine. This ensures that standalone economic research tools and complex game simulations remain physically consistent.

