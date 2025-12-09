"use client";

import React from "react";
import type { RocketType } from "../../lib/orbitSim/factoryTypes";

interface RocketTypeSelectorProps {
  value: RocketType;
  onChange: (rocketType: RocketType) => void;
}

const ROCKET_TYPES: RocketType[] = ["heavy", "medium", "light"];

const ROCKET_LABELS: Record<RocketType, string> = {
  "heavy": "Heavy",
  "medium": "Medium",
  "light": "Light",
};

export default function RocketTypeSelector({ value, onChange }: RocketTypeSelectorProps) {
  return (
    <div className="flex gap-1">
      {ROCKET_TYPES.map((rocketType) => (
        <button
          key={rocketType}
          onClick={() => onChange(rocketType)}
          className={`px-3 py-1.5 text-xs rounded transition ${
            value === rocketType
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {ROCKET_LABELS[rocketType]}
        </button>
      ))}
    </div>
  );
}




