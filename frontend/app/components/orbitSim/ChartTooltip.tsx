"use client";

import { useState, useRef, useEffect } from "react";

interface ChartTooltipProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  data: Array<{ year: number; value: number }>;
  getValueAtPosition: (x: number, y: number) => { year: number; value: number } | null;
}

export function ChartTooltip({ canvasRef, data, getValueAtPosition }: ChartTooltipProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; year: number; value: number } | null>(null);
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
        setTooltip({
          x: e.clientX,
          y: e.clientY,
          year: point.year,
          value: point.value
        });
      } else {
        setTooltip(null);
      }
    };
    
    const handleMouseLeave = () => {
      setTooltip(null);
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
      className="fixed z-50 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs pointer-events-none"
      style={{
        left: tooltip.x + 10,
        top: tooltip.y - 30,
      }}
    >
      <div className="text-white font-semibold">{tooltip.year}</div>
      <div className="text-gray-300">{tooltip.value.toFixed(2)}</div>
    </div>
  );
}

