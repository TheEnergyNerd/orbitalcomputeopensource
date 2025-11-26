"""World simulation engine - wraps existing sim logic"""
import asyncio
import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Optional
import httpx

from skyfield.api import load, EarthSatellite
from .types import SimSnapshot, Node, Link, Job, RoutingDecision, NodeType

# Import existing topology and workload profile
TOPOLOGY = {
    "groundSites": [
        {"id": "abilene_edge", "label": "Abilene Edge DC", "lat": 32.45, "lon": -99.74, "region": "southwest"},
        {"id": "nova_hub", "label": "Northern Virginia Hyperscale", "lat": 39.02, "lon": -77.48, "region": "east_coast"},
        {"id": "dfw_hub", "label": "Dallas–Fort Worth Hyperscale", "lat": 32.92, "lon": -96.96, "region": "southwest"},
        {"id": "phx_hub", "label": "Phoenix Hyperscale", "lat": 33.45, "lon": -112.07, "region": "west_coast"},
    ],
    "gateways": [
        {"id": "abilene_gateway", "label": "Abilene Gateway", "lat": 32.6, "lon": -99.5},
        {"id": "dfw_gateway", "label": "DFW Gateway", "lat": 33.0, "lon": -97.0},
        {"id": "nova_gateway", "label": "NoVA Gateway", "lat": 39.1, "lon": -77.5},
        {"id": "phx_gateway", "label": "Phoenix Gateway", "lat": 33.4, "lon": -112.0},
    ],
}

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


def haversine(lat1, lon1, lat2, lon2):
    """Calculate great circle distance in km"""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


