"""Shared types for the orbital compute simulation"""
from typing import Literal, List, Dict, Optional
from pydantic import BaseModel

NodeType = Literal["leo", "ground"]


class Node(BaseModel):
    id: str
    name: str
    node_type: NodeType
    region: str
    capacity_flops: float
    power_cost_per_kwh: float


class Link(BaseModel):
    id: str
    src_id: str
    dst_id: str
    rtt_ms: float
    packet_loss: float
    congestion_level: float  # 0–1


class Job(BaseModel):
    id: str
    size_gb: float
    flops: float
    latency_slo_ms: float
    deadline_s: float
    jitter_tolerance_ms: float


class RoutingDecision(BaseModel):
    job_id: str
    target_node_id: str
    source: Literal["agent", "rule_based"]


class SimSnapshot(BaseModel):
    time_s: float
    nodes: List[Node]
    links: List[Link]
    pending_jobs: List[Job]
    active_routes: List[RoutingDecision]

