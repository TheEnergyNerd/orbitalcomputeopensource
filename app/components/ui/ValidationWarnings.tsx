/**
 * Component to display validation warnings and errors
 */

import React from 'react';
import { ValidationWarning } from '../../lib/ui/sliderCoupling';

export interface ValidationWarningsProps {
  warnings: ValidationWarning[];
  className?: string;
}

export function ValidationWarnings({ warnings, className = '' }: ValidationWarningsProps) {
  if (warnings.length === 0) {
    return null;
  }

  const errors = warnings.filter(w => w.type === 'error');
  const warningsOnly = warnings.filter(w => w.type === 'warning');
  const info = warnings.filter(w => w.type === 'info');

  return (
    <div className={`space-y-2 ${className}`}>
      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((warning, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg"
            >
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold">
                !
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-red-900">{warning.message}</div>
                {warning.suggestion && (
                  <div className="text-xs text-red-700 mt-1">{warning.suggestion}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {warningsOnly.length > 0 && (
        <div className="space-y-1">
          {warningsOnly.map((warning, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg"
            >
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-white text-xs font-bold">
                ⚠
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-yellow-900">{warning.message}</div>
                {warning.suggestion && (
                  <div className="text-xs text-yellow-700 mt-1">{warning.suggestion}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {info.length > 0 && (
        <div className="space-y-1">
          {info.map((warning, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg"
            >
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                i
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-blue-900">{warning.message}</div>
                {warning.suggestion && (
                  <div className="text-xs text-blue-700 mt-1">{warning.suggestion}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

