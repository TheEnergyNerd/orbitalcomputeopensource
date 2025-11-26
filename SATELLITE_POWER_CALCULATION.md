# Satellite Power Calculation

## Overview
The satellite power calculation in this simulation is based on the satellite's sunlit status and utilization.

## How Sunlit Status is Determined

The simulation uses a geometric calculation to determine if a satellite is in sunlight or Earth's shadow:

```python
def compute_sunlit(sat_pos, earth_pos, sun_pos):
    """Check if satellite is sunlit"""
    # Get position vectors in kilometers
    sat_vec = sat_pos.position.km
    earth_vec = earth_pos.position.km
    sun_vec = sun_pos.position.km
    
    # Vector from Earth to satellite
    sat_rel = sat_vec - earth_vec
    # Vector from Earth to Sun
    sun_rel = sun_vec - earth_vec
    
    # Check if satellite is in Earth's shadow
    # Dot product: if > 0, satellite is on the sunward side (sunlit)
    # if < 0, satellite is on the opposite side (in shadow)
    dot = sum(sat_rel[i] * sun_rel[i] for i in range(3))
    return dot > 0
```

**How it works:**
1. **Position vectors**: Gets the 3D position (in kilometers) of the satellite, Earth, and Sun at the current time
2. **Relative vectors**: Calculates vectors from Earth to the satellite and from Earth to the Sun
3. **Dot product check**: Computes the dot product of these two vectors
   - If dot product > 0: The satellite is on the same side of Earth as the Sun → **Sunlit** ☀️
   - If dot product < 0: The satellite is on the opposite side of Earth from the Sun → **In Shadow** 🌑
4. **Real-time updates**: This calculation runs every second for all satellites using their current orbital positions

**Data sources:**
- Satellite positions: Calculated from TLE (Two-Line Element) data using Skyfield library
- Earth and Sun positions: From NASA's DE421 ephemeris data (loaded via `load("de421.bsp")`)
- Time: Current UTC time, updated every second

This is a simplified shadow model that doesn't account for:
- Penumbra (partial shadow)
- Atmospheric refraction
- Exact umbra geometry

However, it provides a good approximation for determining power availability.

## Formula

### Capacity (MW)
```python
capacity_mw = 0.10 if sunlit else 0.02
```

- **Sunlit satellites**: 0.10 MW (100 kW) capacity
- **Satellites in shadow**: 0.02 MW (20 kW) capacity

This reflects that satellites in sunlight can generate more power from their solar panels, while those in Earth's shadow rely on battery power with reduced capacity.

### Power Usage (MW)
For orbital hubs (groups of satellites):
```python
power_mw = utilization * 0.1 * len(satellites_in_hub)
```

Where:
- `utilization`: 0-1 value representing how much of the satellite's compute capacity is being used
- `0.1 MW`: Base power per satellite when fully utilized
- `len(satellites_in_hub)`: Number of satellites in the hub

## Notes

1. **Capacity varies by sunlit status**: The 5x difference (0.10 vs 0.02 MW) represents the reduced power availability when satellites are in Earth's shadow.

2. **Utilization-based power**: The actual power consumption scales with utilization, so an idle satellite uses less power than a fully utilized one.

3. **Hub aggregation**: When satellites are grouped into hubs (for routing efficiency), their power is aggregated.

4. **Simulation vs Reality**: These values are simplified for simulation purposes. Real Starlink satellites have different power characteristics:
   - Real Starlink v1.5 satellites have ~2.9 kW solar array capacity
   - The 0.10 MW (100 kW) value in this simulation is **not accurate** for real Starlink satellites
   - This is a **simplified model** for demonstrating orbital compute concepts
   - The simulation assumes satellites have compute capabilities that real Starlink satellites don't currently have
   - For a more realistic model, values would be closer to 0.003 MW (3 kW) for sunlit satellites

## Utilization Calculation

Utilization is calculated differently for orbital hubs vs individual satellites:

### Orbital Hubs (groups of satellites)
```python
utilization = min(1.0, jobs_running / 50.0)  # Capacity of 50 jobs per hub
```
- Based on actual jobs running in the hub
- Capped at 1.0 (100% utilization)
- Each hub can handle up to 50 concurrent jobs

### Individual Satellites (not in hubs)
```python
if sunlit:
    utilization = random.uniform(0.3, 0.9)  # 30-90% utilization
else:
    utilization = random.uniform(0.0, 0.2)  # 0-20% utilization (battery power)
```
- Random value based on sunlit status
- Sunlit satellites have higher utilization (more power available)
- Satellites in shadow have lower utilization (limited battery power)

