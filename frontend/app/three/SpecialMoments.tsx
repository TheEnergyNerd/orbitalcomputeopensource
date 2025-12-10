"use client";

import { useEffect, useState, useRef } from "react";
import { useSimulationStore } from "../store/simulationStore";
import { calculateCostCrossover } from "../lib/orbitSim/costCrossover";
import { calculateCarbonCrossover } from "../lib/orbitSim/carbonModel";
import { calculateComputeFromPower } from "../lib/orbitSim/computeEfficiency";
import { calculateTotalOrbitalPower } from "../lib/orbitSim/launchPowerModel";
import { showToast } from "../lib/utils/toast";

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
  const isInitialLoadRef = useRef(true);
  const lastYearRef = useRef<number | null>(null);

  useEffect(() => {
    if (!timeline || timeline.length === 0) return;

    const newMoments: SpecialMoment[] = [];
    const currentStep = timeline[timeline.length - 1];
    const currentYear = currentStep.year;

    // Skip showing alerts on initial load - only show when year actually changes
    const isInitialLoad = isInitialLoadRef.current;
    const lastYear = lastYearRef.current;
    const yearChanged = lastYear !== null && lastYear !== currentYear;
    
    // Update lastYear immediately to track changes
    if (lastYear !== currentYear) {
      lastYearRef.current = currentYear;
    }
    
    // Mark initial load as complete after first render
    if (isInitialLoad) {
      isInitialLoadRef.current = false;
      lastYearRef.current = currentYear;
      // Don't show any alerts on initial load, but still set moments for visual state
      // BUT: Check if we're already past thresholds and show them
      // (This handles the case where user loads at year 2035 and thresholds were already crossed)
    }

    // 1. Cost Crossover - only show if we JUST crossed over (current year equals crossover year) AND year actually changed
    const orbitalCosts = timeline.map(s => ({ year: s.year, cost: s.costPerComputeGround })).filter(c => c.cost > 0);
    const groundCosts = timeline.map(s => ({ year: s.year, cost: s.costPerComputeMix })).filter(c => c.cost > 0);
    
    // Only calculate if we have valid data
    if (orbitalCosts.length > 0 && groundCosts.length > 0) {
      const costCrossover = calculateCostCrossover(orbitalCosts, groundCosts);
      
      // Validate crossover year is reasonable (not too early, not in the past before timeline starts)
      const isValidCrossover = costCrossover.crossover_year && 
                               costCrossover.crossover_year >= 2025 && 
                               costCrossover.crossover_year <= 2050 &&
                               costCrossover.crossover_year >= timeline[0]?.year;
      
      // Show alert if:
      // 1. Crossover year exists and is valid
      // 2. Current year >= crossover year (not just equals)
      // 3. Haven't shown this alert before
      // 4. Either year changed OR this is initial load and we're already past threshold
      if (isValidCrossover && 
          costCrossover.crossover_year !== null &&
          currentYear >= costCrossover.crossover_year && 
          !detectedMomentsRef.current.has(`cost_crossover_${costCrossover.crossover_year}`) &&
          (yearChanged || (isInitialLoad && currentYear > costCrossover.crossover_year))) {
        const momentId = `cost_crossover_${costCrossover.crossover_year}`;
        if (!detectedMomentsRef.current.has(momentId)) {
          detectedMomentsRef.current.add(momentId);
          showToast(`💰 Cost Crossover Achieved! Orbital compute is now cheaper than ground in ${costCrossover.crossover_year}`, 'info');
          newMoments.push({
            id: momentId,
            type: "cost_crossover",
            year: costCrossover.crossover_year,
            glowIntensity: 1.0,
            active: true,
          });
        }
      } else if (isValidCrossover && costCrossover.crossover_year !== null && currentYear >= costCrossover.crossover_year) {
        // Already crossed over, just add to moments without showing toast
        const momentId = `cost_crossover_${costCrossover.crossover_year}`;
        if (!detectedMomentsRef.current.has(momentId)) {
          detectedMomentsRef.current.add(momentId);
          newMoments.push({
            id: momentId,
            type: "cost_crossover",
            year: costCrossover.crossover_year,
            glowIntensity: isInitialLoad ? 0.1 : 0.3, // Lower intensity for past crossovers
            active: true,
          });
        }
      } else if (costCrossover.crossover_year && !isValidCrossover) {
        console.warn(`[SpecialMoments] ⚠️ Invalid crossover year: ${costCrossover.crossover_year} (ignoring)`);
      }
    }

    // 2. Carbon Crossover - only show if we JUST crossed over (current year equals crossover year) AND year actually changed
    const orbitalCarbon = timeline.map(s => ({ year: s.year, carbon_kg: (s.carbonMix || 0) * 1000 }));
    const groundCarbon = timeline.map(s => ({ year: s.year, carbon_kg: (s.carbonGround || 0) * 1000 }));
    const carbonCrossover = calculateCarbonCrossover(groundCarbon, orbitalCarbon);
    
    if (carbonCrossover.crossover_year && 
        currentYear >= carbonCrossover.crossover_year && 
        !detectedMomentsRef.current.has(`carbon_crossover_${carbonCrossover.crossover_year}`) &&
        (yearChanged || (isInitialLoad && currentYear > carbonCrossover.crossover_year))) {
      const momentId = `carbon_crossover_${carbonCrossover.crossover_year}`;
      if (!detectedMomentsRef.current.has(momentId)) {
        detectedMomentsRef.current.add(momentId);
        showToast(`🌱 Carbon Crossover Achieved! Orbital compute is now cleaner than ground in ${carbonCrossover.crossover_year}`, 'info');
        newMoments.push({
          id: momentId,
          type: "carbon_crossover",
          year: carbonCrossover.crossover_year,
          glowIntensity: 1.0,
          active: true,
        });
      }
    } else if (carbonCrossover.crossover_year && currentYear >= carbonCrossover.crossover_year) {
      // Already crossed over, just add to moments without showing toast
      const momentId = `carbon_crossover_${carbonCrossover.crossover_year}`;
      if (!detectedMomentsRef.current.has(momentId)) {
        detectedMomentsRef.current.add(momentId);
        newMoments.push({
          id: momentId,
          type: "carbon_crossover",
          year: carbonCrossover.crossover_year,
          glowIntensity: isInitialLoad ? 0.1 : 0.3, // Lower intensity for past crossovers
          active: true,
        });
      }
    }

    // 3. Orbit > 50% of world compute - only alert when FIRST crossing threshold
    const orbitalShare = currentStep.orbitalShare || 0;
    const momentId50Percent = `orbit_50_percent`;
    
    if (orbitalShare > 0.5) {
      // Only show alert if we just crossed the threshold (not already detected)
      if (!detectedMomentsRef.current.has(momentId50Percent)) {
        // Check if we were below 50% last year (or this is the first time checking)
        const prevStep = timeline.length > 1 ? timeline[timeline.length - 2] : null;
        const prevOrbitalShare = prevStep?.orbitalShare || 0;
        
        // Show alert if we just crossed OR if year changed and we're above threshold
        if ((prevOrbitalShare <= 0.5 || !prevStep) && yearChanged && !isInitialLoad) {
          detectedMomentsRef.current.add(momentId50Percent);
          showToast(`🚀 Milestone: Orbit > 50% of world compute! (${(orbitalShare * 100).toFixed(1)}%)`, 'info');
          newMoments.push({
            id: momentId50Percent,
            type: "orbit_50_percent",
            year: currentYear,
            glowIntensity: 0.8,
            active: true,
          });
        } else if (!isInitialLoad && yearChanged) {
          // Just crossed this year, show alert
          detectedMomentsRef.current.add(momentId50Percent);
          showToast(`🚀 Milestone: Orbit > 50% of world compute! (${(orbitalShare * 100).toFixed(1)}%)`, 'info');
          newMoments.push({
            id: momentId50Percent,
            type: "orbit_50_percent",
            year: currentYear,
            glowIntensity: 0.8,
            active: true,
          });
        }
      } else {
        // Already detected, just maintain the moment
        newMoments.push({
          id: momentId50Percent,
          type: "orbit_50_percent",
          year: currentYear,
          glowIntensity: 0.3,
          active: true,
        });
      }
    }

    // 4. First >1 TW orbital power - only alert when FIRST crossing threshold
    // Calculate total orbital power from satellites
    // Assuming 100kW per satellite (BASE_POD)
    const totalSatellites = timeline.reduce((sum, step) => sum + (step.podsTotal || 0), 0);
    const powerPerSatelliteKW = 100; // BASE_POD
    const totalOrbitalPowerMW = (totalSatellites * powerPerSatelliteKW) / 1000; // Convert to MW
    const totalOrbitalPowerGW = totalOrbitalPowerMW / 1000; // Convert to GW
    const totalOrbitalPowerTW = totalOrbitalPowerGW / 1000; // Convert to TW
    
    const momentId1TW = `first_1TW_power`;
    if (totalOrbitalPowerTW >= 1.0) {
      // Only show alert if we just crossed the threshold (not already detected)
      if (!detectedMomentsRef.current.has(momentId1TW)) {
        // Check if we were below 1 TW last year (or this is the first time checking)
        const prevStep = timeline.length > 1 ? timeline[timeline.length - 2] : null;
        const prevTotalSatellites = prevStep ? timeline.slice(0, timeline.indexOf(prevStep) + 1).reduce((sum, step) => sum + (step.podsTotal || 0), 0) : 0;
        const prevTotalOrbitalPowerTW = (prevTotalSatellites * powerPerSatelliteKW) / 1000 / 1000 / 1000;
        
        // Show alert if we just crossed OR if year changed and we're above threshold
        if ((prevTotalOrbitalPowerTW < 1.0 || !prevStep) && yearChanged && !isInitialLoad) {
          detectedMomentsRef.current.add(momentId1TW);
          showToast(`⚡ Milestone: First >1 TW orbital power achieved! (${totalOrbitalPowerTW.toFixed(2)} TW)`, 'info');
          newMoments.push({
            id: momentId1TW,
            type: "first_1TW_power",
            year: currentYear,
            glowIntensity: 1.0,
            active: true,
          });
        } else if (!isInitialLoad && yearChanged) {
          // Just crossed this year, show alert
          detectedMomentsRef.current.add(momentId1TW);
          showToast(`⚡ Milestone: First >1 TW orbital power achieved! (${totalOrbitalPowerTW.toFixed(2)} TW)`, 'info');
          newMoments.push({
            id: momentId1TW,
            type: "first_1TW_power",
            year: currentYear,
            glowIntensity: 1.0,
            active: true,
          });
        }
      } else {
        // Already detected, just maintain the moment
        newMoments.push({
          id: momentId1TW,
          type: "first_1TW_power",
          year: currentYear,
          glowIntensity: 0.3,
          active: true,
        });
      }
    }

    // 5. First >1 EFLOP orbital compute - only alert when FIRST crossing threshold
    const totalOrbitalPowerWatts = totalOrbitalPowerMW * 1e6; // Convert to watts
    const currentYearForEfficiency = currentYear;
    const wattsPerTflop = 12.5 * Math.pow(0.85, (currentYearForEfficiency - 2025) / 2);
    const totalOrbitalComputeTFLOPs = totalOrbitalPowerWatts / wattsPerTflop;
    const totalOrbitalComputePFLOPs = totalOrbitalComputeTFLOPs / 1e6; // Convert to PFLOPs
    const totalOrbitalComputeEFLOPs = totalOrbitalComputePFLOPs / 1000; // Convert to EFLOPs (1 EFLOP = 1000 PFLOPs)
    
    const momentId1EFLOP = `first_1EFLOP_compute`;
    if (totalOrbitalComputeEFLOPs >= 1.0) {
      // Only show alert if we just crossed the threshold (not already detected)
      if (!detectedMomentsRef.current.has(momentId1EFLOP)) {
        // Check if we were below 1 EFLOP last year (or this is the first time checking)
        const prevStep = timeline.length > 1 ? timeline[timeline.length - 2] : null;
        let prevTotalOrbitalComputeEFLOPs = 0;
        
        if (prevStep) {
          const prevTotalSatellites = timeline.slice(0, timeline.indexOf(prevStep) + 1).reduce((sum, step) => sum + (step.podsTotal || 0), 0);
          const prevTotalOrbitalPowerMW = (prevTotalSatellites * powerPerSatelliteKW) / 1000;
          const prevTotalOrbitalPowerWatts = prevTotalOrbitalPowerMW * 1e6;
          const prevYearForEfficiency = prevStep.year;
          const prevWattsPerTflop = 12.5 * Math.pow(0.85, (prevYearForEfficiency - 2025) / 2);
          const prevTotalOrbitalComputeTFLOPs = prevTotalOrbitalPowerWatts / prevWattsPerTflop;
          const prevTotalOrbitalComputePFLOPs = prevTotalOrbitalComputeTFLOPs / 1e6;
          prevTotalOrbitalComputeEFLOPs = prevTotalOrbitalComputePFLOPs / 1000;
        }
        
        // Show alert if we just crossed OR if year changed and we're above threshold
        if ((prevTotalOrbitalComputeEFLOPs < 1.0 || !prevStep) && yearChanged && !isInitialLoad) {
          detectedMomentsRef.current.add(momentId1EFLOP);
          showToast(`💻 Milestone: First >1 EFLOP orbital compute achieved! (${totalOrbitalComputeEFLOPs.toFixed(2)} EFLOPs)`, 'info');
          newMoments.push({
            id: momentId1EFLOP,
            type: "first_1EFLOP_compute",
            year: currentYear,
            glowIntensity: 1.0,
            active: true,
          });
        } else if (!isInitialLoad && yearChanged) {
          // Just crossed this year, show alert
          detectedMomentsRef.current.add(momentId1EFLOP);
          showToast(`💻 Milestone: First >1 EFLOP orbital compute achieved! (${totalOrbitalComputeEFLOPs.toFixed(2)} EFLOPs)`, 'info');
          newMoments.push({
            id: momentId1EFLOP,
            type: "first_1EFLOP_compute",
            year: currentYear,
            glowIntensity: 1.0,
            active: true,
          });
        }
      } else {
        // Already detected, just maintain the moment
        newMoments.push({
          id: momentId1EFLOP,
          type: "first_1EFLOP_compute",
          year: currentYear,
          glowIntensity: 0.3,
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
  // Enhanced with different colors for different moment types
  const getGlowColor = (type: SpecialMoment['type']) => {
    switch (type) {
      case 'cost_crossover':
        return 'rgba(34, 197, 94, 0.6)'; // Green for cost
      case 'carbon_crossover':
        return 'rgba(16, 185, 129, 0.6)'; // Emerald for carbon
      case 'orbit_50_percent':
        return 'rgba(59, 130, 246, 0.5)'; // Blue for orbit milestone
      case 'first_1TW_power':
        return 'rgba(168, 85, 247, 0.6)'; // Purple for power milestone
      case 'first_1EFLOP_compute':
        return 'rgba(236, 72, 153, 0.6)'; // Pink for compute milestone
      default:
        return 'rgba(16, 185, 129, 0.5)';
    }
  };

  return (
    <>
      <style>{`
        @keyframes thresholdPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        .threshold-glow {
          animation: thresholdPulse 2s ease-in-out infinite;
        }
      `}</style>
      <div className="fixed inset-0 pointer-events-none z-50">
        {moments.filter(m => m.active && m.glowIntensity > 0.1).map(moment => (
          <div
            key={moment.id}
            className="absolute inset-0 transition-all duration-500 threshold-glow"
            style={{
              boxShadow: `0 0 ${120 * moment.glowIntensity}px ${getGlowColor(moment.type)}, 0 0 ${200 * moment.glowIntensity}px ${getGlowColor(moment.type)}`,
              pointerEvents: 'none',
            }}
          />
        ))}
      </div>
    </>
  );
}

