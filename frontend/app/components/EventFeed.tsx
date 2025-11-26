"use client";

import { useSimStore } from "../store/simStore";

export default function EventFeed() {
  const state = useSimStore((s) => s.state);

  if (!state || !state.events || state.events.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-6 right-6 sm:right-[420px] panel-glass rounded-xl p-3 sm:p-4 max-h-40 overflow-y-auto z-20">
      <h3 className="text-sm font-semibold text-accent-blue mb-3 uppercase tracking-wider">Event Log</h3>
      <div className="space-y-2">
        {state.events.map((event, idx) => (
          <div key={idx} className="text-xs text-gray-300 py-1.5 px-2 rounded bg-gray-800/30 border-l-2 border-accent-blue/50">
            {event}
          </div>
        ))}
      </div>
    </div>
  );
}

