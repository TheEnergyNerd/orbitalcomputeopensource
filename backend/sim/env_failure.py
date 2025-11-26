"""Failure response RL-lite environment"""
import numpy as np
from typing import Dict
from .types import SimSnapshot


class FailureEnvV1:
    """
    State from last K timesteps (compressed).
    Action: 0 = hold, 1 = trigger reroute.
    Reward: improvement in latency/SLO over next window.
    """

    def __init__(self, world, window_size: int = 5):
        self.world = world
        self.window_size = window_size
        self.history = []  # list of dicts with metrics

    def _compute_metrics(self, snapshot: SimSnapshot) -> Dict:
        # Example metrics: avg latency, SLO violation rate
        # You need to have world compute these; here we assume:
        # world.get_performance_metrics() returns:
        # { "avg_latency_ms": float, "slo_violation_rate": float }
        return self.world.get_performance_metrics()

    def _encode_state(self) -> np.ndarray:
        if not self.history:
            return np.zeros(4, dtype=np.float32)
        latencies = [h["avg_latency_ms"] for h in self.history]
        violations = [h["slo_violation_rate"] for h in self.history]
        return np.array([
            latencies[-1] / 1000,
            np.mean(latencies) / 1000,
            violations[-1],
            np.mean(violations),
        ], dtype=np.float32)

    def reset(self):
        self.history.clear()
        snap = self.world.get_snapshot()
        self.history.append(self._compute_metrics(snap))
        return self._encode_state(), {}

    def step(self, action: int):
        """
        action: 0=hold, 1=trigger_reroute
        world.apply_failure_policy(action) should do the rerouting if 1.
        """
        if action == 1:
            self.world.trigger_global_reroute()

        # advance world a short time window
        self.world.advance_time(dt_seconds=1.0)
        snap = self.world.get_snapshot()
        metrics = self._compute_metrics(snap)
        self.history.append(metrics)
        if len(self.history) > self.window_size:
            self.history.pop(0)

        # reward: reduce latency and SLO violations
        avg_latency = metrics["avg_latency_ms"]
        slo_rate = metrics["slo_violation_rate"]
        reward = -0.001 * avg_latency - 2.0 * slo_rate

        state = self._encode_state()
        done = False
        return state, reward, done, {"metrics": metrics}

