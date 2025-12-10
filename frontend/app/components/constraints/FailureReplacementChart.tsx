"use client";

import { useEffect, useRef } from "react";
import type { DebugState } from "../../lib/orbitSim/debugState";

interface FailureReplacementChartProps {
  debugState: DebugState;
}

export default function FailureReplacementChart({ debugState }: FailureReplacementChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const years = Object.keys(debugState)
      .filter(key => key !== "errors")
      .map(Number)
      .sort((a, b) => a - b);
    
    if (years.length === 0) return;
    
    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 40, right: 40, bottom: 60, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(0, 0, width, height);
    
    // Get data
    const data = years.map(year => {
      const entry = debugState[year];
      if (!entry) return null;
      return {
        year,
        failures: entry.satellitesFailed,
        replacements: entry.satellitesRecovered + entry.satellitesAdded,
      };
    }).filter(Boolean) as Array<{ year: number; failures: number; replacements: number }>;
    
    if (data.length === 0) return;
    
    // Find max value
    const maxValue = Math.max(
      ...data.map(d => Math.max(d.failures, d.replacements))
    );
    
    const scaleY = chartHeight / maxValue;
    const scaleX = chartWidth / (years.length - 1 || 1);
    
    // Draw axes
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();
    
    // Draw labels
    ctx.fillStyle = "#9ca3af";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Year", width / 2, height - 10);
    
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Satellites", 0, 0);
    ctx.restore();
    
    // Draw failures line
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, idx) => {
      const x = padding.left + idx * scaleX;
      const y = height - padding.bottom - d.failures * scaleY;
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    
    // Draw replacements line
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, idx) => {
      const x = padding.left + idx * scaleX;
      const y = height - padding.bottom - d.replacements * scaleY;
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    
    // Highlight regions where failures > replacements
    data.forEach((d, idx) => {
      if (d.failures > d.replacements) {
        const x = padding.left + idx * scaleX;
        const failuresY = height - padding.bottom - d.failures * scaleY;
        const replacementsY = height - padding.bottom - d.replacements * scaleY;
        
        ctx.fillStyle = "rgba(239, 68, 68, 0.2)";
        ctx.fillRect(x - scaleX / 2, replacementsY, scaleX, failuresY - replacementsY);
      }
    });
    
    // Draw year labels
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    data.forEach((d, idx) => {
      if (idx % Math.ceil(data.length / 10) === 0 || idx === data.length - 1) {
        const x = padding.left + idx * scaleX;
        ctx.fillText(d.year.toString(), x, height - padding.bottom + 20);
      }
    });
    
    // Draw legend
    const legendY = padding.top - 20;
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(padding.left, legendY - 5, 15, 10);
    ctx.fillStyle = "#9ca3af";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Annual Failures", padding.left + 20, legendY + 5);
    
    ctx.fillStyle = "#10b981";
    ctx.fillRect(padding.left + 120, legendY - 5, 15, 10);
    ctx.fillStyle = "#9ca3af";
    ctx.fillText("Annual Replacements", padding.left + 140, legendY + 5);
  }, [debugState]);
  
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-bold mb-4">Failure vs Replacement Phase Diagram</h3>
      <p className="text-sm text-gray-400 mb-4">
        If Failures &gt; Replacements: Fleet shrinks, compute decays.
        If Replacements &gt; Failures: Net growth resumes.
      </p>
      <canvas
        ref={canvasRef}
        width={600}
        height={400}
        className="w-full h-auto bg-gray-900 rounded"
      />
    </div>
  );
}

