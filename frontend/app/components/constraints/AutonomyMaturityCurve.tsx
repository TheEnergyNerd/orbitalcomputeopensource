"use client";

import { useEffect, useRef } from "react";
import type { DebugState } from "../../lib/orbitSim/debugState";

interface AutonomyMaturityCurveProps {
  debugState: DebugState;
}

export default function AutonomyMaturityCurve({ debugState }: AutonomyMaturityCurveProps) {
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
      
      // Calculate % autonomous operations (simplified from autonomy level)
      const autonomyPercent = Math.min(100, (entry.autonomyLevel / 3.0) * 100);
      
      return {
        year,
        autonomyPercent,
        failureRate: entry.failureRate,
        survivalFraction: entry.utilization_autonomy,
      };
    }).filter(Boolean) as Array<{
      year: number;
      autonomyPercent: number;
      failureRate: number;
      survivalFraction: number;
    }>;
    
    if (data.length === 0) return;
    
    const scaleY = chartHeight / 100; // 0-100%
    const scaleX = chartWidth / (years.length - 1 || 1);
    
    // Draw axes
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();
    
    // Draw zone boundaries
    ctx.fillStyle = "rgba(239, 68, 68, 0.1)";
    ctx.fillRect(padding.left, padding.top, chartWidth, 40 * scaleY);
    ctx.fillStyle = "rgba(234, 179, 8, 0.1)";
    ctx.fillRect(padding.left, padding.top + 40 * scaleY, chartWidth, 40 * scaleY);
    ctx.fillStyle = "rgba(16, 185, 129, 0.1)";
    ctx.fillRect(padding.left, padding.top + 80 * scaleY, chartWidth, 20 * scaleY);
    
    // Draw zone labels
    ctx.fillStyle = "#9ca3af";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Human-Dependent (Unsustainable)", padding.left + 10, padding.top + 20 * scaleY);
    ctx.fillText("Hybrid Ops", padding.left + 10, padding.top + 60 * scaleY);
    ctx.fillText("True Orbital Infrastructure", padding.left + 10, padding.top + 90 * scaleY);
    
    // Draw autonomy curve
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 3;
    ctx.beginPath();
    data.forEach((d, idx) => {
      const x = padding.left + idx * scaleX;
      const y = height - padding.bottom - d.autonomyPercent * scaleY;
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    
    // Draw labels
    ctx.fillStyle = "#9ca3af";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Year", width / 2, height - 10);
    
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("% Operations Fully Autonomous", 0, 0);
    ctx.restore();
    
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
    
    // Draw percentage labels on y-axis
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 100; i += 20) {
      const y = height - padding.bottom - i * scaleY;
      ctx.fillText(`${i}%`, padding.left - 10, y + 4);
    }
  }, [debugState]);
  
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-bold mb-4">Autonomy Maturity Curve</h3>
      <p className="text-sm text-gray-400 mb-4">
        % of operations fully autonomous over time. Tied to failure recovery rate, mean active lifetime, and survival fraction.
      </p>
      <canvas
        ref={canvasRef}
        width={800}
        height={400}
        className="w-full h-auto bg-gray-900 rounded"
      />
      <div className="mt-4 text-sm text-gray-400">
        <p>
          <strong>Key Insight:</strong> Without autonomy, orbital data centers collapse under their own maintenance burden.
          The transition from "fragile prototype era" → "self-sustaining infrastructure era" is visible here.
        </p>
      </div>
    </div>
  );
}

