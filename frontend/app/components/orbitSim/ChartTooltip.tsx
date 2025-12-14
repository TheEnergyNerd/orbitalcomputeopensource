"use client";

import { useState, useRef, useEffect } from "react";

interface ChartTooltipProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  data: Array<{ year: number; value: number }>;
  getValueAtPosition: (x: number, y: number) => { year: number; value: number } | null;
  groundData?: Array<{ year: number; value: number }>;
  unitsFormatter?: (v: number) => string;
  onHoverChange?: (hoverState: { x: number; year: number; groundValue: number; mixValue: number } | null) => void;
}

export function ChartTooltip({ 
  canvasRef, 
  data, 
  getValueAtPosition,
  groundData,
  unitsFormatter = (v) => v.toFixed(2),
  onHoverChange
}: ChartTooltipProps) {
  const [tooltip, setTooltip] = useState<{ 
    x: number; 
    y: number; 
    year: number; 
    value: number;
    groundValue?: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const point = getValueAtPosition(x, y);
      if (point) {
        // Find ground value for same year if available
        const groundPoint = groundData?.find(d => d.year === point.year);
        const tooltipData = {
          x: e.clientX,
          y: e.clientY,
          year: point.year,
          value: point.value,
          groundValue: groundPoint?.value
        };
        setTooltip(tooltipData);
        // Notify parent of hover state change (x is relative to canvas)
        if (onHoverChange && groundPoint) {
          onHoverChange({
            x: x, // Use canvas-relative x, not screen x
            year: point.year,
            groundValue: groundPoint.value,
            mixValue: point.value
          });
        }
      } else {
        setTooltip(null);
        if (onHoverChange) {
          onHoverChange(null);
        }
      }
    };
    
    const handleMouseLeave = () => {
      setTooltip(null);
      if (onHoverChange) {
        onHoverChange(null);
      }
    };
    
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [canvasRef, getValueAtPosition]);
  
  if (!tooltip) return null;
  
  return (
    <div
      ref={containerRef}
      className="fixed z-50 px-3 py-2 bg-gray-900/95 border border-gray-700 rounded text-xs pointer-events-none shadow-lg"
      style={{
        left: tooltip.x + 10,
        top: tooltip.y - 50,
      }}
    >
      <div className="text-white font-semibold mb-1">{tooltip.year}</div>
      {tooltip.groundValue !== undefined && (
        <div className="text-[#ff7070] mb-0.5">
          Ground: {unitsFormatter(tooltip.groundValue)}
        </div>
      )}
      <div className="text-[#4ade80]">
        Mix: {unitsFormatter(tooltip.value)}
      </div>
    </div>
  );
}

