"""Scenario generator (LLM-pluggable but free by default)"""
from typing import Literal, List, Optional
from pydantic import BaseModel

ScenarioType = Literal[
    "default",
    "asia_sports_final",
    "transatlantic_fiber_cut",
    "leo_shell_outage",
]


class ScenarioConfig(BaseModel):
    id: str
    type: ScenarioType
    description: str
    # high-level knobs
    load_region: Optional[str] = None
    load_multiplier: float = 1.0
    outage_region: Optional[str] = None
    outage_satellite_shell: Optional[str] = None
    fiber_cut_region_pair: Optional[List[str]] = None


PRESET_SCENARIOS: List[ScenarioConfig] = [
    ScenarioConfig(
        id="asia_sports_final",
        type="asia_sports_final",
        description="3x load over East Asia for 90 minutes.",
        load_region="east_asia",
        load_multiplier=3.0,
    ),
    ScenarioConfig(
        id="transatlantic_fiber_cut",
        type="transatlantic_fiber_cut",
        description="Major transatlantic fiber cut forcing LEO routing.",
        fiber_cut_region_pair=["north_america", "europe"],
    ),
    ScenarioConfig(
        id="leo_shell_outage",
        type="leo_shell_outage",
        description="One LEO shell goes offline over the Pacific.",
        outage_region="pacific",
        outage_satellite_shell="shell_1",
    ),
]


def get_preset_scenarios() -> List[ScenarioConfig]:
    return PRESET_SCENARIOS


def apply_scenario(world, scenario_id: str):
    """
    Interpret ScenarioConfig and modify world state.
    Implement these hooks in your world:
      - world.set_regional_load(region, multiplier)
      - world.cut_fiber_between(region_a, region_b)
      - world.disable_leo_shell(shell_id, region)
    """
    scenario = next((s for s in PRESET_SCENARIOS if s.id == scenario_id), None)
    if scenario is None:
        return

    if scenario.load_region:
        world.set_regional_load(scenario.load_region, scenario.load_multiplier)
    if scenario.fiber_cut_region_pair:
        a, b = scenario.fiber_cut_region_pair
        world.cut_fiber_between(a, b)
    if scenario.outage_satellite_shell:
        world.disable_leo_shell(scenario.outage_satellite_shell, scenario.outage_region)


def scenario_from_prompt(prompt: str) -> ScenarioConfig:
    """
    For now: simple keyword-based router to presets.
    Later: replace with call to any free/local LLM.
    """
    p = prompt.lower()
    if "asia" in p or "sports" in p or "final" in p:
        return PRESET_SCENARIOS[0]
    if "fiber" in p or "transatlantic" in p:
        return PRESET_SCENARIOS[1]
    if "leo" in p or "outage" in p or "shell" in p:
        return PRESET_SCENARIOS[2]
    return PRESET_SCENARIOS[0]

