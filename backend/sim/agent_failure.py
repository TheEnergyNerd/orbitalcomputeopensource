"""Failure response agent"""
import numpy as np
from .env_failure import FailureEnvV1


class FailureAgent:
    """
    Tiny Q-learning on 2 actions.
    """

    def __init__(self, world, state_dim: int = 4, lr: float = 0.05, gamma: float = 0.9, epsilon: float = 0.1):
        self.env = FailureEnvV1(world)
        self.lr = lr
        self.gamma = gamma
        self.epsilon = epsilon
        # Q(s,a) approximated as linear: q = w_a · s
        self.w = np.zeros((2, state_dim), dtype=np.float32)
        self._last_state = None
        self._last_action = None

    def _q_values(self, state: np.ndarray):
        return self.w @ state

    def select_action(self, state: np.ndarray) -> int:
        if np.random.rand() < self.epsilon:
            return np.random.randint(2)
        q_vals = self._q_values(state)
        return int(np.argmax(q_vals))

    def step(self):
        if self._last_state is None:
            state, _ = self.env.reset()
        else:
            state = self._last_state

        action = self.select_action(state)
        next_state, reward, done, info = self.env.step(action)

        # Q-learning update
        q_vals = self._q_values(state)
        q_next = self._q_values(next_state)
        target = reward + self.gamma * np.max(q_next)
        td_error = target - q_vals[action]
        self.w[action] += self.lr * td_error * state

        self._last_state = next_state
        self._last_action = action

        return {
            "action": action,
            "reward": reward,
            "metrics": info["metrics"],
        }

