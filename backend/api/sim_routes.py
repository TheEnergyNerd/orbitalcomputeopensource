"""Simulation API routes"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from sim.types import SimSnapshot, RoutingDecision
from sim.scenario import get_preset_scenarios, apply_scenario, scenario_from_prompt
from sim.agent_routing_bandit import RoutingController
from sim.agent_failure import FailureAgent
from sim import world_instance

router = APIRouter()


# Initialize agents
routing_controller = RoutingController(world_instance)
failure_agent = FailureAgent(world_instance)


@router.get("/sim/state", response_model=SimSnapshot)
def get_state():
    """Get current simulation state"""
    return world_instance.get_snapshot()


@router.post("/sim/step_routing", response_model=Optional[RoutingDecision])
def step_routing():
    """Step routing agent for next job"""
    decision = routing_controller.decide_for_next_job()
    # world_instance is already mutated by env.step via route_job
    return decision


@router.post("/sim/step_failure")
def step_failure():
    """Step failure agent"""
    result = failure_agent.step()
    return result


@router.get("/scenario/presets")
def list_presets():
    """List available preset scenarios"""
    return get_preset_scenarios()


class ScenarioPromptBody(BaseModel):
    prompt: str


@router.post("/scenario/from_prompt")
def scenario_from_text(body: ScenarioPromptBody):
    """Generate scenario from text prompt"""
    sc = scenario_from_prompt(body.prompt)
    apply_scenario(world_instance, sc.id)
    return sc


@router.post("/scenario/apply/{scenario_id}")
def apply_scenario_by_id(scenario_id: str):
    """Apply a preset scenario by ID"""
    apply_scenario(world_instance, scenario_id)
    return {"status": "applied", "scenario_id": scenario_id}

