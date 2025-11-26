"""Routing RL-lite environment"""
import numpy as np
from typing import List, Tuple, Dict, Optional
from .types import SimSnapshot, Job, Node, RoutingDecision


class RoutingEnvV1:
    """
    RL-lite environment: choose a node for the *next* job.
    State is small numeric vector; action is index into candidate nodes.
    """

    def __init__(self, world):
        """
        world: your sim engine with methods:
          - get_snapshot() -> SimSnapshot
          - route_job(job_id: str, node_id: str) -> Dict with metrics
        """
        self.world = world
        self.last_job: Optional[Job] = None
        self.last_action_node: Optional[Node] = None

    def _encode_state(self, snapshot: SimSnapshot, job: Job, candidate_nodes: List[Node]) -> np.ndarray:
        """
        Simple fixed-length vector.
        We only keep coarse features to keep bandit/Q cheap.
        """
        # Example: [job_size, job_flops, job_latency_slo,
        #           avg_rtt, std_rtt, min_rtt,
        #           avg_congestion, max_congestion]
        rtts = []
        congestions = []
        for link in snapshot.links:
            rtts.append(link.rtt_ms)
            congestions.append(link.congestion_level)

        avg_rtt = np.mean(rtts) if rtts else 0.0
        std_rtt = np.std(rtts) if rtts else 0.0
        min_rtt = np.min(rtts) if rtts else 0.0
        avg_cong = np.mean(congestions) if congestions else 0.0
        max_cong = np.max(congestions) if congestions else 0.0

        return np.array([
            job.size_gb,
            job.flops / 1e12,           # scale
            job.latency_slo_ms / 1000,  # scale
            avg_rtt / 1000,
            std_rtt / 1000,
            min_rtt / 1000,
            avg_cong,
            max_cong,
        ], dtype=np.float32)

    def reset(self) -> Tuple[np.ndarray, Dict]:
        snapshot = self.world.get_snapshot()
        if not snapshot.pending_jobs:
            return np.zeros(8, dtype=np.float32), {"candidate_nodes": []}
        job = snapshot.pending_jobs[0]
        candidate_nodes = self.world.get_candidate_nodes_for_job(job.id)
        self.last_job = job
        state = self._encode_state(snapshot, job, candidate_nodes)
        return state, {"candidate_nodes": candidate_nodes, "job": job}

    def step(self, action_idx: int, meta: Dict) -> Tuple[np.ndarray, float, bool, Dict]:
        """
        Apply chosen node to last_job, advance world one step, compute reward.
        """
        job: Job = meta["job"]
        candidate_nodes: List[Node] = meta["candidate_nodes"]
        if not candidate_nodes:
            return np.zeros(8, dtype=np.float32), 0.0, True, {"error": "no_candidates"}

        chosen_node = candidate_nodes[action_idx % len(candidate_nodes)]
        # route_job should return metrics for this job:
        # {
        #   "latency_ms": float,
        #   "cost_usd": float,
        #   "slo_violated": bool
        # }
        result = self.world.route_job(job.id, chosen_node.id)
        self.last_action_node = chosen_node

        latency_ms = result.get("latency_ms", 0.0)
        cost_usd = result.get("cost_usd", 0.0)
        slo_violated = result.get("slo_violated", False)

        # Reward: cheap + fast + no SLO violation
        reward = -0.001 * latency_ms - cost_usd
        if slo_violated:
            reward -= 5.0

        # Next state
        snapshot = self.world.get_snapshot()
        done = len(snapshot.pending_jobs) == 0
        if done:
            next_state = np.zeros(8, dtype=np.float32)
            next_meta = {}
        else:
            next_job = snapshot.pending_jobs[0]
            candidate_nodes2 = self.world.get_candidate_nodes_for_job(next_job.id)
            next_state = self._encode_state(snapshot, next_job, candidate_nodes2)
            next_meta = {"candidate_nodes": candidate_nodes2, "job": next_job}

        info = {"result": result, "chosen_node_id": chosen_node.id}
        return next_state, reward, done, info

