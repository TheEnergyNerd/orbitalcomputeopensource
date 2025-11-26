"""
Orbital Propagation and Physics Model
Handles satellite position, sunlight calculation, and latency modeling
"""
import math
from datetime import datetime, timezone
from typing import List, Dict, Tuple
from skyfield.api import load, EarthSatellite
from skyfield.positionlib import Geocentric

ts = load.timescale()

# Load ephemeris once
eph = load("de421.bsp")
earth_obj = eph["earth"]
sun_obj = eph["sun"]

def compute_sunlit(sat_pos: Geocentric, earth_pos: Geocentric, sun_pos: Geocentric) -> bool:
    """
    Determine if satellite is sunlit (not in Earth's shadow)
    """
    sat_vec = sat_pos.position.km
    earth_vec = earth_pos.position.km
    sun_vec = sun_pos.position.km
    
    # Vector from Earth to satellite
    sat_rel = [sat_vec[i] - earth_vec[i] for i in range(3)]
    # Vector from Earth to Sun
    sun_rel = [sun_vec[i] - earth_vec[i] for i in range(3)]
    
    # Calculate magnitudes
    sat_mag = math.sqrt(sum(sat_rel[i] ** 2 for i in range(3)))
    sun_mag = math.sqrt(sum(sun_rel[i] ** 2 for i in range(3)))
    
    if sat_mag == 0 or sun_mag == 0:
        return True
    
    # Normalize vectors
    sat_rel_norm = [sat_rel[i] / sat_mag for i in range(3)]
    sun_rel_norm = [sun_rel[i] / sun_mag for i in range(3)]
    
    # Dot product
    dot_norm = sum(sat_rel_norm[i] * sun_rel_norm[i] for i in range(3))
    dot_norm = max(-1.0, min(1.0, dot_norm))
    
    # Earth radius
    earth_radius_km = 6371.0
    sat_dist = sat_mag
    shadow_angle = math.asin(earth_radius_km / sat_dist) if sat_dist > earth_radius_km else math.pi / 2
    umbra_angle = math.pi - shadow_angle
    
    # Check if in shadow
    if dot_norm <= 0:
        angle_rad = math.acos(dot_norm)
        if angle_rad > umbra_angle:
            return False
        # Penumbra threshold
        penumbra_threshold = math.radians(100)
        if angle_rad > penumbra_threshold:
            return False
    
    return True

def propagate_satellites(
    satellites: List[EarthSatellite],
    t: datetime
) -> List[Dict]:
    """
    Propagate all satellites to given time and return orbital node data
    """
    skyfield_t = ts.from_datetime(t)
    earth_pos = earth_obj.at(skyfield_t)
    sun_pos = sun_obj.at(skyfield_t)
    
    nodes = []
    for i, sat in enumerate(satellites):
        try:
            geocentric = sat.at(skyfield_t)
            subpoint = geocentric.subpoint()
            
            lat = subpoint.latitude.degrees
            lon = subpoint.longitude.degrees
            alt_km = subpoint.elevation.km
            
            is_sunlit = compute_sunlit(geocentric, earth_pos, sun_pos)
            
            nodes.append({
                "id": f"sat_{i}",
                "lat": lat,
                "lon": lon,
                "altKm": alt_km,
                "isSunlit": is_sunlit,
                "geocentric": geocentric,
            })
        except Exception:
            continue
    
    return nodes

def calculate_latency_to_gateway(
    sat_lat: float,
    sat_lon: float,
    sat_alt_km: float,
    gateway_lat: float,
    gateway_lon: float
) -> float:
    """
    Calculate latency from satellite to gateway
    Uses straight-line distance with speed of light
    """
    # Haversine for ground distance
    R = 6371.0  # Earth radius in km
    dlat = math.radians(gateway_lat - sat_lat)
    dlon = math.radians(gateway_lon - sat_lon)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(sat_lat)) * math.cos(math.radians(gateway_lat)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    ground_dist = R * c
    
    # 3D distance including altitude
    total_dist = math.sqrt(ground_dist**2 + sat_alt_km**2)
    
    # Speed of light in km/s
    c_km_per_s = 299792.458
    
    # One-way propagation delay in ms
    latency_ms = (total_dist / c_km_per_s) * 1000
    
    # Add fixed overhead per hop (processing, routing, etc.)
    overhead_ms = 2.0
    
    return latency_ms + overhead_ms

def find_nearest_gateway(
    sat_lat: float,
    sat_lon: float,
    gateways: List[Dict]
) -> Tuple[str, float]:
    """
    Find nearest gateway to satellite and return (gateway_id, latency_ms)
    """
    min_dist = float("inf")
    nearest_id = ""
    
    for gw in gateways:
        latency = calculate_latency_to_gateway(
            sat_lat, sat_lon, 550,  # Assume ~550km altitude
            gw["lat"], gw["lon"]
        )
        if latency < min_dist:
            min_dist = latency
            nearest_id = gw["id"]
    
    return nearest_id, min_dist

