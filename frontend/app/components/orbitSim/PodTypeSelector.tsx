"use client";

import React from "react";
import type { PodType } from "../../lib/orbitSim/factoryTypes";

interface PodTypeSelectorProps {
  value: PodType;
  onChange: (podType: PodType) => void;
}

const POD_TYPES: PodType[] = ["edge", "bulk", "green"];

const POD_LABELS: Record<PodType, string> = {
  edge: "Edge",
  bulk: "Bulk",
  green: "Green",
};

export default function PodTypeSelector({ value, onChange }: PodTypeSelectorProps) {
  return (
    <div className="flex gap-1">
      {POD_TYPES.map((podType) => (
        <button
          key={podType}
          onClick={() => onChange(podType)}
          className={`px-3 py-1.5 text-xs rounded transition ${
            value === podType
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {POD_LABELS[podType]}
        </button>
      ))}
    </div>
  );
}




