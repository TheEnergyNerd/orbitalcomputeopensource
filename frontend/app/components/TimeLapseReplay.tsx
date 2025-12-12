"use client";

import { useState, useEffect, useRef } from "react";
import { useSimulationHistoryStore } from "../store/simulationHistoryStore";
import { useSimulationStore } from "../store/simulationStore";

export default function TimeLapseReplay() {
  const { history, getYears, getReplayRange } = useSimulationHistoryStore();
  const timeline = useSimulationStore((s) => s.timeline);
  const currentYear = timeline && timeline.length > 0 ? timeline[timeline.length - 1]?.year : 2025;
  
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayYear, setReplayYear] = useState(currentYear);
  const [replaySpeed, setReplaySpeed] = useState(1); // years per second
  const replayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const years = getYears();
  const range = getReplayRange();
  
  useEffect(() => {
    if (isReplaying && replayIntervalRef.current === null) {
      replayIntervalRef.current = setInterval(() => {
        setReplayYear(prev => {
          const nextYear = prev + replaySpeed;
          if (nextYear >= range.max) {
            setIsReplaying(false);
            return range.max;
          }
          return nextYear;
        });
      }, 1000); // Update every second
    } else if (!isReplaying && replayIntervalRef.current) {
      clearInterval(replayIntervalRef.current);
      replayIntervalRef.current = null;
    }
    
    return () => {
      if (replayIntervalRef.current) {
        clearInterval(replayIntervalRef.current);
      }
    };
  }, [isReplaying, replaySpeed, range.max]);
  
  if (years.length === 0) {
    return (
      <div className="panel-glass p-3 rounded-lg text-xs text-gray-400">
        No history available. Deploy some years to build history.
      </div>
    );
  }
  
  return (
    <div className="panel-glass p-4 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Time-Lapse Replay</h3>
        <div className="text-xs text-gray-400">
          {years.length} years recorded
        </div>
      </div>
      
      {/* Timeline Scrubber */}
      <div className="mb-3">
        <input
          type="range"
          min={range.min}
          max={range.max}
          value={replayYear}
          onChange={(e) => setReplayYear(Number(e.target.value))}
          className="w-full"
          disabled={isReplaying}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{range.min}</span>
          <span className="font-semibold text-white">{replayYear}</span>
          <span>{range.max}</span>
        </div>
      </div>
      
      {/* Controls */}
      <div className="flex gap-2 items-center">
        <button
          onClick={() => {
            if (isReplaying) {
              setIsReplaying(false);
            } else {
              setReplayYear(range.min);
              setIsReplaying(true);
            }
          }}
          className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 rounded text-xs font-semibold"
        >
          {isReplaying ? "Pause" : "Replay"}
        </button>
        
        <select
          value={replaySpeed}
          onChange={(e) => setReplaySpeed(Number(e.target.value))}
          className="px-2 py-1 bg-gray-800 rounded text-xs"
          disabled={isReplaying}
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={5}>5x</option>
        </select>
        
        <button
          onClick={() => setReplayYear(currentYear)}
          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
        >
          Jump to Now
        </button>
      </div>
    </div>
  );
}

