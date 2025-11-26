"use client";

interface MetricCardProps {
  title: string;
  current: number;
  baseline: number;
  unit: string;
  color: "blue" | "green" | "orange";
  highlight?: boolean;
}

export default function MetricCard({ title, current, baseline, unit, color, highlight }: MetricCardProps) {
  const improvement = ((baseline - current) / baseline) * 100;
  const isImprovement = improvement > 0;
  
  // Calculate bar width (current as percentage of baseline, with baseline as full width)
  const maxValue = Math.max(baseline, current) * 1.1;
  const baselineWidth = 100; // Baseline is always full width (grey background)
  const currentWidth = (current / maxValue) * 100; // Current as colored fill
  
  const colorClasses = {
    blue: "bg-accent-blue",
    green: "bg-accent-green",
    orange: "bg-accent-orange",
  };
  
  return (
    <div className={`bg-gray-800/50 rounded-lg p-3 flex-1 min-w-[140px] ${highlight ? 'ring-2 ring-accent-blue animate-pulse' : ''}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-gray-400">{title}</span>
        <span className={`text-xs font-semibold ${isImprovement ? 'text-accent-green' : improvement < 0 ? 'text-red-400' : 'text-gray-400'}`}>
          {isImprovement ? '↓' : improvement < 0 ? '↑' : ''} {Math.abs(improvement).toFixed(0)}%
        </span>
      </div>
      
      <div className="relative w-full bg-gray-700 rounded h-4">
        {/* Baseline (full width grey background) */}
        <div className="absolute inset-0 bg-gray-600 rounded" />
        {/* Current (colored fill proportional to baseline) */}
        <div 
          className={`absolute inset-0 ${colorClasses[color]} rounded transition-all`}
          style={{ width: `${currentWidth}%` }}
        />
        {/* Value text overlay */}
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white font-semibold">
          {current.toFixed(0)} {unit}
        </div>
      </div>
    </div>
  );
}

