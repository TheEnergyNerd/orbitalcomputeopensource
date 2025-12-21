/**
 * Component to display derived (read-only) values
 */

import React from 'react';

export interface DerivedValueProps {
  label: string;
  value: number;
  unit?: string;
  precision?: number;
  className?: string;
}

export function DerivedValue({
  label,
  value,
  unit = '',
  precision = 2,
  className = '',
}: DerivedValueProps) {
  const formattedValue = typeof value === 'number' && isFinite(value)
    ? value.toFixed(precision)
    : '—';

  return (
    <div className={`flex justify-between items-center py-2 px-3 bg-gray-50 border border-gray-200 rounded-lg ${className}`}>
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <span className="text-sm font-bold text-gray-900">
        {formattedValue}
        {unit && <span className="text-gray-500 ml-1">{unit}</span>}
      </span>
    </div>
  );
}

