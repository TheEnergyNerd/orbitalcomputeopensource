"""
FastAPI routes for SystemState endpoints
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from services.starlink import get_starlink_service
from services.orbit_model import propagate_satellites, find_nearest_gateway
import asyncio

# Import these at function level to avoid circular import

router = APIRouter()

# Pydantic models matching SystemState spec
class GroundSiteModel(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    capacityMW: float
    baseLatencyMs: float
    energyPricePerMWh: float
    carbonKgPerMWh: float
    activeJobs: int

class OrbitalNodeModel(BaseModel):
    id: str
    tleLine1: str
    tleLine2: str
    lat: float
    lon: float
    altKm: float
    capacityMW: float
    utilization: float
    isSunlit: bool
    gatewaySiteId: str
    latencyMsToGateway: float

class WorkloadProfileModel(BaseModel):
    type: str  # "ai_inference" | "video" | "blockchain"
    demandMW: float
    orbitShare: float

class SystemMetricsModel(BaseModel):
    avgLatencyMs: float
    totalEnergyCostUSD: float
    totalCarbonKgPerMWh: float
    orbitSharePercent: float

class SystemStateModel(BaseModel):
    timestamp: str
    phase: str
    groundSites: List[GroundSiteModel]
    orbitalNodes: List[OrbitalNodeModel]
    workloads: List[WorkloadProfileModel]
    metrics: SystemMetricsModel

class SystemStateUpdate(BaseModel):
    workloads: Optional[List[WorkloadProfileModel]] = None
    phase: Optional[str] = None

@router.get("/state", response_model=SystemStateModel)
async def get_state():
    """Get current system state"""
    # Import here to avoid circular import
    from main import TOPOLOGY, sim_state, sim_lock
    
    async with sim_lock:
        if sim_state is None:
            raise HTTPException(status_code=503, detail="Simulation not initialized")
        
        # Convert legacy SimState to SystemState
        starlink_service = get_starlink_service()
        satellites = starlink_service.get_satellites()
        
        # Build orbital nodes - use sim_state satellites as primary source for now
        # This avoids propagation errors and keeps the API stable
        orbital_nodes = []
        gateways = [{"id": gw["id"], "lat": gw["lat"], "lon": gw["lon"]} for gw in TOPOLOGY["gateways"]]
        
        # Use sim_state satellites directly (they're already propagated by main.py)
        for sat in sim_state.satellites:  # Process all satellites
            gateway_id, latency = find_nearest_gateway(sat.lat, sat.lon, gateways)
            
            # Try to get TLE data if available
            tle_data = starlink_service.get_tle_list()
            tle = {"tleLine1": "", "tleLine2": ""}
            # Try to match by index (rough approximation)
            sat_index = int(sat.id.split("_")[-1]) if "_" in sat.id else 0
            if sat_index < len(tle_data):
                tle = tle_data[sat_index]
            
            orbital_nodes.append(OrbitalNodeModel(
                id=sat.id,
                tleLine1=tle.get("tleLine1", ""),
                tleLine2=tle.get("tleLine2", ""),
                lat=sat.lat,
                lon=sat.lon,
                altKm=sat.alt_km,
                capacityMW=sat.capacityMw,
                utilization=sat.utilization,
                isSunlit=sat.sunlit,
                gatewaySiteId=gateway_id,
                latencyMsToGateway=latency,
            ))
        
        # Convert ground sites
        ground_sites = [
            GroundSiteModel(
                id=site.id,
                name=site.label,
                lat=site.lat,
                lon=site.lon,
                capacityMW=site.powerMw,
                baseLatencyMs=45.0,
                energyPricePerMWh=site.energyPrice,
                carbonKgPerMWh=site.carbonIntensity,
                activeJobs=site.jobsRunning,
            )
            for site in sim_state.groundSites
        ]
        
        # Default workloads
        workloads = [
            WorkloadProfileModel(
                type="ai_inference",
                demandMW=20.0,
                orbitShare=sim_state.metrics.orbitSharePercent / 100,
            )
        ]
        
        return SystemStateModel(
            timestamp=sim_state.time,
            phase="SANDBOX",  # Will be managed by frontend
            groundSites=ground_sites,
            orbitalNodes=orbital_nodes,
            workloads=workloads,
            metrics=SystemMetricsModel(
                avgLatencyMs=sim_state.metrics.avgLatencyMs,
                totalEnergyCostUSD=sim_state.metrics.energyCostGround + sim_state.metrics.energyCostOrbit,
                totalCarbonKgPerMWh=sim_state.metrics.carbonGround + sim_state.metrics.carbonOrbit,
                orbitSharePercent=sim_state.metrics.orbitSharePercent,
            ),
        )

@router.post("/state/update", response_model=SystemStateModel)
async def update_state(update: SystemStateUpdate):
    """Update system state (workloads, phase, etc.)"""
    # For now, just return current state
    # TODO: Implement actual state updates
    # Import here to avoid circular import
    from main import TOPOLOGY, sim_state, sim_lock
    
    async with sim_lock:
        if sim_state is None:
            raise HTTPException(status_code=503, detail="Simulation not initialized")
        
        # Convert legacy SimState to SystemState (same as get_state)
        starlink_service = get_starlink_service()
        satellites = starlink_service.get_satellites()
        
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        nodes = propagate_satellites(satellites, now)
        
        # Build orbital nodes with gateway info
        orbital_nodes = []
        gateways = [{"id": gw["id"], "lat": gw["lat"], "lon": gw["lon"]} for gw in TOPOLOGY["gateways"]]
        
        for i, node in enumerate(nodes):
            gateway_id, latency = find_nearest_gateway(node["lat"], node["lon"], gateways)
            tle_data = starlink_service.get_tle_list()
            tle = tle_data[i] if i < len(tle_data) else {"tleLine1": "", "tleLine2": ""}
            
            # Find corresponding satellite in sim_state
            legacy_sat = next((s for s in sim_state.satellites if s.id == node["id"]), None)
            
            orbital_nodes.append(OrbitalNodeModel(
                id=node["id"],
                tleLine1=tle.get("tleLine1", ""),
                tleLine2=tle.get("tleLine2", ""),
                lat=node["lat"],
                lon=node["lon"],
                altKm=node["altKm"],
                capacityMW=legacy_sat.capacityMw if legacy_sat else 0.003,
                utilization=legacy_sat.utilization if legacy_sat else 0.0,
                isSunlit=node["isSunlit"],
                gatewaySiteId=gateway_id,
                latencyMsToGateway=latency,
            ))
        
        # Convert ground sites
        ground_sites = [
            GroundSiteModel(
                id=site.id,
                name=site.label,
                lat=site.lat,
                lon=site.lon,
                capacityMW=site.powerMw,
                baseLatencyMs=45.0,
                energyPricePerMWh=site.energyPrice,
                carbonKgPerMWh=site.carbonIntensity,
                activeJobs=site.jobsRunning,
            )
            for site in sim_state.groundSites
        ]
        
        # Use updated workloads if provided
        workloads = update.workloads if update.workloads else [
            WorkloadProfileModel(
                type="ai_inference",
                demandMW=20.0,
                orbitShare=sim_state.metrics.orbitSharePercent / 100,
            )
        ]
        
        return SystemStateModel(
            timestamp=sim_state.time,
            phase=update.phase if update.phase else "SANDBOX",
            groundSites=ground_sites,
            orbitalNodes=orbital_nodes,
            workloads=workloads,
            metrics=SystemMetricsModel(
                avgLatencyMs=sim_state.metrics.avgLatencyMs,
                totalEnergyCostUSD=sim_state.metrics.energyCostGround + sim_state.metrics.energyCostOrbit,
                totalCarbonKgPerMWh=sim_state.metrics.carbonGround + sim_state.metrics.carbonOrbit,
                orbitSharePercent=sim_state.metrics.orbitSharePercent,
            ),
        )

@router.get("/tle/starlink")
async def get_tle_list():
    """Get list of Starlink TLEs"""
    starlink_service = get_starlink_service()
    return starlink_service.get_tle_list()

