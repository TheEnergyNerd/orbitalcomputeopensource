/**
 * Automatic Events System
 * Triggers narrative events automatically based on simulation conditions
 */

import { showToast } from "../utils/toast";
import { YearStep } from "./simulationConfig";

export interface AutomaticEvent {
  id: string;
  title: string;
  message: string;
  condition: (timeline: YearStep[], currentYear: number) => boolean;
  year?: number; // Optional: specific year to trigger
  triggered: Set<number>; // Track which years this has already triggered
}

export const AUTOMATIC_EVENTS: AutomaticEvent[] = [
  {
    id: "energy_crisis_warning_2028",
    title: "Warning Signs",
    message: "Energy analysts predict grid instability by 2030. Orbital compute could provide resilience.",
    condition: (timeline, currentYear) => currentYear === 2028,
    triggered: new Set(),
  },
  {
    id: "energy_crisis_2030",
    title: "Crisis Hits",
    message: "Grid costs spike 40%. Ground data centers struggle. Orbit becomes critical.",
    condition: (timeline, currentYear) => currentYear === 2030,
    triggered: new Set(),
  },
  {
    id: "energy_crisis_recovery_2032",
    title: "Recovery",
    message: "Orbital infrastructure provides stability. Goal: 50% orbit share achieved?",
    condition: (timeline, currentYear) => {
      if (currentYear !== 2032) return false;
      const currentStep = timeline[timeline.length - 1];
      return (currentStep.orbitalShare || 0) >= 0.5;
    },
    triggered: new Set(),
  },
  {
    id: "carbon_policy_2028",
    title: "Policy Shift",
    message: "Global carbon tax increases. Ground compute becomes expensive.",
    condition: (timeline, currentYear) => currentYear === 2028,
    triggered: new Set(),
  },
  {
    id: "carbon_halfway_2035",
    title: "Halfway Point",
    message: "Carbon tax now 100% higher. Orbit's advantage grows.",
    condition: (timeline, currentYear) => currentYear === 2035,
    triggered: new Set(),
  },
  {
    id: "carbon_deadline_2040",
    title: "Deadline",
    message: "2040 deadline arrives. Did you achieve carbon neutrality?",
    condition: (timeline, currentYear) => {
      if (currentYear !== 2040) return false;
      const currentStep = timeline[timeline.length - 1];
      return (currentStep.carbonMix || 0) <= 0;
    },
    triggered: new Set(),
  },
];

/**
 * Check and trigger automatic events based on current simulation state
 */
export function checkAutomaticEvents(timeline: YearStep[], currentYear: number): void {
  if (!timeline || timeline.length === 0) return;
  
  AUTOMATIC_EVENTS.forEach(event => {
    // Skip if already triggered for this year
    if (event.triggered.has(currentYear)) return;
    
    // Check condition
    if (event.condition(timeline, currentYear)) {
      // Trigger event
      showToast(`${event.title}: ${event.message}`, 'info');
      event.triggered.add(currentYear);
    }
  });
}

/**
 * Reset all events (useful for restarting simulation)
 */
export function resetAutomaticEvents(): void {
  AUTOMATIC_EVENTS.forEach(event => {
    event.triggered.clear();
  });
}

