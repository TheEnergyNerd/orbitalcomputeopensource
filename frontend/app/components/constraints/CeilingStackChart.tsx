"use client";

import { useEffect, useRef } from "react";
import type { DebugState } from "../../lib/orbitSim/debugState";

interface CeilingStackChartProps {
  debugState: DebugState;
  fullScreen?: boolean;
}

export default function CeilingStackChart({ debugState, fullScreen = false }: CeilingStackChartProps) {
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
    const padding = { top: 40, right: 60, bottom: 60, left: 80 };
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
      
      const launchCeiling = Math.min(entry.launchMassCeiling, entry.launchCostCeiling);
      const heatCeiling = entry.heatCeiling / 1e15; // Convert to PFLOPs
      const backhaulCeiling = entry.backhaulCeiling / 1e15;
      const autonomyCeiling = entry.autonomyCeiling;
      const actualCompute = entry.compute_effective_flops / 1e15;
      
      return {
        year,
        launchCeiling,
        heatCeiling,
        backhaulCeiling,
        autonomyCeiling,
        actualCompute,
      };
    }).filter(Boolean) as Array<{
      year: number;
      launchCeiling: number;
      heatCeiling: number;
      backhaulCeiling: number;
      autonomyCeiling: number;
      actualCompute: number;
    }>;
    
    if (data.length === 0) return;
    
    // Find max value for scaling
    const maxValue = Math.max(
      ...data.map(d => Math.max(
        d.launchCeiling,
        d.heatCeiling,
        d.backhaulCeiling,
        d.autonomyCeiling,
        d.actualCompute
      ))
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
    ctx.fillText("Max Possible Orbital Compute (PFLOPs)", 0, 0);
    ctx.restore();
    
    // Draw stacked areas
    const colors = {
      launch: "#eab308",
      heat: "#f97316",
      backhaul: "#3b82f6",
      autonomy: "#ef4444",
    };
    
    // Draw stacked areas (simplified - showing total ceiling)
    data.forEach((d, idx) => {
      const x = padding.left + idx * scaleX;
      const totalCeiling = Math.min(
        d.launchCeiling,
        d.heatCeiling,
        d.backhaulCeiling,
        d.autonomyCeiling
      );
      const y = height - padding.bottom - totalCeiling * scaleY;
      
      if (idx > 0) {
        const prevX = padding.left + (idx - 1) * scaleX;
        const prevTotal = Math.min(
          data[idx - 1].launchCeiling,
          data[idx - 1].heatCeiling,
          data[idx - 1].backhaulCeiling,
          data[idx - 1].autonomyCeiling
        );
        const prevY = height - padding.bottom - prevTotal * scaleY;
        
        // Draw line
        ctx.strokeStyle = "#eab308";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    });
    
    // Draw actual compute line
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    data.forEach((d, idx) => {
      const x = padding.left + idx * scaleX;
      const y = height - padding.bottom - d.actualCompute * scaleY;
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.setLineDash([]);
    
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
    const legendItems = [
      { label: "Launch Ceiling", color: colors.launch },
      { label: "Heat Ceiling", color: colors.heat },
      { label: "Backhaul Ceiling", color: colors.backhaul },
      { label: "Autonomy Ceiling", color: colors.autonomy },
      { label: "Actual Compute", color: "#10b981", dashed: true },
    ];
    
    let legendX = padding.left;
    legendItems.forEach(item => {
      ctx.fillStyle = item.color;
      if (item.dashed) {
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(legendX, legendY);
        ctx.lineTo(legendX + 20, legendY);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillRect(legendX, legendY - 5, 15, 10);
      }
      ctx.fillStyle = "#9ca3af";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(item.label, legendX + 20, legendY + 5);
      legendX += ctx.measureText(item.label).width + 40;
    });
  }, [debugState, fullScreen]);
  
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-bold mb-4">Ceiling Stack Chart</h3>
      <p className="text-sm text-gray-400 mb-4">
        Stacked ceilings showing Launch Mass, Heat, Backhaul, and Autonomy limits.
        Actual Achieved Compute shown as thin line.
      </p>
      <canvas
        ref={canvasRef}
        width={fullScreen ? 1200 : 800}
        height={fullScreen ? 600 : 400}
        className="w-full h-auto bg-gray-900 rounded"
      />
    </div>
  );
}

