"use client";

import { useState, useEffect } from "react";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { useSandboxStore } from "../store/sandboxStore";
import { useSimStore } from "../store/simStore";

interface Mission {
  id: string;
  title: string;
  description: string;
  goals: {
    latency?: number; // max latency in ms
    carbon?: number; // max carbon in kg
    orbitShare?: number; // min orbit share %
  };
  reward: string;
  completed: boolean;
}

const missions: Mission[] = [
  {
    id: "stabilize_abilene",
    title: "Stabilize Abilene Edge",
    description: "Ground DC overloaded. Deploy 2 orbital pods + reroute 20%",
    goals: {
      latency: 10,
      carbon: 200,
    },
    reward: "Unlock GEO Hub",
    completed: false,
  },
  {
    id: "surge_event",
    title: "Surge Event Response",
    description: "A massive ML job hits Phoenix. Offload 50% to orbit within 2 minutes.",
    goals: {
      orbitShare: 50,
    },
    reward: "Unlock Server Farm",
    completed: false,
  },
];

export default function MissionSystem() {
  const [activeMissions, setActiveMissions] = useState<Mission[]>(missions);
  const { getDeployedUnits } = useOrbitalUnitsStore();
  const { orbitalComputeUnits } = useSandboxStore();
  const state = useSimStore((s) => s.state);

  useEffect(() => {
    if (!state) return;

    setActiveMissions((prev) =>
      prev.map((mission) => {
        if (mission.completed) return mission;

        let completed = true;

        if (mission.goals.latency && state.metrics.avgLatencyMs > mission.goals.latency) {
          completed = false;
        }
        if (mission.goals.carbon && state.metrics.carbonGround > mission.goals.carbon) {
          completed = false;
        }
        if (mission.goals.orbitShare) {
          const orbitShare = (orbitalComputeUnits / (orbitalComputeUnits + 100)) * 100;
          if (orbitShare < mission.goals.orbitShare) {
            completed = false;
          }
        }

        if (completed && !mission.completed) {
          // Mission completed!
          console.log(`Mission completed: ${mission.title}`);
        }

        return { ...mission, completed };
      })
    );
  }, [state, orbitalComputeUnits]);

  const completedCount = activeMissions.filter((m) => m.completed).length;

  if (completedCount === activeMissions.length) return null;

  return (
    <div className="fixed top-20 left-6 z-40 panel-glass rounded-xl p-4 w-72 sm:w-80 max-w-[calc(100vw-12px)] shadow-2xl border border-white/10">
      <h3 className="text-lg font-bold text-accent-blue mb-4">Missions</h3>
      <div className="space-y-3">
        {activeMissions.map((mission) => (
          <div
            key={mission.id}
            className={`p-3 rounded-lg border-2 ${
              mission.completed
                ? "bg-accent-green/20 border-accent-green/50"
                : "bg-gray-800/50 border-gray-700/50"
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-semibold text-white text-sm">{mission.title}</h4>
              {mission.completed && <span className="text-accent-green">✓</span>}
            </div>
            <p className="text-xs text-gray-400 mb-2">{mission.description}</p>
            <div className="text-xs text-gray-500">
              Reward: <span className="text-accent-orange">{mission.reward}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

