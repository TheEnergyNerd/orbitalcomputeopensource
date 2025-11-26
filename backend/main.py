"""
Orbital Compute Control Room - Backend
FastAPI server with satellite propagation and simulation engine
"""
import asyncio
import json
import os
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
from skyfield.api import load, EarthSatellite
import os

from api.sim_routes import router as sim_router
from routes.state import router as state_router
from sim import world_instance
from services.starlink import get_starlink_service

app = FastAPI(title="Orbital Compute Control Room API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Compression middleware for large responses
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Include new RL-lite API routes
app.include_router(sim_router, prefix="/api")
# Include SystemState API routes
app.include_router(state_router, prefix="/api")

# Global state
sim_state = None
sim_lock = asyncio.Lock()
satellites: List[EarthSatellite] = []
all_satellites_global = []  # Store all satellites separately to avoid truncation
ts = load.timescale()
control = {
    "tick": 0,
    "scenario": {"mode": "normal", "orbitOffloadPercent": 30},
}

# GridStatus API
GRIDSTATUS_API_KEY = os.getenv("GRIDSTATUS_API_KEY", "c3d545c3907c4a5a9c2f28c7b96a8f64")
GRIDSTATUS_BASE_URL = "https://api.gridstatus.io/v1"
energy_prices_cache = {}  # Cache for energy prices by region

# Topology
TOPOLOGY = {
    "groundSites": [
        {"id": "abilene_edge", "label": "Abilene Edge DC", "lat": 32.45, "lon": -99.74},
        {"id": "nova_hub", "label": "Northern Virginia Hyperscale", "lat": 39.02, "lon": -77.48},
        {"id": "dfw_hub", "label": "Dallas–Fort Worth Hyperscale", "lat": 32.92, "lon": -96.96},
        {"id": "phx_hub", "label": "Phoenix Hyperscale", "lat": 33.45, "lon": -112.07},
    ],
    "gateways": [
        {"id": "abilene_gateway", "label": "Abilene Gateway", "lat": 32.6, "lon": -99.5},
        {"id": "dfw_gateway", "label": "DFW Gateway", "lat": 33.0, "lon": -97.0},
        {"id": "nova_gateway", "label": "NoVA Gateway", "lat": 39.1, "lon": -77.5},
        {"id": "phx_gateway", "label": "Phoenix Gateway", "lat": 33.4, "lon": -112.0},
    ],
}

# Workload profile (synthetic for now)
WORKLOAD_PROFILE = {
    "hourly_arrival_rates": [
        0.8, 0.6, 0.5, 0.4, 0.5, 0.7, 1.0, 1.2, 1.4, 1.5, 1.4, 1.3,
        1.2, 1.1, 1.0, 1.1, 1.2, 1.3, 1.4, 1.3, 1.1, 0.9, 0.8, 0.7,
    ],
    "job_classes": [
        {
            "name": "inference",
            "deadline_ms": 20,
            "size_dist": {"type": "lognormal", "mu": 2.0, "sigma": 0.5},
            "fraction": 0.6,
        },
        {
            "name": "training",
            "deadline_ms": 1000,
            "size_dist": {"type": "lognormal", "mu": 3.5, "sigma": 0.8},
            "fraction": 0.25,
        },
        {
            "name": "batch",
            "deadline_ms": 5000,
            "size_dist": {"type": "lognormal", "mu": 4.0, "sigma": 1.0},
            "fraction": 0.15,
        },
    ],
}

# Pydantic models - Updated to match new SimState contract
class Satellite(BaseModel):
    id: str
    lat: float
    lon: float
    alt_km: float
    sunlit: bool
    utilization: float  # 0–1 compute availability
    capacityMw: float
    nearestGatewayId: str
    latencyMs: float


class GroundSite(BaseModel):
    id: str
    label: str
    lat: float
    lon: float
    powerMw: float
    coolingMw: float
    jobsRunning: int
    carbonIntensity: float  # kgCO2/MWh
    energyPrice: float  # $/MWh


class Workload(BaseModel):
    jobsPending: int
    jobsRunningOrbit: int
    jobsRunningGround: int
    jobsCompleted: int


class Metrics(BaseModel):
    totalGroundPowerMw: float
    totalOrbitalPowerMw: float
    avgLatencyMs: float
    orbitSharePercent: float
    totalJobsRunning: int
    energyCostGround: float
    energyCostOrbit: float
    carbonGround: float
    carbonOrbit: float


class SimState(BaseModel):
    time: str
    satellites: List[Satellite]
    groundSites: List[GroundSite]
    workload: Workload
    metrics: Metrics
    events: List[str]  # commentary strings


class ScenarioUpdate(BaseModel):
    mode: Optional[str] = None
    orbitOffloadPercent: Optional[float] = None


def haversine(lat1, lon1, lat2, lon2):
    """Calculate great circle distance in km"""
    from math import radians, sin, cos, sqrt, atan2

    R = 6371  # Earth radius in km
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R * c


def find_nearest_gateway(lat, lon):
    """Find nearest gateway to a satellite"""
    min_dist = float("inf")
    nearest = None
    for gw in TOPOLOGY["gateways"]:
        dist = haversine(lat, lon, gw["lat"], gw["lon"])
        if dist < min_dist:
            min_dist = dist
            nearest = gw
    return nearest


async def fetch_tles():
    """Fetch Starlink TLEs from CelesTrak - returns all available satellites
    Uses file caching to avoid rate limiting (CelesTrak blocks requests more frequent than every 2 hours)
    """
    import time
    from pathlib import Path
    
    cache_file = Path("tle_cache.txt")
    cache_time_file = Path("tle_cache_time.txt")
    cache_max_age = 2 * 60 * 60  # 2 hours in seconds
    
    # Check if we have a valid cache
    # NOTE: After 2 hours, cache expires and we will fetch fresh TLE data from CelesTrak
    # This ensures satellite positions are up-to-date while respecting rate limits
    if cache_file.exists() and cache_time_file.exists():
        try:
            cache_time = float(cache_time_file.read_text().strip())
            age = time.time() - cache_time
            if age < cache_max_age:
                print(f"[fetch_tles] Using cached TLEs (age: {age/3600:.1f} hours, expires in {(cache_max_age - age)/3600:.1f} hours)")
            else:
                print(f"[fetch_tles] Cache expired (age: {age/3600:.1f} hours > {cache_max_age/3600:.1f} hours). Will fetch fresh TLEs.")
            if age < cache_max_age:
                lines = cache_file.read_text().strip().split("\n")
                sats = []
                for i in range(0, len(lines) - 1, 3):
                    if i + 2 < len(lines):
                        name = lines[i].strip()
                        line1 = lines[i + 1].strip()
                        line2 = lines[i + 2].strip()
                        if line1.startswith("1 ") and line2.startswith("2 "):
                            try:
                                sat = EarthSatellite(line1, line2, name, ts)
                                sats.append(sat)
                            except Exception as e:
                                continue
                if len(sats) > 0:
                    print(f"[fetch_tles] Loaded {len(sats)} satellites from cache")
                    return sats
        except Exception as e:
            print(f"[fetch_tles] Error reading cache: {e}")
    
    # Try multiple endpoints and sources
    # CelesTrak rate limits to once every 2 hours, so we use caching
    urls = [
        "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle",
        "https://celestrak.org/NORAD/elements/starlink.txt",
        # Alternative: Space-Track (requires auth, but we'll try public endpoints first)
        "https://www.space-track.org/basicspacedata/query/class/tle_latest/ORDINAL/1/EPOCH/%3ENOW-30/MEAN_MOTION/%3E11.25/MEAN_MOTION/%3C16.5/OBJECT_NAME/STARLINK~",
    ]
    
    async with httpx.AsyncClient() as client:
        for url in urls:
            try:
                print(f"[fetch_tles] Fetching from CelesTrak: {url}")
                # Add proper headers to avoid 403
                headers = {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/plain,text/html",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Referer": "https://celestrak.org/",
                }
                response = await client.get(url, timeout=30.0, headers=headers, follow_redirects=True)
                response.raise_for_status()
                
                # Check if we got HTML (403 page) instead of TLE data
                text = response.text.strip()
                if text.startswith("<!DOCTYPE") or text.startswith("<html") or "403" in text or "Forbidden" in text:
                    print(f"[fetch_tles] Got 403 Forbidden response from {url}")
                    print(f"[fetch_tles] CelesTrak rate limits requests to every 2 hours. Using cached data if available.")
                    # Try to use cache even if expired
                    if cache_file.exists():
                        print(f"[fetch_tles] Using expired cache due to rate limit...")
                        lines = cache_file.read_text().strip().split("\n")
                        sats = []
                        for i in range(0, len(lines) - 1, 3):
                            if i + 2 < len(lines):
                                name = lines[i].strip()
                                line1 = lines[i + 1].strip()
                                line2 = lines[i + 2].strip()
                                if line1.startswith("1 ") and line2.startswith("2 "):
                                    try:
                                        sat = EarthSatellite(line1, line2, name, ts)
                                        sats.append(sat)
                                    except Exception:
                                        continue
                        if len(sats) > 0:
                            print(f"[fetch_tles] Loaded {len(sats)} satellites from expired cache")
                            return sats
                    continue
                
                # Parse TLEs
                lines = text.split("\n")
                sats = []
                raw_tle_text = []
                for i in range(0, len(lines) - 1, 3):
                    if i + 2 < len(lines):
                        name = lines[i].strip()
                        line1 = lines[i + 1].strip()
                        line2 = lines[i + 2].strip()
                        # Validate TLE format
                        if line1.startswith("1 ") and line2.startswith("2 "):
                            try:
                                sat = EarthSatellite(line1, line2, name, ts)
                                sats.append(sat)
                                raw_tle_text.append(name)
                                raw_tle_text.append(line1)
                                raw_tle_text.append(line2)
                            except Exception as e:
                                print(f"[fetch_tles] Error parsing satellite {name}: {e}")
                                continue
                
                if len(sats) > 0:
                    # Save to cache
                    try:
                        cache_file.write_text("\n".join(raw_tle_text))
                        cache_time_file.write_text(str(time.time()))
                        print(f"[fetch_tles] Cached {len(sats)} satellites to file")
                    except Exception as e:
                        print(f"[fetch_tles] Warning: Could not write cache: {e}")
                    
                    print(f"[fetch_tles] SUCCESS: Loaded {len(sats)} Starlink satellites from {url} (expected 8000-9000)")
                    if len(sats) < 7000:
                        print(f"[fetch_tles] WARNING: Only got {len(sats)} satellites, expected 8000-9000. May be incomplete.")
                    return sats
                else:
                    print(f"[fetch_tles] No valid satellites found in response from {url}")
            except Exception as e:
                error_msg = str(e) if e else "Unknown error"
                print(f"[fetch_tles] Error fetching from {url}: {error_msg}")
                import traceback
                if "starlink" in url.lower():
                    print(f"[fetch_tles] Full traceback:")
                    traceback.print_exc()
                continue
        
        # If all URLs failed, try to use expired cache
        if cache_file.exists():
            print(f"[fetch_tles] All URLs failed, trying expired cache...")
            try:
                lines = cache_file.read_text().strip().split("\n")
                sats = []
                for i in range(0, len(lines) - 1, 3):
                    if i + 2 < len(lines):
                        name = lines[i].strip()
                        line1 = lines[i + 1].strip()
                        line2 = lines[i + 2].strip()
                        if line1.startswith("1 ") and line2.startswith("2 "):
                            try:
                                sat = EarthSatellite(line1, line2, name, ts)
                                sats.append(sat)
                            except Exception:
                                continue
                if len(sats) > 0:
                    print(f"[fetch_tles] Loaded {len(sats)} satellites from expired cache")
                    return sats
            except Exception as e:
                print(f"[fetch_tles] Error reading expired cache: {e}")
        
        # If all URLs failed, raise an error
        raise Exception("Failed to fetch TLEs from all available sources and no cache available")


async def fetch_energy_prices():
    """Fetch real-time energy prices from GridStatus API"""
    global energy_prices_cache
    
    # Map our sites to GridStatus regions/locations for more accurate pricing
    region_mapping = {
        "nova_hub": {"iso": "pjm", "location": "DOM"},  # Dominion hub for NoVA
        "dfw_hub": {"iso": "ercot", "location": "NORTH"},  # ERCOT North zone
        "phx_hub": {"iso": "caiso", "location": "AZPS"},  # Western interconnect proxy
        "abilene_edge": {"iso": "ercot", "location": "WEST"},  # ERCOT West zone
    }
    
    try:
        async with httpx.AsyncClient() as client:
            headers = {
                "X-API-Key": GRIDSTATUS_API_KEY,
                "Content-Type": "application/json",
            }
            
            # Fetch prices for each region
            for site_id, cfg in region_mapping.items():
                iso = cfg["iso"]
                location = cfg["location"]
                try:
                    # Try different endpoints based on GridStatus API structure
                    endpoints = [
                        (
                            f"{GRIDSTATUS_BASE_URL}/markets/{iso}/prices",
                            {"location": location, "market": "rtm", "limit": 1, "sort": "desc"},
                        ),
                        (
                            f"{GRIDSTATUS_BASE_URL}/iso/{iso}/realtime-price",
                            {"location": location},
                        ),
                        (
                            f"{GRIDSTATUS_BASE_URL}/markets/{iso}/realtime",
                            {"location": location},
                        ),
                    ]
                    
                    price_found = False
                    for url, params in endpoints:
                        try:
                            response = await client.get(url, headers=headers, params=params, timeout=10.0)
                            
                            if response.status_code == 200:
                                data = response.json()
                                price = _extract_price(data)
                                
                                if price is not None:
                                    energy_prices_cache[site_id] = float(price)
                                    price_found = True
                                    print(f"Fetched price for {site_id}: ${price:.2f}/MWh")
                                    break
                        except Exception as e:
                            continue  # Try next endpoint
                    
                    if not price_found:
                        # Use fallback if API fails
                        if site_id not in energy_prices_cache:
                            energy_prices_cache[site_id] = 50.0
                        print(f"Using fallback price for {site_id}")
                        
                except Exception as e:
                    print(f"Error fetching price for {site_id}: {e}")
                    # Keep existing cached value or use fallback
                    if site_id not in energy_prices_cache:
                        energy_prices_cache[site_id] = 50.0
    except Exception as e:
        print(f"Error fetching energy prices from GridStatus: {e}")
        # Use fallback prices
        if not energy_prices_cache:
            energy_prices_cache = {
                "nova_hub": 60.0,
                "dfw_hub": 45.0,
                "phx_hub": 55.0,
                "abilene_edge": 50.0,
            }


def _extract_price(payload):
    """Try to extract a price value from various GridStatus payload shapes."""
    if isinstance(payload, dict):
        if "data" in payload and isinstance(payload["data"], list) and payload["data"]:
            return _extract_price(payload["data"][0])
        return (
            payload.get("price")
            or payload.get("lmp")
            or payload.get("value")
            or payload.get("realtime_price")
        )
    if isinstance(payload, list) and payload:
        return _extract_price(payload[0])
    return None


def generate_jobs(now, hour):
    """Generate jobs based on workload profile"""
    import random
    import math

    rate = WORKLOAD_PROFILE["hourly_arrival_rates"][hour % 24]
    num_jobs = int(rate * 100)  # Scale factor

    jobs = []
    for _ in range(num_jobs):
        job_class = random.choices(
            WORKLOAD_PROFILE["job_classes"],
            weights=[jc["fraction"] for jc in WORKLOAD_PROFILE["job_classes"]],
        )[0]
        if job_class["size_dist"]["type"] == "lognormal":
            mu = job_class["size_dist"]["mu"]
            sigma = job_class["size_dist"]["sigma"]
            size = math.exp(random.normalvariate(mu, sigma))
        else:
            size = 1.0
        jobs.append({"class": job_class["name"], "size": size, "deadline": job_class["deadline_ms"]})
    return jobs


def compute_sunlit(sat_pos, earth_pos, sun_pos, t):
    """Check if satellite is sunlit by determining if it's in Earth's shadow
    
    Args:
        sat_pos: Skyfield geocentric position of satellite
        earth_pos: Skyfield geocentric position of Earth
        sun_pos: Skyfield geocentric position of Sun
        t: Skyfield time object
    """
    import math
    
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
        return True  # Default to sunlit if vectors are invalid
    
    # Normalize vectors
    sat_rel_norm = [sat_rel[i] / sat_mag for i in range(3)]
    sun_rel_norm = [sun_rel[i] / sun_mag for i in range(3)]
    
    # Dot product of normalized vectors (cosine of angle between them)
    dot_norm = sum(sat_rel_norm[i] * sun_rel_norm[i] for i in range(3))
    dot_norm = max(-1.0, min(1.0, dot_norm))  # Clamp to valid range
    
    # Earth's radius is approximately 6371 km
    earth_radius_km = 6371.0
    
    # Distance from Earth center to satellite
    sat_dist = sat_mag
    
    # Calculate the shadow cone half-angle
    # The umbra extends from Earth's surface at an angle
    # For a satellite at distance d, the umbra half-angle is: alpha = arcsin(earth_radius / d)
    shadow_angle = math.asin(earth_radius_km / sat_dist) if sat_dist > earth_radius_km else math.pi / 2
    
    # A satellite is in Earth's umbra if:
    # 1. It's on the opposite side of Earth from the Sun (dot_norm <= 0, angle >= 90 degrees)
    # 2. AND the angle is large enough to be within the shadow cone (angle > pi - shadow_angle)
    # 
    # For LEO satellites (typically 400-600 km altitude), sat_dist ≈ 6900-7000 km
    # shadow_angle ≈ arcsin(6371/6900) ≈ 1.17 radians (67 degrees)
    # umbra_angle = pi - shadow_angle ≈ 1.97 radians (113 degrees)
    # So satellites with angle > 113 degrees are in the umbra
    
    umbra_angle = math.pi - shadow_angle
    
    # Check if satellite is in shadow
    # If dot_norm <= 0, satellite is on the night side (angle >= 90 degrees)
    if dot_norm <= 0:
        # Calculate the angle between vectors
        # When dot_norm <= 0, angle is between 90 and 180 degrees
        angle_rad = math.acos(max(-1.0, min(1.0, dot_norm)))  # Clamp to valid range for acos
        
        # If the angle is greater than the umbra threshold, satellite is in full shadow
        # For LEO satellites (~550km), umbra_angle ≈ 113 degrees
        if angle_rad > umbra_angle:
            return False  # In umbra (full shadow)
        
        # For angles between 90-113 degrees, satellite is in penumbra (partial shadow)
        # For power calculation purposes, consider penumbra as "in shadow" (reduced power)
        # This is more realistic - satellites in penumbra get significantly less sunlight
        # Use a threshold: if angle > 100 degrees, consider it in shadow
        penumbra_threshold = math.radians(100)  # 100 degrees
        if angle_rad > penumbra_threshold:
            return False  # In penumbra/shadow
    
    # Satellite is sunlit (either on sunward side or in light penumbra)
    return True


async def update_simulation():
    """Update simulation state every second"""
    global sim_state, control

    # Load ephemeris once outside the loop
    eph = load("de421.bsp")
    earth_obj = eph["earth"]
    sun_obj = eph["sun"]

    # Accelerated time (10x faster)
    TIME_ACCELERATION = 10
    start_time = datetime.now(timezone.utc)
    simulated_start = datetime.now(timezone.utc)
    
    while True:
        try:
            async with sim_lock:
                # Calculate accelerated time
                real_elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
                simulated_elapsed = real_elapsed * TIME_ACCELERATION
                now = simulated_start + timedelta(seconds=simulated_elapsed)
                t = ts.from_datetime(now)
                hour = now.hour

                # Get Earth and Sun positions once per update
                earth_pos = earth_obj.at(t)
                sun_pos = sun_obj.at(t)

                # Propagate all satellites from CelesTrak - no limit
                # GPU optimizations allow us to process all satellites
                satellites_to_process = satellites  # Process all satellites
                if control["tick"] == 1:
                    print(f"[Backend] DEBUG: Global satellites list has {len(satellites)} items, satellites_to_process has {len(satellites_to_process)} items")
                elif control["tick"] % 60 == 0:
                    print(f"[Backend] DEBUG: Processing {len(satellites_to_process)} satellites in update_simulation")
                
                orbital_nodes = []
                sunlit_count = 0
                shadow_count = 0
                
                if len(satellites) == 0:
                    print(f"[Backend] WARNING: No satellites loaded! satellites list is empty.")
                    print(f"[Backend] This may be because TLEs failed to load on startup.")
                
                error_count_processing = 0
                for i, sat in enumerate(satellites_to_process):
                    try:
                        geocentric = sat.at(t)
                        subpoint = geocentric.subpoint()
                        lat = subpoint.latitude.degrees
                        lon = subpoint.longitude.degrees
                        alt_km = subpoint.elevation.km

                        # Check sunlit status using pre-loaded positions
                        sunlit = compute_sunlit(geocentric, earth_pos, sun_pos, t)
                        
                        if sunlit:
                            sunlit_count += 1
                        else:
                            shadow_count += 1
                        
                        # Debug: log sunlit status for first few satellites only (reduced logging)
                        if i < 3 and control["tick"] % 60 == 0:  # Only log every 60 ticks
                            import math
                            # Calculate dot product for debugging
                            sat_vec = geocentric.position.km
                            earth_vec = earth_pos.position.km
                            sun_vec = sun_pos.position.km
                            sat_rel = [sat_vec[j] - earth_vec[j] for j in range(3)]
                            sun_rel = [sun_vec[j] - earth_vec[j] for j in range(3)]
                            sat_mag = math.sqrt(sum(sat_rel[j] ** 2 for j in range(3)))
                            sun_mag = math.sqrt(sum(sun_rel[j] ** 2 for j in range(3)))
                            if sat_mag > 0 and sun_mag > 0:
                                sat_rel_norm = [sat_rel[j] / sat_mag for j in range(3)]
                                sun_rel_norm = [sun_rel[j] / sun_mag for j in range(3)]
                                dot_norm = sum(sat_rel_norm[j] * sun_rel_norm[j] for j in range(3))
                                angle_deg = math.degrees(math.acos(max(-1.0, min(1.0, dot_norm))))
                                print(f"[Backend] Satellite {i}: sunlit={sunlit}, angle={angle_deg:.1f}°")

                        orbital_nodes.append(
                            {
                                "id": f"sat_{i}",
                                "lat": lat,
                                "lon": lon,
                                "alt_km": alt_km,
                                "sunlit": sunlit,
                                "sat": sat,
                                "geocentric": geocentric,
                            }
                        )
                    except Exception as e:
                        error_count_processing += 1
                        # Log errors but don't stop processing - continue with next satellite
                        if error_count_processing <= 50:  # Log first 50 errors
                            print(f"[Backend] Error processing satellite {i}: {e}")
                            if error_count_processing == 1:
                                import traceback
                                traceback.print_exc()
                        # Continue to next satellite instead of breaking
                        continue
                
                if control["tick"] == 1:
                    print(f"[Backend] PROCESSING SUMMARY: Processed {len(satellites_to_process)} satellites")
                    print(f"[Backend] PROCESSING SUMMARY: Created {len(orbital_nodes)} orbital nodes")
                    print(f"[Backend] PROCESSING SUMMARY: {error_count_processing} satellites failed to process")
                    if error_count_processing > 0:
                        print(f"[Backend] WARNING: {error_count_processing} satellites failed to process out of {len(satellites_to_process)}")
                        print(f"[Backend] WARNING: Only {len(orbital_nodes)} orbital nodes created from {len(satellites_to_process)} satellites")
                
                # Log satellite count and sunlit statistics every 60 seconds
                if control["tick"] % 60 == 0:
                    print(f"[Backend] Processing {len(satellites_to_process)} satellites, created {len(orbital_nodes)} orbital nodes")
                    print(f"[Backend] DEBUG: satellites_to_process length: {len(satellites_to_process)}, orbital_nodes length: {len(orbital_nodes)}")
                
                if len(orbital_nodes) > 0 and control["tick"] % 60 == 0:
                    import math
                    print(f"[Backend] Sunlit: {sunlit_count}/{len(orbital_nodes)} ({100*sunlit_count/len(orbital_nodes):.1f}%), Shadow: {shadow_count}/{len(orbital_nodes)} ({100*shadow_count/len(orbital_nodes):.1f}%)")
                    # Also log a sample of satellites to debug
                    if shadow_count > 0:
                        print(f"[Backend] Found {shadow_count} satellites in shadow - this is correct!")
                    else:
                        print(f"[Backend] WARNING: All satellites are sunlit - checking calculation...")
                        # Check first 10 satellites to see their positions
                        for i, node in enumerate(orbital_nodes[:10]):
                            sat_vec = node["geocentric"].position.km
                            earth_vec = earth_pos.position.km
                            sun_vec = sun_pos.position.km
                            sat_rel = [sat_vec[j] - earth_vec[j] for j in range(3)]
                            sun_rel = [sun_vec[j] - earth_vec[j] for j in range(3)]
                            sat_mag = math.sqrt(sum(sat_rel[j] ** 2 for j in range(3)))
                            sun_mag = math.sqrt(sum(sun_rel[j] ** 2 for j in range(3)))
                            if sat_mag > 0 and sun_mag > 0:
                                sat_rel_norm = [sat_rel[j] / sat_mag for j in range(3)]
                                sun_rel_norm = [sun_rel[j] / sun_mag for j in range(3)]
                                dot_norm = sum(sat_rel_norm[j] * sun_rel_norm[j] for j in range(3))
                                angle_deg = math.degrees(math.acos(max(-1.0, min(1.0, dot_norm))))
                                earth_radius_km = 6371.0
                                shadow_angle = math.asin(earth_radius_km / sat_mag) if sat_mag > earth_radius_km else math.pi / 2
                                umbra_angle = math.pi - shadow_angle
                                penumbra_threshold_deg = 100.0
                                print(f"[Backend] Sample sat {i}: dot={dot_norm:.3f}, angle={angle_deg:.1f}°, umbra={math.degrees(umbra_angle):.1f}°, penumbra_threshold={penumbra_threshold_deg:.1f}°, sunlit={node['sunlit']}, lat={node['lat']:.1f}°")
                                # Force check: if angle > 100, should be in shadow
                                if dot_norm <= 0 and angle_deg > penumbra_threshold_deg:
                                    print(f"[Backend] ERROR: Sat {i} should be in shadow! (angle {angle_deg:.1f}° > {penumbra_threshold_deg}°)")

                # Select orbital hubs (closest to each gateway)
                orbital_hubs = []
                hub_satellites = {}
                for gw in TOPOLOGY["gateways"]:
                    nearest = None
                    min_dist = float("inf")
                    for node in orbital_nodes:
                        dist = haversine(node["lat"], node["lon"], gw["lat"], gw["lon"])
                        if dist < min_dist:
                            min_dist = dist
                            nearest = node
                    if nearest:
                        hub_id = f"hub_{gw['id']}"
                        if hub_id not in hub_satellites:
                            hub_satellites[hub_id] = []
                        hub_satellites[hub_id].append(nearest)

                # Generate jobs
                jobs = generate_jobs(now, hour)

                # Route jobs based on orbitOffloadPercent
                orbit_offload = control["scenario"]["orbitOffloadPercent"] / 100.0
                num_orbital_jobs = int(len(jobs) * orbit_offload)
                num_ground_jobs = len(jobs) - num_orbital_jobs

                # Allocate orbital jobs to hubs
                orbital_jobs_by_hub = {}
                for hub_id in hub_satellites:
                    orbital_jobs_by_hub[hub_id] = num_orbital_jobs // len(hub_satellites)

                # Allocate ground jobs to sites
                jobs_per_site = num_ground_jobs // len(TOPOLOGY["groundSites"])

                # Build orbital hubs (for internal tracking, not in final state)
                hub_nodes = []
                total_orbital_power = 0.0
                for hub_id, sats in hub_satellites.items():
                    jobs_running = orbital_jobs_by_hub.get(hub_id, 0)
                    utilization = min(1.0, jobs_running / 50.0)  # Capacity of 50 jobs
                    # Realistic power: 0.003 MW (3 kW) per satellite when fully utilized
                    power_mw = utilization * 0.003 * len(sats)  # Realistic 3 kW per sat
                    total_orbital_power += power_mw

                    # Use first satellite's position for hub
                    if sats:
                        first_sat = sats[0]
                        hub_nodes.append({
                            "id": hub_id,
                            "lat": first_sat["lat"],
                            "lon": first_sat["lon"],
                            "alt_km": first_sat["alt_km"],
                            "sunlit": first_sat["sunlit"],
                            "utilization": utilization,
                            "powerMw": power_mw,
                            "jobsRunning": jobs_running,
                        })

                # Build ground sites
                ground_sites_list = []
                total_ground_power = 0.0
                scenario_mode = control["scenario"]["mode"]

                for site in TOPOLOGY["groundSites"]:
                    jobs_running = jobs_per_site
                    capacity_mw = 150.0  # Base capacity
                    power_mw = min(capacity_mw, jobs_running * 0.5)  # 0.5 MW per job
                    pue = 1.3
                    power_mw *= pue
                    cooling_mw = power_mw * 0.4

                    # Energy price from GridStatus API or baseline
                    base_price = energy_prices_cache.get(site["id"], 50.0)
                    
                    # Fallback baseline prices per region if API not available
                    if site["id"] not in energy_prices_cache:
                        if site["id"] == "nova_hub":
                            base_price = 60.0
                        elif site["id"] == "dfw_hub":
                            base_price = 45.0
                        elif site["id"] == "phx_hub":
                            base_price = 55.0

                    # Scenario modifiers
                    if scenario_mode == "price_spike":
                        base_price *= 2.5
                    elif scenario_mode == "fiber_cut" and site["id"] == "nova_hub":
                        power_mw *= 0.5  # Degraded capacity

                    # Carbon (kg/MWh) - varies by region
                    carbon = 300.0  # Default
                    if site["id"] == "nova_hub":
                        carbon = 250.0  # More renewable
                    elif site["id"] == "phx_hub":
                        carbon = 350.0  # More coal

                    total_ground_power += power_mw

                    ground_sites_list.append({
                        "id": site["id"],
                        "label": site["label"],
                        "lat": site["lat"],
                        "lon": site["lon"],
                        "powerMw": power_mw,
                        "coolingMw": cooling_mw,
                        "jobsRunning": jobs_running,
                        "energyPrice": base_price,
                        "carbonIntensity": carbon,
                    })

                # Calculate latency metrics (no links in new contract, but we need for metrics)
                total_latency_weighted = 0.0
                total_jobs_for_latency = 0

                # Calculate latency for orbital jobs
                for hub in hub_nodes:
                    nearest_gw = find_nearest_gateway(hub["lat"], hub["lon"])
                    if nearest_gw:
                        dist_km = haversine(hub["lat"], hub["lon"], nearest_gw["lat"], nearest_gw["lon"])
                        dist_km += hub["alt_km"]
                        latency_ms = (dist_km / 300000.0) * 1000.0
                        
                        if scenario_mode == "solar_storm":
                            latency_ms *= 1.5

                        # Gateway to ground site latency
                        nearest_site = None
                        min_site_dist = float("inf")
                        for site in TOPOLOGY["groundSites"]:
                            dist = haversine(nearest_gw["lat"], nearest_gw["lon"], site["lat"], site["lon"])
                            if dist < min_site_dist:
                                min_site_dist = dist
                                nearest_site = site

                        if nearest_site:
                            gw_to_site_latency = (min_site_dist / 300000.0) * 1000.0
                            if scenario_mode == "fiber_cut" and nearest_site["id"] == "nova_hub":
                                gw_to_site_latency *= 3.0

                            total_latency = latency_ms + gw_to_site_latency
                            total_latency_weighted += total_latency * hub["jobsRunning"]
                            total_jobs_for_latency += hub["jobsRunning"]

                # Calculate metrics
                total_jobs = num_orbital_jobs + num_ground_jobs
                orbit_share = (total_orbital_power / (total_orbital_power + total_ground_power) * 100.0) if (total_orbital_power + total_ground_power) > 0 else 0.0

                avg_latency = total_latency_weighted / total_jobs_for_latency if total_jobs_for_latency > 0 else 0.0

                # Generate events
                events = []
                if orbit_share > 40 and control["tick"] % 60 == 0:
                    events.append(f"Orbit share jumped to {orbit_share:.1f}% after price spike.")
                if scenario_mode == "solar_storm" and control["tick"] % 30 == 0:
                    events.append("Solar storm dropped 18% of orbital capacity.")
                if scenario_mode == "fiber_cut" and control["tick"] % 45 == 0:
                    events.append("Fiber cut in NoVA region forcing traffic via orbit.")

                # Build all satellite nodes with new structure
                all_satellites = []
                # Return all processed satellites for visualization (up to 200 processed, all returned)
                satellites_to_return = orbital_nodes  # Return all processed satellites
                global all_satellites_global  # Store globally to avoid truncation
                if control["tick"] % 60 == 0:
                    print(f"[Backend] Building all_satellites from {len(satellites_to_return)} orbital_nodes")
                elif control["tick"] == 1:
                    print(f"[Backend] CRITICAL: satellites_to_return has {len(satellites_to_return)} items")
                    print(f"[Backend] CRITICAL: orbital_nodes has {len(orbital_nodes)} items")
                
                processed_count = 0
                error_count_building = 0
                # Process ALL nodes in satellites_to_return - no limit
                for i, node in enumerate(satellites_to_return):
                    processed_count += 1
                    try:
                        # Find if this sat is part of a hub
                        utilization = 0.0
                        jobs_running = 0
                        nearest_gw = find_nearest_gateway(node["lat"], node["lon"])
                        nearest_gw_id = nearest_gw["id"] if nearest_gw else ""
                        
                        # Calculate latency to gateway
                        if nearest_gw:
                            dist_km = haversine(node["lat"], node["lon"], nearest_gw["lat"], nearest_gw["lon"])
                            dist_km += node["alt_km"]
                            latency_ms = (dist_km / 300000.0) * 1000.0
                            if scenario_mode == "solar_storm":
                                latency_ms *= 1.5
                        else:
                            latency_ms = 0.0
                        
                        # Capacity based on sunlit status
                        # Realistic Starlink values: ~2.9 kW (0.0029 MW) for sunlit, ~0.5 kW (0.0005 MW) for shadow
                        # Using realistic values for simulator mode
                        capacity_mw = 0.003 if node["sunlit"] else 0.0005  # Realistic Starlink power
                        
                        for hub_id, hub_sats in hub_satellites.items():
                            if node in hub_sats:
                                hub_node = next((h for h in hub_nodes if h["id"] == hub_id), None)
                                if hub_node:
                                    utilization = hub_node["utilization"]
                                    jobs_running = hub_node["jobsRunning"]
                                    break
                        
                        # If not in a hub, set random utilization
                        if utilization == 0.0:
                            import random
                            utilization = random.uniform(0.3, 0.9) if node["sunlit"] else random.uniform(0.0, 0.2)
                            if scenario_mode == "solar_storm":
                                utilization *= 0.6  # Reduce capacity during solar storm

                        # Always append the satellite (outside the if block)
                        all_satellites.append(
                            Satellite(
                                id=node["id"],
                                lat=node["lat"],
                                lon=node["lon"],
                                alt_km=node["alt_km"],
                                sunlit=node["sunlit"],
                                utilization=utilization,
                                capacityMw=capacity_mw,
                                nearestGatewayId=nearest_gw_id,
                                latencyMs=latency_ms,
                            )
                        )
                    except Exception as e:
                        error_count_building += 1
                        if error_count_building <= 10:
                            print(f"[Backend] Error building satellite {i} from node: {e}")
                        continue
                
                # Store in global variable to avoid truncation
                all_satellites_global = list(all_satellites)
                if control["tick"] <= 5:
                    print(f"[Backend] STORED GLOBAL (tick {control['tick']}): Processed {processed_count} nodes, built {len(all_satellites)} satellites, stored {len(all_satellites_global)} in global")
                    if error_count_building > 0:
                        print(f"[Backend] STORED GLOBAL: {error_count_building} errors during building")
                    if len(all_satellites_global) > 0:
                        print(f"[Backend] STORED GLOBAL: First 3 IDs: {[s.id for s in all_satellites_global[:3]]}")
                        print(f"[Backend] STORED GLOBAL: Last 3 IDs: {[s.id for s in all_satellites_global[-3:]]}")
                    if len(all_satellites_global) < len(satellites_to_return) * 0.9:
                        print(f"[Backend] WARNING: Only built {len(all_satellites_global)}/{len(satellites_to_return)} satellites! Some may have failed.")
                
                # Always log the count for first 10 ticks
                if control["tick"] <= 10:
                    print(f"[Backend] CRITICAL (tick {control['tick']}): Processed {processed_count} nodes, created {len(all_satellites)} satellites")
                    print(f"[Backend] CRITICAL: satellites_to_return has {len(satellites_to_return)} items, orbital_nodes has {len(orbital_nodes)} items")
                    if len(all_satellites) > 0:
                        print(f"[Backend] CRITICAL: First 3 all_satellites IDs: {[s.id for s in all_satellites[:3]]}")
                        print(f"[Backend] CRITICAL: Last 3 all_satellites IDs: {[s.id for s in all_satellites[-3:]]}")
                    if len(all_satellites) == 20:
                        print(f"[Backend] CRITICAL ERROR: all_satellites only has 20 items! This is the problem!")
                        print(f"[Backend] CRITICAL: satellites_to_return has {len(satellites_to_return)} items")
                        print(f"[Backend] CRITICAL: orbital_nodes has {len(orbital_nodes)} items")
                        print(f"[Backend] CRITICAL: processed_count = {processed_count}")

                # Build workload object
                workload = Workload(
                    jobsPending=max(0, len(jobs) - num_orbital_jobs - num_ground_jobs),
                    jobsRunningOrbit=num_orbital_jobs,
                    jobsRunningGround=num_ground_jobs,
                    jobsCompleted=control["tick"] * 10,  # Simplified completion tracking
                )

                # Calculate energy costs and carbon
                energy_cost_ground = sum(site["energyPrice"] * site["powerMw"] for site in ground_sites_list)
                energy_cost_orbit = total_orbital_power * 20.0  # Fixed $20/MWh for orbital (solar)
                carbon_ground = sum(site["carbonIntensity"] * site["powerMw"] for site in ground_sites_list)
                carbon_orbit = 0.0  # Effectively 0 carbon for orbital (solar)

                # Build metrics with new structure
                metrics = Metrics(
                    totalGroundPowerMw=total_ground_power,
                    totalOrbitalPowerMw=total_orbital_power,
                    avgLatencyMs=avg_latency,
                    orbitSharePercent=orbit_share,
                    totalJobsRunning=total_jobs,
                    energyCostGround=energy_cost_ground,
                    energyCostOrbit=energy_cost_orbit,
                    carbonGround=carbon_ground,
                    carbonOrbit=carbon_orbit,
                )

                # Convert ground sites dicts to GroundSite models
                updated_ground_sites = []
                for site in ground_sites_list:
                    updated_ground_sites.append(
                        GroundSite(
                            id=site["id"],
                            label=site["label"],
                            lat=site["lat"],
                            lon=site["lon"],
                            powerMw=site["powerMw"],
                            coolingMw=site["coolingMw"],
                            jobsRunning=site["jobsRunning"],
                            carbonIntensity=site["carbonIntensity"],
                            energyPrice=site["energyPrice"],
                        )
                    )

                # Debug: Log satellite count
                if control["tick"] % 60 == 0:
                    print(f"[Backend] Built {len(all_satellites)} satellites for sim_state (from {len(orbital_nodes)} orbital_nodes, satellites_to_return had {len(satellites_to_return)} items)")
                elif control["tick"] == 1:
                    print(f"[Backend] DEBUG: Built {len(all_satellites)} satellites for sim_state (from {len(orbital_nodes)} orbital_nodes, satellites_to_return had {len(satellites_to_return)} items)")
                
                # CRITICAL DEBUG: Check all_satellites before creating SimState
                if control["tick"] == 1:
                    print(f"[Backend] DEBUG: all_satellites length = {len(all_satellites)}")
                    print(f"[Backend] DEBUG: First 3 IDs in all_satellites: {[s.id for s in all_satellites[:3]]}")
                    print(f"[Backend] DEBUG: Last 3 IDs in all_satellites: {[s.id for s in all_satellites[-3:]]}")
                
                # CRITICAL: Create SimState with full list directly
                # Use global to ensure we're modifying the right variable
                global sim_state
                
                # Create SimState with full satellites list
                sim_state = SimState(
                    time=now.isoformat(),
                    satellites=list(all_satellites),  # Use full list directly
                    groundSites=updated_ground_sites,
                    workload=workload,
                    metrics=metrics,
                    events=events,
                )
                
                # ALWAYS check and fix truncation - Pydantic may be silently truncating
                actual_sat_count = len(sim_state.satellites) if hasattr(sim_state, 'satellites') and sim_state.satellites else 0
                # Always log, not just on tick 1
                if control["tick"] <= 5 or control["tick"] % 60 == 0:
                    print(f"[Backend] ALWAYS (tick {control['tick']}): After SimState creation, all_satellites has {len(all_satellites)} items, sim_state.satellites has {actual_sat_count} items")
                if actual_sat_count != len(all_satellites):
                    print(f"[Backend] CRITICAL ERROR: SimState truncated! all_satellites has {len(all_satellites)}, sim_state.satellites has {actual_sat_count}")
                    # Try multiple methods to fix
                    object.__setattr__(sim_state, 'satellites', list(all_satellites))
                    actual_sat_count = len(sim_state.satellites)
                    if actual_sat_count != len(all_satellites):
                        sim_state.__dict__['satellites'] = list(all_satellites)
                        actual_sat_count = len(sim_state.satellites)
                    print(f"[Backend] CRITICAL FIX: After fixes, sim_state.satellites has {actual_sat_count} items")
                
                if control["tick"] == 1:
                    print(f"[Backend] CRITICAL: sim_state.satellites length after creation = {len(sim_state.satellites)}")
                    print(f"[Backend] CRITICAL: First 3 IDs in sim_state.satellites: {[s.id for s in sim_state.satellites[:3]] if len(sim_state.satellites) > 0 else 'N/A'}")
                    print(f"[Backend] CRITICAL: Last 3 IDs in sim_state.satellites: {[s.id for s in sim_state.satellites[-3:]] if len(sim_state.satellites) > 0 else 'N/A'}")

                control["tick"] += 1

        except Exception as e:
            print(f"Error in simulation update: {e}")
            import traceback
            traceback.print_exc()

        await asyncio.sleep(1.0)


@app.on_event("startup")
async def startup():
    """Initialize on startup"""
    global satellites

    print("Fetching TLEs from CelesTrak...")
    try:
        satellites = await fetch_tles()
        print(f"[startup] Loaded {len(satellites)} satellites from TLE fetch")
        if len(satellites) == 0:
            raise Exception("No satellites loaded from CelesTrak")
        if len(satellites) < 100:
            print(f"[startup] WARNING: Only {len(satellites)} satellites loaded from CelesTrak. This is less than expected.")
    except Exception as e:
        print(f"[startup] Error fetching TLEs: {e}")
        print(f"[startup] Will retry CelesTrak fetch...")
        import traceback
        traceback.print_exc()
        # Try one more time
        try:
            satellites = await fetch_tles()
            print(f"[startup] Retry loaded {len(satellites)} satellites")
        except Exception as e2:
            print(f"[startup] Retry also failed: {e2}")
            print(f"[startup] Creating fallback dummy satellites for testing...")
            # Create dummy satellites for testing - generate some Starlink-like orbits
            satellites = []
            # Generate ~9000 dummy satellites in LEO orbits (matching real Starlink count ~8-9k)
            # Using simplified TLE format for testing
            error_count = 0
            for i in range(9000):
                try:
                    name = f"STARLINK-{i+1000}"
                    # Create minimal valid TLE (these are placeholder values)
                    # Format: NORAD ID, epoch, mean motion, etc.
                    norad_id = 50000 + i
                    epoch_day = 325.0  # Day of year
                    mean_motion = 15.0  # Revolutions per day (typical for LEO)
                    inclination = 53.0  # Degrees (typical Starlink inclination)
                    raan = i * 3.6  # Right ascension of ascending node
                    
                    line1 = f"1 {norad_id:05d}U 23001A   {epoch_day:012.8f}  .00000000  00000+0  00000+0 0  9999"
                    line2 = f"2 {norad_id:05d} {inclination:8.4f} {raan:08.4f} 0000000   0.0000 270.0000 {mean_motion:11.8f}"
                    sat = EarthSatellite(line1, line2, name, ts)
                    satellites.append(sat)
                except Exception as sat_error:
                    error_count += 1
                    if error_count <= 5:  # Only log first 5 errors
                        print(f"Error creating dummy satellite {i}: {sat_error}")
                    continue
        print(f"[startup] Created {len(satellites)} dummy satellites for testing (errors: {error_count})")
        if len(satellites) < 100:
            print(f"[startup] WARNING: Only {len(satellites)} satellites created! Expected ~9000.")

    # Initialize world instance with satellites
    print(f"[startup] About to initialize world with {len(satellites)} satellites")
    await world_instance.initialize(satellites)
    print(f"[startup] World simulation initialized with {len(satellites)} satellites")
    # Log actual count - should be 8-9k from CelesTrak
    if len(satellites) > 0:
        print(f"[startup] SUCCESS: Loaded {len(satellites)} satellites (expected 8000-9000 from CelesTrak)")
    else:
        print(f"[startup] ERROR: No satellites loaded!")

    # Fetch energy prices from GridStatus
    print("Fetching energy prices from GridStatus...")
    await fetch_energy_prices()
    print(f"Loaded energy prices: {energy_prices_cache}")

    # Load workload profile if exists
    profile_path = Path("workload_profile.json")
    if profile_path.exists():
        global WORKLOAD_PROFILE
        with open(profile_path) as f:
            WORKLOAD_PROFILE = json.load(f)

    # Clear cache to ensure fresh state
    clear_state_cache()
    
    # Start simulation task
    asyncio.create_task(update_simulation())
    
    # Start periodic energy price updates (every 5 minutes)
    async def update_energy_prices_periodically():
        while True:
            await asyncio.sleep(300)  # 5 minutes
            await fetch_energy_prices()
    
    asyncio.create_task(update_energy_prices_periodically())
    
    # Start world time advancement
    async def advance_world_time():
        while True:
            await asyncio.sleep(1.0)
            world_instance.advance_time(dt_seconds=1.0)
    
    asyncio.create_task(advance_world_time())


@app.get("/health")
async def health():
    return {"status": "ok"}


# Cache for state responses to reduce computation
_state_cache = None
_cache_tick = -1

# Force cache clear on startup to avoid stale data
def clear_state_cache():
    global _state_cache, _cache_tick
    _state_cache = None
    _cache_tick = -1
    print("[startup] Cleared state cache")

@app.get("/state")  # Removed response_model to avoid Pydantic truncation
async def get_state(mode: str = "simulator"):
    """Get current simulation state
    
    Args:
        mode: "simulator" for realistic values, "sandbox" for demonstration values (default: "simulator")
    """
    global _state_cache, _cache_tick
    import time
    start_time = time.time()
    
    # Use asyncio.sleep(0) to yield control and prevent blocking
    await asyncio.sleep(0)
    
    async with sim_lock:
        if sim_state is None:
            raise HTTPException(status_code=503, detail="Simulation not initialized")
        
        # CRITICAL DEBUG: Check sim_state.satellites length before any caching
        sim_sat_len = len(sim_state.satellites) if hasattr(sim_state, 'satellites') and sim_state.satellites else 0
        print(f"[get_state] CRITICAL: sim_state.satellites has {sim_sat_len} items before cache check")
        if sim_sat_len == 20:
            print(f"[get_state] CRITICAL: sim_state.satellites only has 20 items! This is the root cause!")
            print(f"[get_state] CRITICAL: First 3 IDs: {[s.id for s in sim_state.satellites[:3]] if sim_sat_len > 0 else 'N/A'}")
        
        # Use cached state if available and tick hasn't changed
        # For sandbox mode, cache more aggressively (every 5 ticks) to reduce load
        cache_interval = 5 if mode == "sandbox" else 1
        use_cache = True  # Re-enabled for performance
        
        # ALWAYS use cache if available and recent (within 2 ticks) to prevent timeouts
        if use_cache and _state_cache is not None:
            tick_diff = abs(control["tick"] - _cache_tick)
            if tick_diff <= 2:  # Use cache if within 2 ticks
                elapsed = time.time() - start_time
                cache_sat_count = len(_state_cache.satellites) if hasattr(_state_cache, 'satellites') and _state_cache.satellites else 0
                print(f"[get_state] Returning cached state (tick {control['tick']}, cache_tick {_cache_tick}, diff {tick_diff}, {elapsed:.3f}s, {cache_sat_count} sats)")
                # Return cached dict directly to avoid processing
                from fastapi.responses import JSONResponse
                return_dict = _state_cache.dict() if hasattr(_state_cache, 'dict') else _state_cache.__dict__
                # Ensure satellites are included
                if isinstance(return_dict, dict) and 'satellites' not in return_dict:
                    return_dict['satellites'] = [s.dict() if hasattr(s, 'dict') else s.__dict__ for s in _state_cache.satellites]
                return JSONResponse(content=return_dict)
        
        # Store mode in sim_state for use in calculations
        # Force a fresh copy to avoid any caching issues
        # CRITICAL: Ensure we use the full satellites list, not a truncated version
        # First, check what sim_state.satellites actually contains
        try:
            sim_sat_iter = iter(sim_state.satellites) if hasattr(sim_state, 'satellites') and sim_state.satellites else iter([])
            sim_sat_list_full = list(sim_sat_iter)
            sim_sat_len_actual = len(sim_sat_list_full)
        except Exception as e:
            print(f"[get_state] ERROR: Could not iterate sim_state.satellites: {e}")
            sim_sat_list_full = []
            sim_sat_len_actual = 0
        
        # Also try len() directly
        sim_sat_len_direct = len(sim_state.satellites) if hasattr(sim_state, 'satellites') and sim_state.satellites else 0
        
        print(f"[get_state] CRITICAL DEBUG: sim_state.satellites len() = {sim_sat_len_direct}, list() length = {sim_sat_len_actual}")
        
        # Use the longer of the two (in case one is truncated)
        satellites_list = sim_sat_list_full if sim_sat_len_actual > sim_sat_len_direct else (list(sim_state.satellites) if hasattr(sim_state, 'satellites') and sim_state.satellites else [])
        
        if len(satellites_list) == 20:
            print(f"[get_state] CRITICAL: satellites_list has exactly 20 items! This is the bug!")
            print(f"[get_state] CRITICAL: sim_state.satellites type: {type(sim_state.satellites)}")
            print(f"[get_state] CRITICAL: Trying to access all items directly...")
            # Try to get all items by accessing the underlying data
            if hasattr(sim_state, '__dict__'):
                print(f"[get_state] CRITICAL: sim_state.__dict__ keys: {list(sim_state.__dict__.keys())}")
                if 'satellites' in sim_state.__dict__:
                    raw_sats = sim_state.__dict__['satellites']
                    print(f"[get_state] CRITICAL: raw satellites from __dict__ type: {type(raw_sats)}, length: {len(raw_sats) if hasattr(raw_sats, '__len__') else 'N/A'}")
                    if hasattr(raw_sats, '__len__') and len(raw_sats) > 20:
                        satellites_list = list(raw_sats)
                        print(f"[get_state] CRITICAL FIX: Using raw satellites from __dict__, now have {len(satellites_list)} items")
        
        print(f"[get_state] CRITICAL: Using {len(satellites_list)} satellites for response")
        
        # CRITICAL: Check if creating a new SimState truncates the list
        print(f"[get_state] CRITICAL: About to create SimState with {len(satellites_list)} satellites")
        state = SimState(
            time=sim_state.time,
            satellites=satellites_list,  # Use the full list directly
            groundSites=sim_state.groundSites,
            workload=sim_state.workload,
            metrics=sim_state.metrics,
            events=sim_state.events,
        )
        state_sat_count_after = len(state.satellites) if hasattr(state, 'satellites') and state.satellites else 0
        print(f"[get_state] CRITICAL: After SimState creation, state.satellites has {state_sat_count_after} items")
        if state_sat_count_after != len(satellites_list):
            print(f"[get_state] CRITICAL ERROR: SimState creation truncated satellites! Input had {len(satellites_list)}, output has {state_sat_count_after}")
            # Force fix using __setattr__
            object.__setattr__(state, 'satellites', list(satellites_list))
            print(f"[get_state] CRITICAL FIX: Fixed state.satellites, now has {len(state.satellites)} items")
        
        state._mode = mode  # Store mode for calculations
        
        # Return all processed satellites (no limit) - GPU optimizations allow full dataset
        # Removed limit for sandbox mode
        # state.satellites already contains all processed satellites - return all of them
        
        # Calculate response size for debugging
        import json
        try:
            sim_sat_count = len(sim_state.satellites) if hasattr(sim_state, 'satellites') and sim_state.satellites else 0
            sat_count = len(state.satellites) if hasattr(state, 'satellites') and state.satellites else 0
            print(f"[get_state] DEBUG: sim_state.satellites length = {sim_sat_count}")
            print(f"[get_state] DEBUG: state.satellites length = {sat_count}")
            print(f"[get_state] DEBUG: First 3 satellite IDs in sim_state: {[s.id for s in sim_state.satellites[:3]] if sim_sat_count > 0 else 'N/A'}")
            print(f"[get_state] DEBUG: First 3 satellite IDs in state: {[s.id for s in state.satellites[:3]] if sat_count > 0 else 'N/A'}")
            if sat_count != sim_sat_count:
                print(f"[get_state] WARNING: Satellite count mismatch! sim_state has {sim_sat_count}, state has {sat_count}")
            # Check if state.satellites is actually a truncated list
            if sat_count == 20 and sim_sat_count > 20:
                print(f"[get_state] ERROR: State has only {sat_count} satellites but sim_state has {sim_sat_count}! This is a bug!")
                print(f"[get_state] ERROR: Checking if sim_state.satellites is actually truncated...")
                # Check if sim_state.satellites is actually truncated
                actual_sim_count = len(list(sim_state.satellites)) if hasattr(sim_state.satellites, '__iter__') else 0
                print(f"[get_state] ERROR: Actual iterable count of sim_state.satellites: {actual_sim_count}")
                # Force use sim_state.satellites directly by creating a new list
                state.satellites = list(sim_state.satellites)
                sat_count = len(state.satellites)
                print(f"[get_state] FIXED: Now state.satellites has {sat_count} satellites after forcing list conversion")
            response_size = len(json.dumps(state.dict() if hasattr(state, 'dict') else state.__dict__))
            elapsed = time.time() - start_time
            print(f"[get_state] Generated new state (mode={mode}, tick={control['tick']}, sats={sat_count}, size={response_size/1024:.1f}KB, {elapsed:.3f}s)")
        except Exception as e:
            print(f"[get_state] Error in debug logging: {e}")
            import traceback
            traceback.print_exc()
        
        # CRITICAL: Always use global all_satellites_global to avoid truncation
        global all_satellites_global
        global_sat_count = len(all_satellites_global) if all_satellites_global else 0
        state_sat_count = len(state.satellites) if hasattr(state, 'satellites') and state.satellites else 0
        print(f"[get_state] FINAL CHECK: state.satellites has {state_sat_count} items, all_satellites_global has {global_sat_count} items")
        
        # ALWAYS use global if available and has more than 20
        if global_sat_count > 20:
            print(f"[get_state] CRITICAL: Using all_satellites_global ({global_sat_count} items) for response")
            # Replace satellites in state with global list using __setattr__
            object.__setattr__(state, 'satellites', list(all_satellites_global))
            final_sat_count = len(state.satellites)
            print(f"[get_state] CRITICAL FIX: Replaced state.satellites with global, now has {final_sat_count} satellites")
        else:
            final_sat_count = state_sat_count
            if final_sat_count <= 20:
                print(f"[get_state] WARNING: Only {final_sat_count} satellites available (global has {global_sat_count})")
        
        # Cache the response
        cache_sat_count = len(state.satellites) if hasattr(state, 'satellites') and state.satellites else 0
        print(f"[get_state] Caching state with {cache_sat_count} satellites (tick {control['tick']})")
        if cache_sat_count == 20:
            print(f"[get_state] WARNING: Caching state with only 20 satellites! This will cause all future responses to have only 20 satellites!")
        _state_cache = state
        _cache_tick = control["tick"]
        
        # Final verification before return
        return_sat_count = len(state.satellites) if hasattr(state, 'satellites') and state.satellites else 0
        print(f"[get_state] RETURNING: state.satellites has {return_sat_count} items")
        
        # Return as dict, ensuring satellites list is not truncated
        from fastapi.responses import JSONResponse
        
        # Yield control periodically during dict conversion to prevent blocking
        await asyncio.sleep(0)
        
        return_dict = state.dict() if hasattr(state, 'dict') else state.__dict__
        return_dict_sat_count = len(return_dict.get('satellites', [])) if isinstance(return_dict, dict) else 0
        print(f"[get_state] RETURNING DICT: satellites count = {return_dict_sat_count}, final_sat_count = {final_sat_count}")
        
        # ALWAYS force the full list from state.satellites to avoid any truncation
        if isinstance(return_dict, dict):
            # Use state.satellites directly (which we just fixed with global)
            # Batch convert to prevent blocking on large lists
            satellites_list = state.satellites
            if len(satellites_list) > 100:
                # For large lists, convert in batches with yields
                converted_sats = []
                batch_size = 100
                for i in range(0, len(satellites_list), batch_size):
                    batch = satellites_list[i:i+batch_size]
                    converted_sats.extend([s.dict() if hasattr(s, 'dict') else s.__dict__ for s in batch])
                    if i + batch_size < len(satellites_list):
                        await asyncio.sleep(0)  # Yield control between batches
                return_dict['satellites'] = converted_sats
            else:
                return_dict['satellites'] = [s.dict() if hasattr(s, 'dict') else s.__dict__ for s in satellites_list]
            
            return_dict_sat_count = len(return_dict['satellites'])
            print(f"[get_state] FORCED SATELLITES: Dict now has {return_dict_sat_count} satellites (state.satellites had {final_sat_count})")
            if return_dict_sat_count != final_sat_count:
                print(f"[get_state] CRITICAL ERROR: Dict conversion still truncated! Expected {final_sat_count}, got {return_dict_sat_count}")
        
        # FINAL FIX: Always use global if it has more satellites than the dict
        # Note: all_satellites_global is already declared as global at line 1296
        if isinstance(return_dict, dict):
            final_dict_sat_count = len(return_dict.get('satellites', []))
            global_sat_count = len(all_satellites_global) if all_satellites_global else 0
            print(f"[get_state] FINAL FIX CHECK: Dict has {final_dict_sat_count}, global has {global_sat_count}")
            # ALWAYS use global if it has more than 20 (the truncation limit we're seeing)
            if global_sat_count > 20:
                print(f"[get_state] FINAL FIX: Using global ({global_sat_count} items) instead of dict ({final_dict_sat_count} items)")
                # Batch convert global satellites too
                if global_sat_count > 100:
                    converted_global = []
                    batch_size = 100
                    for i in range(0, global_sat_count, batch_size):
                        batch = all_satellites_global[i:i+batch_size]
                        converted_global.extend([s.dict() if hasattr(s, 'dict') else s.__dict__ for s in batch])
                        if i + batch_size < global_sat_count:
                            await asyncio.sleep(0)  # Yield control between batches
                    return_dict['satellites'] = converted_global
                else:
                    return_dict['satellites'] = [s.dict() if hasattr(s, 'dict') else s.__dict__ for s in all_satellites_global]
                final_after_fix = len(return_dict['satellites'])
                print(f"[get_state] FINAL FIX: Dict now has {final_after_fix} satellites from global")
                if final_after_fix != global_sat_count:
                    print(f"[get_state] CRITICAL ERROR: After FINAL FIX, dict has {final_after_fix} but global has {global_sat_count}!")
            elif global_sat_count > 0 and global_sat_count <= 20:
                print(f"[get_state] WARNING: Global only has {global_sat_count} items! The loop may have stopped early.")
            elif global_sat_count == 0:
                print(f"[get_state] WARNING: Global is empty! all_satellites_global was never populated.")
        
        # Final yield before returning
        await asyncio.sleep(0)
        
        return JSONResponse(content=return_dict)


@app.post("/scenario")
async def update_scenario(update: ScenarioUpdate):
    """Update scenario mode or orbit offload percentage"""
    async with sim_lock:
        if update.mode is not None:
            control["scenario"]["mode"] = update.mode
            print(f"[Backend] Scenario updated to: {update.mode}")
        if update.orbitOffloadPercent is not None:
            control["scenario"]["orbitOffloadPercent"] = max(0.0, min(100.0, update.orbitOffloadPercent))
            print(f"[Backend] Orbit offload updated to: {update.orbitOffloadPercent}%")
    return {"status": "updated", "scenario": control["scenario"]}


@app.get("/snapshot")
async def get_snapshot():
    """Alias for /state endpoint (for compatibility)"""
    return await get_state()

