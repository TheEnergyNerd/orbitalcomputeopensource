/**
 * React hook for managing coupled sliders
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  calculateDerivedValues,
  validateConfiguration,
  getDependentSliders,
  isDerivedSlider,
  ValidationWarning,
} from './sliderCoupling';

export interface UseCoupledSlidersOptions {
  initialValues?: Record<string, number>;
  onValidationChange?: (warnings: ValidationWarning[]) => void;
  allParams?: Record<string, any>;
}

export interface UseCoupledSlidersReturn {
  values: Record<string, number>;
  derivedValues: Record<string, number>;
  warnings: ValidationWarning[];
  updateValue: (id: string, value: number) => void;
  updateValues: (updates: Record<string, number>) => void;
  reset: () => void;
  isDerived: (id: string) => boolean;
}

export function useCoupledSliders(
  options: UseCoupledSlidersOptions = {}
): UseCoupledSlidersReturn {
  const { initialValues = {}, onValidationChange, allParams = {} } = options;

  const [independentValues, setIndependentValues] = useState<Record<string, number>>(initialValues);
  
  // Sync with external initialValues changes (when parent state updates)
  // Only sync values that are in initialValues and haven't been manually updated
  const prevInitialValuesRef = useRef(initialValues);
  useEffect(() => {
    const currentInitial = initialValues;
    const prevInitial = prevInitialValuesRef.current;
    
    // Check if any initial values changed
    let hasChanges = false;
    const updated = { ...independentValues };
    
    for (const [key, newValue] of Object.entries(currentInitial)) {
      if (prevInitial[key] !== newValue && !isDerivedSlider(key)) {
        // Only update if it's an independent slider and value actually changed
        if (updated[key] !== newValue) {
          updated[key] = newValue;
          hasChanges = true;
        }
      }
    }
    
    if (hasChanges) {
      setIndependentValues(updated);
    }
    
    prevInitialValuesRef.current = currentInitial;
  }, [initialValues, independentValues]);

  // Calculate derived values whenever independent values change
  const derivedValues = useMemo(() => {
    return calculateDerivedValues(independentValues, allParams);
  }, [independentValues, allParams]);

  // Combine all values
  const allValues = useMemo(() => {
    return { ...independentValues, ...derivedValues, ...allParams };
  }, [independentValues, derivedValues, allParams]);

  // Validate configuration
  const warnings = useMemo(() => {
    return validateConfiguration(allValues, allParams);
  }, [allValues, allParams]);

  // Notify parent of validation changes (only when warnings actually change)
  const prevWarningsRef = useRef<ValidationWarning[]>([]);
  useEffect(() => {
    if (onValidationChange) {
      // Only call if warnings actually changed
      const warningsChanged = warnings.length !== prevWarningsRef.current.length ||
        warnings.some((w, i) => w.message !== prevWarningsRef.current[i]?.message);
      
      if (warningsChanged) {
        prevWarningsRef.current = warnings;
        onValidationChange(warnings);
      }
    }
  }, [warnings, onValidationChange]);

  // Update a single value
  const updateValue = useCallback((id: string, value: number) => {
    // Don't allow updating derived sliders directly
    if (isDerivedSlider(id)) {
      return;
    }

    setIndependentValues(prev => {
      // Only update if value actually changed
      if (prev[id] === value) return prev;
      const updated = { ...prev, [id]: value };
      return updated;
    });
  }, []);

  // Update multiple values at once
  const updateValues = useCallback((updates: Record<string, number>) => {
    setIndependentValues(prev => {
      let hasChanges = false;
      const updated = { ...prev };
      for (const [id, value] of Object.entries(updates)) {
        if (!isDerivedSlider(id) && prev[id] !== value) {
          updated[id] = value;
          hasChanges = true;
        }
      }
      return hasChanges ? updated : prev;
    });
  }, []);

  // Reset to initial values
  const reset = useCallback(() => {
    setIndependentValues(initialValues);
  }, [initialValues]);

  // Check if a slider is derived
  const isDerived = useCallback((id: string) => {
    return isDerivedSlider(id);
  }, []);

  return {
    values: allValues,
    derivedValues,
    warnings,
    updateValue,
    updateValues,
    reset,
    isDerived,
  };
}

