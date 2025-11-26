"""Routing bandit agent"""
import numpy as np
from typing import List, Optional
from .types import Node, RoutingDecision, Job, SimSnapshot
from .env_routing import RoutingEnvV1


class RoutingBanditAgent:
    """
    Contextual bandit: linear model per action, trained with simple SGD.
    State_dim is fixed 8 from env; action space is 'candidate node index'.
    To keep it RL-lite, we just learn a shared weight vector and perturb per action.
    """

    def __init__(self, state_dim: int = 8, lr: float = 0.01, epsilon: float = 0.1):
        self.lr = lr
        self.epsilon = epsilon
        self.w = np.zeros(state_dim, dtype=np.float32)  # shared

    def select_action(self, state: np.ndarray, num_actions: int) -> int:
        if num_actions == 0:
            return 0
        if np.random.rand() < self.epsilon:
            return np.random.randint(num_actions)
        # simple scoring: same w for all actions
        score = float(state @ self.w)
        # action index doesn't matter for scoring; break ties randomly
        return 0 if score >= 0 else np.random.randint(num_actions)

    def update(self, state: np.ndarray, reward: float):
        # gradient ascent on reward: dL/dw = reward * state
        self.w += self.lr * reward * state


class RoutingController:
    """
    Wraps Env + Agent, exposes simple 'decide_route' API to FastAPI routes.
    """

    def __init__(self, world):
        self.env = RoutingEnvV1(world)
        self.agent = RoutingBanditAgent()
        self._last_state = None
        self._last_meta = None

    def decide_for_next_job(self) -> Optional[RoutingDecision]:
        state, meta = self.env.reset()
        candidate_nodes: List[Node] = meta.get("candidate_nodes", [])
        job: Job = meta.get("job")
        if not candidate_nodes or job is None:
            return None

        action_idx = self.agent.select_action(state, len(candidate_nodes))
        next_state, reward, done, info = self.env.step(action_idx, meta)
        self.agent.update(state, reward)

        # Update the routing decision source
        decision = self.world.active_routes[-1] if self.world.active_routes else None
        if decision:
            decision.source = "agent"

        return RoutingDecision(
            job_id=job.id,
            target_node_id=info["chosen_node_id"],
            source="agent",
        )

