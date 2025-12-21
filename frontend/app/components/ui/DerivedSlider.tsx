/**
 * Component to display derived (read-only) values as visual sliders
 * These sliders move automatically when their inputs change, showing physics coupling
 */

import React, { useEffect, useRef, useState } from 'react';
import { getSliderConfig } from '../../lib/ui/sliderCoupling';

export interface DerivedSliderProps {
  id: string;
  label: string;
  value: number;
  unit?: string;
  precision?: number;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
}

export function DerivedSlider({
  id,
  label,
  value,
  unit = '',
  precision = 2,
  className = '',
  min,
  max,
  step = 0.1,
}: DerivedSliderProps) {
  const [prevValue, setPrevValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const sliderRef = useRef<HTMLInputElement>(null);
  const config = getSliderConfig(id);

  // Detect value changes and trigger animation
  useEffect(() => {
    if (Math.abs(value - prevValue) > 0.001) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 600);
      
      // Flash highlight
      if (sliderRef.current) {
        sliderRef.current.style.transition = 'all 0.3s ease';
      }
      
      setPrevValue(value);
      return () => clearTimeout(timer);
    }
  }, [value, prevValue]);

  const formattedValue = typeof value === 'number' && isFinite(value)
    ? value.toFixed(precision)
    : '—';

  // Determine direction of change
  const direction = value > prevValue ? '↑' : value < prevValue ? '↓' : '';

  // Get min/max from config if not provided, or calculate reasonable defaults
  const effectiveMin = min ?? 0;
  // For max, use a reasonable multiplier of current value, or config max if available
  const effectiveMax = max ?? Math.max(value * 1.5, 1000);

  return (
    <div className={`mb-4 last:mb-0 ${className}`}>
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs font-medium text-gray-600 italic">
          {label}
          <span className="text-[9px] text-gray-400 ml-1">(auto)</span>
        </label>
        <div className="flex items-center gap-1">
          {direction && isAnimating && (
            <span className={`text-xs font-bold ${value > prevValue ? 'text-green-600' : 'text-red-600'}`}>
              {direction}
            </span>
          )}
          <span className={`text-sm font-mono font-bold ${isAnimating ? 'text-blue-600' : 'text-gray-700'}`}>
            {unit === '%' ? (value * 100).toFixed(0) : formattedValue}
          </span>
          <span className="text-[10px] text-gray-500 font-medium">{unit}</span>
        </div>
      </div>
      <input
        ref={sliderRef}
        type="range"
        min={effectiveMin}
        max={effectiveMax}
        step={step}
        value={value}
        disabled
        readOnly
        className={`w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-not-allowed transition-all duration-300 ${
          isAnimating ? 'bg-blue-100 ring-2 ring-blue-300 shadow-md' : ''
        }`}
        style={{
          opacity: 0.7,
          pointerEvents: 'none',
          transition: 'all 0.3s ease',
        }}
      />
    </div>
  );
}