class World:
    """World simulation engine"""
    
    def __init__(self):
        self.satellites: List[EarthSatellite] = []
        self.ts = load.timescale()
        self.time_s = 0.0
        self.pending_jobs: List[Job] = []
        self.active_routes: List[RoutingDecision] = []
        self.nodes: Dict[str, Node] = {}
        self.links: Dict[str, Link] = {}
        self.job_counter = 0
        self.regional_load_multipliers: Dict[str, float] = {}
        self.fiber_cuts: List[tuple] = []  # List of (region_a, region_b) pairs
        self.disabled_shells: Dict[str, str] = {}  # shell_id -> region
        self.performance_history: List[Dict] = []
        self._lock = asyncio.Lock()
        
    async def initialize(self, satellites: List[EarthSatellite]):
        """Initialize world with satellites"""
        self.satellites = satellites
        self._build_nodes()
        self._build_links()
        
    def _build_nodes(self):
        """Build node list from topology and satellites"""
        self.nodes = {}
        
        # Ground sites
        for site in TOPOLOGY["groundSites"]:
            node = Node(
                id=site["id"],
                name=site["label"],
                node_type="ground",
                region=site.get("region", "unknown"),
                capacity_flops=150e12,  # 150 TFLOPS
                power_cost_per_kwh=0.05,  # $0.05/kWh baseline
            )
            self.nodes[site["id"]] = node
        
        # Gateways (also ground nodes but for routing)
        for gw in TOPOLOGY["gateways"]:
            node = Node(
                id=gw["id"],
                name=gw["label"],
                node_type="ground",
                region="gateway",
                capacity_flops=0.0,  # Gateways don't compute, just route
                power_cost_per_kwh=0.0,
            )
            self.nodes[gw["id"]] = node
            
        # LEO nodes (satellites) - use all available satellites
        for i, sat in enumerate(self.satellites):
            node = Node(
                id=f"leo_{i}",
                name=f"LEO Satellite {i}",
                node_type="leo",
                region="orbit",
                capacity_flops=10e12,  # 10 TFLOPS per sat
                power_cost_per_kwh=0.0,  # Solar powered
            )
            self.nodes[f"leo_{i}"] = node
    
    def _build_links(self):
        """Build link list between nodes"""
        self.links = {}
        link_id = 0
        
        # Links between LEO sats and gateways (simplified)
        for i in range(len(self.satellites)):
            leo_id = f"leo_{i}"
            for gw in TOPOLOGY["gateways"]:
                link = Link(
                    id=f"link_{link_id}",
                    src_id=leo_id,
                    dst_id=gw["id"],
                    rtt_ms=50.0,  # Simplified
                    packet_loss=0.001,
                    congestion_level=0.0,
                )
                self.links[f"link_{link_id}"] = link
                link_id += 1
                
        # Links between gateways and ground sites
        for gw in TOPOLOGY["gateways"]:
            for site in TOPOLOGY["groundSites"]:
                dist_km = haversine(gw["lat"], gw["lon"], site["lat"], site["lon"])
                rtt_ms = (dist_km / 300000.0) * 1000.0  # Speed of light
                
                link = Link(
                    id=f"link_{link_id}",
                    src_id=gw["id"],
                    dst_id=site["id"],
                    rtt_ms=rtt_ms,
                    packet_loss=0.0001,
                    congestion_level=0.0,
                )
                self.links[f"link_{link_id}"] = link
                link_id += 1
    
    def get_snapshot(self) -> SimSnapshot:
        """Get current simulation snapshot"""
        return SimSnapshot(
            time_s=self.time_s,
            nodes=list(self.nodes.values()),
            links=list(self.links.values()),
            pending_jobs=self.pending_jobs.copy(),
            active_routes=self.active_routes.copy(),
        )
    
    def get_candidate_nodes_for_job(self, job_id: str) -> List[Node]:
        """Get candidate nodes for routing a job"""
        job = next((j for j in self.pending_jobs if j.id == job_id), None)
        if not job:
            return []
        
        # Filter nodes by capacity and type
        # Only ground sites and LEO satellites can compute (not gateways)
        candidates = []
        for node in self.nodes.values():
            # Skip gateways (they don't compute)
            if node.id in [gw["id"] for gw in TOPOLOGY["gateways"]]:
                continue
            # Check if node is disabled
            if node.node_type == "leo" and node.region in self.disabled_shells.values():
                continue
            # Only include nodes with capacity
            if node.capacity_flops > 0:
                candidates.append(node)
        
        return candidates
    
    def route_job(self, job_id: str, node_id: str) -> Dict:
        """Route a job to a node and return metrics"""
        job = next((j for j in self.pending_jobs if j.id == job_id), None)
        if not job:
            return {"error": "job_not_found"}
        
        node = self.nodes.get(node_id)
        if not node:
            return {"error": "node_not_found"}
        
        # Remove from pending
        self.pending_jobs = [j for j in self.pending_jobs if j.id != job_id]
        
        # Calculate latency (simplified)
        latency_ms = 10.0  # Ground baseline
        if node.node_type == "leo":
            latency_ms = 50.0  # LEO baseline
        
        # Check for fiber cuts affecting this route
        node_region = node.region
        for cut_a, cut_b in self.fiber_cuts:
            if node_region in [cut_a, cut_b]:
                latency_ms *= 2.0  # Degraded
        
        # Calculate cost
        cost_usd = (job.flops / node.capacity_flops) * (node.power_cost_per_kwh / 1000.0) * 0.1
        
        # Check SLO violation
        slo_violated = latency_ms > job.latency_slo_ms
        
        # Create routing decision
        decision = RoutingDecision(
            job_id=job_id,
            target_node_id=node_id,
            source="rule_based",  # Will be updated by agent
        )
        self.active_routes.append(decision)
        
        return {
            "latency_ms": latency_ms,
            "cost_usd": cost_usd,
            "slo_violated": slo_violated,
        }
    
    def generate_jobs(self, now: datetime):
        """Generate new jobs based on workload profile"""
        hour = now.hour
        rate = WORKLOAD_PROFILE["hourly_arrival_rates"][hour % 24]
        
        # Apply regional load multipliers
        multiplier = 1.0
        for region, mult in self.regional_load_multipliers.items():
            multiplier = max(multiplier, mult)
        
        num_jobs = int(rate * 100 * multiplier)
        
        for _ in range(num_jobs):
            job_class = random.choices(
                WORKLOAD_PROFILE["job_classes"],
                weights=[jc["fraction"] for jc in WORKLOAD_PROFILE["job_classes"]],
            )[0]
            
            if job_class["size_dist"]["type"] == "lognormal":
                mu = job_class["size_dist"]["mu"]
                sigma = job_class["size_dist"]["sigma"]
                size_gb = math.exp(random.normalvariate(mu, sigma))
            else:
                size_gb = 1.0
            
            # Estimate FLOPS from size
            flops = size_gb * 1e9 * 1000  # Rough estimate
            
            job = Job(
                id=f"job_{self.job_counter}",
                size_gb=size_gb,
                flops=flops,
                latency_slo_ms=job_class["deadline_ms"],
                deadline_s=job_class["deadline_ms"] / 1000.0,
                jitter_tolerance_ms=job_class["deadline_ms"] * 0.1,
            )
            self.pending_jobs.append(job)
            self.job_counter += 1
    
    def advance_time(self, dt_seconds: float = 1.0):
        """Advance simulation time"""
        self.time_s += dt_seconds
        now = datetime.now(timezone.utc)
        self.generate_jobs(now)
        
        # Update link congestion (simplified)
        for link in self.links.values():
            # Increase congestion based on active routes using this link
            active_count = sum(1 for route in self.active_routes 
                             if route.target_node_id in [link.src_id, link.dst_id])
            link.congestion_level = min(1.0, active_count / 100.0)
    
    def get_performance_metrics(self) -> Dict:
        """Get current performance metrics"""
        if not self.active_routes:
            return {
                "avg_latency_ms": 0.0,
                "slo_violation_rate": 0.0,
            }
        
        # Calculate from active routes (simplified)
        total_latency = 0.0
        violations = 0
        for route in self.active_routes:
            job = next((j for j in self.pending_jobs if j.id == route.job_id), None)
            if job:
                # Estimate latency
                node = self.nodes.get(route.target_node_id)
                if node:
                    latency = 10.0 if node.node_type == "ground" else 50.0
                    total_latency += latency
                    if latency > job.latency_slo_ms:
                        violations += 1
        
        avg_latency = total_latency / len(self.active_routes) if self.active_routes else 0.0
        violation_rate = violations / len(self.active_routes) if self.active_routes else 0.0
        
        return {
            "avg_latency_ms": avg_latency,
            "slo_violation_rate": violation_rate,
        }
    
    def trigger_global_reroute(self):
        """Trigger global rerouting of active jobs"""
        # Simplified: just clear some active routes to force rerouting
        if len(self.active_routes) > 10:
            self.active_routes = self.active_routes[:len(self.active_routes) // 2]
    
    def set_regional_load(self, region: str, multiplier: float):
        """Set regional load multiplier"""
        self.regional_load_multipliers[region] = multiplier
    
    def cut_fiber_between(self, region_a: str, region_b: str):
        """Cut fiber between two regions"""
        self.fiber_cuts.append((region_a, region_b))
    
    def disable_leo_shell(self, shell_id: str, region: str):
        """Disable a LEO shell in a region"""
        self.disabled_shells[shell_id] = region

