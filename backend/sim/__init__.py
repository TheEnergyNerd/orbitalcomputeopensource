"""Orbital Compute Simulation Module"""
from .world import World

# Singleton instance
_world_instance = None

def get_world_instance() -> World:
    global _world_instance
    if _world_instance is None:
        _world_instance = World()
    return _world_instance

# Export for convenience
world_instance = get_world_instance()

