"use client";

import { useSandboxStore } from "../store/sandboxStore";

export default function TimeScaleControl() {
  const { simState, setTimeScale } = useSandboxStore();

  if (!simState) return null;

  const options: Array<{ value: 1 | 10 | 100; label: string }> = [
    { value: 1, label: "1×" },
    { value: 10, label: "10×" },
    { value: 100, label: "100×" },
  ];

  return (
    <div className="fixed top-[calc(70px+500px)] left-6 z-40 bg-gray-800/90 border border-gray-700 rounded-lg p-2">
      <div className="text-xs text-gray-400 mb-1">Time Scale</div>
      <div className="flex gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => setTimeScale(option.value)}
            className={`px-3 py-1 text-xs rounded transition ${
              simState.timeScale === option.value
                ? "bg-accent-blue text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

