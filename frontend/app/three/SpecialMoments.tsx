"use client";

import { useEffect, useState, useRef } from "react";
import { useSimulationStore } from "../store/simulationStore";
import { calculateCostCrossover } from "../lib/orbitSim/costCrossover";
import { calculateCarbonCrossover } from "../lib/orbitSim/carbonModel";
import { calculateComputeFromPower } from "../lib/orbitSim/computeEfficiency";
import { calculateTotalOrbitalPower } from "../lib/orbitSim/launchPowerModel";

interface SpecialMoment {
  id: string;
  type: "cost_crossover" | "carbon_crossover" | "orbit_50_percent" | "first_1TW_power" | "first_1EFLOP_compute";
  year: number;
  glowIntensity: number;
  active: boolean;
}

export function SpecialMoments() {
  const timeline = useSimulationStore((s) => s.timeline);
  const [moments, setMoments] = useState<SpecialMoment[]>([]);
  const detectedMomentsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!timeline || timeline.length === 0) return;

    const newMoments: SpecialMoment[] = [];
    const currentStep = timeline[timeline.length - 1];
    const currentYear = currentStep.year;

    // 1. Cost Crossover
    const orbitalCosts = timeline.map(s => ({ year: s.year, cost: s.costPerComputeGround }));
    const groundCosts = timeline.map(s => ({ year: s.year, cost: s.costPerComputeMix }));
    const costCrossover = calculateCostCrossover(orbitalCosts, groundCosts);
    if (costCrossover.crossover_year && currentYear >= costCrossover.crossover_year) {
      const momentId = `cost_crossover_${costCrossover.crossover_year}`;
      if (!detectedMomentsRef.current.has(momentId)) {
        detectedMomentsRef.current.add(momentId);
        newMoments.push({
          id: momentId,
          type: "cost_crossover",
          year: costCrossover.crossover_year,
          glowIntensity: 1.0,
          active: true,
        });
      }
    }

    // 2. Carbon Crossover
    const orbitalCarbon = timeline.map(s => ({ year: s.year, carbon_kg: (s.carbonMix || 0) * 1000 }));
    const groundCarbon = timeline.map(s => ({ year: s.year, carbon_kg: (s.carbonGround || 0) * 1000 }));
    const carbonCrossover = calculateCarbonCrossover(groundCarbon, orbitalCarbon);
    if (carbonCrossover.crossover_year && currentYear >= carbonCrossover.crossover_year) {
      const momentId = `carbon_crossover_${carbonCrossover.crossover_year}`;
      if (!detectedMomentsRef.current.has(momentId)) {
        detectedMomentsRef.current.add(momentId);
        newMoments.push({
          id: momentId,
          type: "carbon_crossover",
          year: carbonCrossover.crossover_year,
          glowIntensity: 1.0,
          active: true,
        });
      }
    }

    // 3. Orbit > 50% of world compute
    const orbitalShare = currentStep.orbitalShare || 0;
    if (orbitalShare > 0.5) {
      const momentId = `orbit_50_percent_${currentYear}`;
      if (!detectedMomentsRef.current.has(momentId)) {
        detectedMomentsRef.current.add(momentId);
        newMoments.push({
          id: momentId,
          type: "orbit_50_percent",
          year: currentYear,
          glowIntensity: 0.8,
          active: true,
        });
      }
    }

    // 4. First >1 TW orbital power
    // Calculate total orbital power from satellites
    // Assuming 100kW per satellite (BASE_POD)
    const totalSatellites = timeline.reduce((sum, step) => sum + (step.podsTotal || 0), 0);
    const powerPerSatelliteKW = 100; // BASE_POD
    const totalOrbitalPowerMW = (totalSatellites * powerPerSatelliteKW) / 1000; // Convert to MW
    const totalOrbitalPowerGW = totalOrbitalPowerMW / 1000; // Convert to GW
    const totalOrbitalPowerTW = totalOrbitalPowerGW / 1000; // Convert to TW
    
    if (totalOrbitalPowerTW >= 1.0) {
      const momentId = `first_1TW_power_${currentYear}`;
      if (!detectedMomentsRef.current.has(momentId)) {
        detectedMomentsRef.current.add(momentId);
        newMoments.push({
          id: momentId,
          type: "first_1TW_power",
          year: currentYear,
          glowIntensity: 1.0,
          active: true,
        });
      }
    }

    // 5. First >1 EFLOP orbital compute
    const totalOrbitalPowerWatts = totalOrbitalPowerMW * 1e6; // Convert to watts
    const currentYearForEfficiency = currentYear;
    const wattsPerTflop = 12.5 * Math.pow(0.85, (currentYearForEfficiency - 2025) / 2);
    const totalOrbitalComputeTFLOPs = totalOrbitalPowerWatts / wattsPerTflop;
    const totalOrbitalComputePFLOPs = totalOrbitalComputeTFLOPs / 1e6; // Convert to PFLOPs
    const totalOrbitalComputeEFLOPs = totalOrbitalComputePFLOPs / 1000; // Convert to EFLOPs (1 EFLOP = 1000 PFLOPs)
    
    if (totalOrbitalComputeEFLOPs >= 1.0) {
      const momentId = `first_1EFLOP_compute_${currentYear}`;
      if (!detectedMomentsRef.current.has(momentId)) {
        detectedMomentsRef.current.add(momentId);
        newMoments.push({
          id: momentId,
          type: "first_1EFLOP_compute",
          year: currentYear,
          glowIntensity: 1.0,
          active: true,
        });
      }
    }

    // Animate glow intensity
    setMoments(prev => {
      const updated = [...prev];
      newMoments.forEach(newMoment => {
        const existing = updated.find(m => m.id === newMoment.id);
        if (existing) {
          existing.active = true;
          existing.glowIntensity = Math.min(1, existing.glowIntensity + 0.05);
        } else {
          updated.push(newMoment);
        }
      });
      return updated;
    });
  }, [timeline]);

  // Animate glow pulses
  useEffect(() => {
    const interval = setInterval(() => {
      setMoments(prev => prev.map(m => ({
        ...m,
        glowIntensity: m.active 
          ? 0.7 + Math.sin(Date.now() / 1000) * 0.3 // Pulse between 0.7 and 1.0
          : Math.max(0, m.glowIntensity - 0.01) // Fade out
      })));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Render visual feedback (glow effects on charts/globe)
  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {moments.filter(m => m.active && m.glowIntensity > 0.1).map(moment => (
        <div
          key={moment.id}
          className="absolute inset-0"
          style={{
            boxShadow: `0 0 ${100 * moment.glowIntensity}px rgba(16, 185, 129, ${0.5 * moment.glowIntensity})`,
            pointerEvents: 'none',
          }}
        />
      ))}
    </div>
  );
}

