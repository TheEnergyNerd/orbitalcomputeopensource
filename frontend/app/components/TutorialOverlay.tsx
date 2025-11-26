"use client";

import React from "react";
import { useTutorialStore } from "../store/tutorialStore";
import { useEffect, useState, useRef } from "react";
import * as Cesium from "cesium";
import TutorialStep4 from "./TutorialStep4";

export default function TutorialOverlay({ viewerRef }: { viewerRef?: React.MutableRefObject<Cesium.Viewer | null> }) {
  const { currentStep, isActive, nextStep, completeTutorial } = useTutorialStore();
  const [metrics, setMetrics] = useState({
    latency: { avg: 45, p95: 120, consistency: 0.85 },
    cost: { perJob: 0.12, perKwh: 0.08 },
    carbon: { perJob: 250, perKwh: 180 },
    resilience: { recoveryTime: 0, rerouteRate: 0, outageImpact: 0 },
  });
  const [animationPhase, setAnimationPhase] = useState(0);
  const [interactiveReady, setInteractiveReady] = useState(false);

  useEffect(() => {
    if (!isActive) return;

    let isMounted = true;

    // Smooth metric animations
    const interval = setInterval(() => {
      if (!isMounted) {
        clearInterval(interval);
        return;
      }
      
      setAnimationPhase((prev) => {
        const next = prev + 0.1;
        // Prevent infinite growth
        return next > 1000 ? 0 : next;
      });
      
      if (currentStep === 1) {
        // Ground-only baseline with subtle variations
        const latencyAvg = 45 + Math.sin(animationPhase) * 5;
        const latencyP95 = 120 + Math.sin(animationPhase * 0.7) * 15;
        const consistency = 0.85 + Math.sin(animationPhase * 0.5) * 0.05;
        
        setMetrics({
          latency: { 
            avg: isNaN(latencyAvg) ? 45 : Math.max(0, latencyAvg), 
            p95: isNaN(latencyP95) ? 120 : Math.max(0, latencyP95), 
            consistency: isNaN(consistency) ? 0.85 : Math.max(0, Math.min(1, consistency))
          },
          cost: { perJob: 0.12, perKwh: 0.08 },
          carbon: { perJob: 250, perKwh: 180 },
          resilience: { recoveryTime: 0, rerouteRate: 0, outageImpact: 0 },
        });
      } else if (currentStep === 2) {
        // Stress event - dramatic spikes
        const spike = Math.sin(animationPhase * 2) * 0.5 + 0.5;
        const latencyAvg = 200 + spike * 80;
        const latencyP95 = 500 + spike * 150;
        const consistency = 0.3 - spike * 0.1;
        const costPerKwh = 0.15 + spike * 0.08;
        const carbonPerKwh = 250 + spike * 50;
        
        setMetrics({
          latency: { 
            avg: isNaN(latencyAvg) ? 200 : Math.max(0, latencyAvg), 
            p95: isNaN(latencyP95) ? 500 : Math.max(0, latencyP95), 
            consistency: isNaN(consistency) ? 0.3 : Math.max(0, Math.min(1, consistency))
          },
          cost: { 
            perJob: 0.35 + spike * 0.15, 
            perKwh: isNaN(costPerKwh) ? 0.15 : Math.max(0, costPerKwh)
          },
          carbon: { 
            perJob: 350 + spike * 80, 
            perKwh: isNaN(carbonPerKwh) ? 250 : Math.max(0, carbonPerKwh)
          },
          resilience: { recoveryTime: 45, rerouteRate: 0.2, outageImpact: 0.8 },
        });
      } else if (currentStep === 3) {
        // Orbit comes online - smooth improvement
        const improvement = Math.min(1, animationPhase * 0.3);
        const latencyAvg = 45 - improvement * 20;
        const latencyP95 = 120 - improvement * 60;
        const consistency = 0.85 + improvement * 0.1;
        const costPerKwh = 0.08 - improvement * 0.06;
        const carbonPerKwh = 180 - improvement * 180;
        
        setMetrics({
          latency: { 
            avg: isNaN(latencyAvg) ? 25 : Math.max(0, latencyAvg), 
            p95: isNaN(latencyP95) ? 60 : Math.max(0, latencyP95), 
            consistency: isNaN(consistency) ? 0.95 : Math.max(0, Math.min(1, consistency))
          },
          cost: { 
            perJob: 0.12 - improvement * 0.04, 
            perKwh: isNaN(costPerKwh) ? 0.02 : Math.max(0, costPerKwh)
          },
          carbon: { 
            perJob: 250 - improvement * 250, 
            perKwh: isNaN(carbonPerKwh) ? 0 : Math.max(0, carbonPerKwh)
          },
          resilience: { 
            recoveryTime: 45 - improvement * 43, 
            rerouteRate: 0.2 + improvement * 0.75, 
            outageImpact: 0.8 - improvement * 0.7 
          },
        });
      }
    }, 100);

    // Mark interactive ready after a short delay
    setTimeout(() => {
      if (isMounted) {
        setInteractiveReady(true);
      }
    }, 500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentStep, isActive]);

  // Camera animations for each step - only move when step changes
  // Don't move camera on initial load - let it stay at the initial position
  const prevStepRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (!viewerRef?.current || !isActive || !currentStep) {
      console.log(`[TutorialOverlay] Skipping camera move - viewer: ${!!viewerRef?.current}, isActive: ${isActive}, step: ${currentStep}`);
      return;
    }
    
    // Only move camera if step actually changed (not on initial mount)
    if (prevStepRef.current === currentStep) {
      console.log(`[TutorialOverlay] Step ${currentStep} unchanged, skipping camera move`);
      return;
    }
    prevStepRef.current = currentStep;

    const viewer = viewerRef.current;
    
    // Verify camera is ready
    if (!viewer.camera || !viewer.camera.positionCartographic) {
      console.warn("[TutorialOverlay] Camera not ready, waiting...");
      const retryTimer = setTimeout(() => {
        if (viewer.camera && viewer.camera.positionCartographic) {
          console.log("[TutorialOverlay] Camera ready, proceeding with move");
        }
      }, 1000);
      return () => clearTimeout(retryTimer);
    }

    const currentHeight = viewer.camera.positionCartographic.height;
    console.log(`[TutorialOverlay] Moving camera for step ${currentStep}, current height: ${currentHeight.toFixed(0)}m`);
    
    // Small delay to ensure viewer is ready
    const timer = setTimeout(() => {
      try {
        if (currentStep === 1) {
          // Step 1: Slight zoom to focus on ground infrastructure - keep Earth in frame
          console.log("[TutorialOverlay] Step 1: Flying to 12M height");
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-100, 40, 12000000),
            duration: 2.0,
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-0.5),
              roll: 0.0,
            },
            complete: () => {
              // Ensure Earth stays in frame after animation
              try {
                if (viewer && viewer.camera && viewer.camera.positionCartographic) {
                  const height = viewer.camera.positionCartographic.height;
                  console.log(`[TutorialOverlay] Step 1 complete, height: ${height.toFixed(0)}m`);
                  if (height > 40000000 || height < 2000000 || !isFinite(height)) {
                    console.warn(`[TutorialOverlay] Step 1: Camera out of bounds (${height.toFixed(0)}m), resetting...`);
                    viewer.camera.flyTo({
                      destination: Cesium.Cartesian3.fromDegrees(-100, 40, 12000000),
                      duration: 1.0,
                    });
                  }
                }
              } catch (error) {
                console.error("[TutorialOverlay] Step 1 camera check failed:", error);
              }
            },
          });
        } else if (currentStep === 2) {
          // Step 2: Zoom in on Abilene
          console.log("[TutorialOverlay] Step 2: Flying to Abilene");
          // Ensure camera controls are enabled and limits are set
          const controller = viewer.scene.screenSpaceCameraController;
          controller.enableZoom = true;
          controller.minimumZoomDistance = 50000; // Allow closer zoom for ground view
          controller.maximumZoomDistance = 40000000;
          controller.zoomEventTypes = [
            Cesium.CameraEventType.WHEEL,
            Cesium.CameraEventType.PINCH,
          ];
          
          // Abilene coordinates: lat 32.45, lon -99.74
          const abileneLon = -99.74;
          const abileneLat = 32.45;
          const abileneHeight = 500000; // Close view of Abilene
          
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(abileneLon, abileneLat, abileneHeight),
            orientation: {
              heading: 0.0,
              pitch: -Cesium.Math.PI_OVER_TWO + 0.3, // Look down at an angle
              roll: 0.0,
            },
            duration: 2.0,
            complete: () => {
              // Ensure Earth stays in frame and camera controls remain enabled
              try {
                if (viewer && viewer.camera && viewer.camera.positionCartographic) {
                  const height = viewer.camera.positionCartographic.height;
                  console.log(`[TutorialOverlay] Step 2 complete, height: ${height.toFixed(0)}m`);
                  
                  // Ensure camera transform is reset to look at Earth center
                  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
                  
                  // Re-enable controls after flyTo completes
                  controller.enableZoom = true;
                  controller.minimumZoomDistance = 50000;
                  controller.maximumZoomDistance = 40000000;
                  
                  if (height > 40000000 || height < 50000 || !isFinite(height)) {
                    console.warn(`[TutorialOverlay] Step 2: Camera out of bounds (${height.toFixed(0)}m), resetting...`);
                    viewer.camera.flyTo({
                      destination: Cesium.Cartesian3.fromDegrees(abileneLon, abileneLat, abileneHeight),
                      duration: 1.0,
                      orientation: {
                        heading: 0.0,
                        pitch: -Cesium.Math.PI_OVER_TWO + 0.3,
                        roll: 0.0,
                      },
                    });
                  }
                }
              } catch (error) {
                console.error("[TutorialOverlay] Step 2 camera check failed:", error);
              }
            },
          });
        } else if (currentStep === 3) {
          // Step 3: Zoom out to see entire globe with satellites
          console.log("[TutorialOverlay] Step 3: Flying to full Earth view");
          const controller = viewer.scene.screenSpaceCameraController;
          controller.enableZoom = true;
          controller.minimumZoomDistance = 2000000;
          controller.maximumZoomDistance = 40000000;
          
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-100, 40, 25000000), // Far enough to see entire globe
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: -Cesium.Math.PI_OVER_TWO + 0.1, // Almost straight down
              roll: 0.0,
            },
            duration: 2.5,
            complete: () => {
              // Ensure Earth stays in frame
              try {
                if (viewer && viewer.camera && viewer.camera.positionCartographic) {
                  const height = viewer.camera.positionCartographic.height;
                  console.log(`[TutorialOverlay] Step 3 complete, height: ${height.toFixed(0)}m`);
                  
                  // Ensure camera transform is reset
                  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
                  
                  // Re-enable controls
                  controller.enableZoom = true;
                  controller.minimumZoomDistance = 2000000;
                  controller.maximumZoomDistance = 40000000;
                  
                  if (height > 40000000 || height < 2000000 || !isFinite(height)) {
                    console.warn(`[TutorialOverlay] Step 3: Camera out of bounds (${height.toFixed(0)}m), resetting...`);
                    viewer.camera.flyTo({
                      destination: Cesium.Cartesian3.fromDegrees(-100, 40, 25000000),
                      duration: 1.0,
                      orientation: {
                        heading: Cesium.Math.toRadians(0),
                        pitch: -Cesium.Math.PI_OVER_TWO + 0.1,
                        roll: 0.0,
                      },
                    });
                  }
                }
              } catch (error) {
                console.error("[TutorialOverlay] Step 3 camera check failed:", error);
              }
            },
          });
        }
      } catch (error) {
        console.error(`[TutorialOverlay] Error moving camera for step ${currentStep}:`, error);
      }
    }, 800);

    return () => {
      clearTimeout(timer);
      console.log(`[TutorialOverlay] Cleaned up camera move timer for step ${currentStep}`);
    };
  }, [currentStep, isActive, viewerRef]);

  if (!isActive || currentStep === null) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Step 1: Ground-Only Baseline - Minimal overlay */}
      {currentStep === 1 && (
        <div className="absolute bottom-0 left-0 right-0 pointer-events-auto">
          <div className={`panel-glass rounded-t-3xl p-6 max-w-5xl mx-auto border-t-2 border-accent-blue/50 shadow-2xl transition-all duration-1000 ${interactiveReady ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <div className="text-3xl font-bold text-accent-blue mb-2 flex items-center gap-3">
                  <span className="text-4xl animate-pulse">🌍</span>
                  <span>Step 1: The World as It Is</span>
                </div>
                <p className="text-xl text-gray-200 mb-4 leading-relaxed">
                  Ground compute: fast, but constrained by energy, cooling, and geography.
                </p>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <AnimatedMetricCard 
                    label="Avg Latency" 
                    value={`${(isNaN(metrics.latency.avg) ? 45 : metrics.latency.avg).toFixed(0)}ms`} 
                    trend="stable"
                    color="accent-blue"
                    animated
                  />
                  <AnimatedMetricCard 
                    label="Energy Cost" 
                    value={`$${(isNaN(metrics.cost.perKwh) ? 0.08 : metrics.cost.perKwh).toFixed(2)}/kWh`} 
                    trend="stable"
                    color="accent-orange"
                    animated
                  />
                  <AnimatedMetricCard 
                    label="Carbon" 
                    value={`${(isNaN(metrics.carbon.perKwh) ? 180 : metrics.carbon.perKwh).toFixed(0)}g/kWh`} 
                    trend="stable"
                    color="accent-green"
                    animated
                  />
                </div>
              </div>
              <button
                onClick={nextStep}
                className="px-10 py-5 bg-accent-blue hover:bg-accent-blue/80 text-dark-bg rounded-2xl font-bold text-xl transition-all hover:scale-110 shadow-2xl hover:shadow-accent-blue/50 animate-pulse"
              >
                Next Step →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Stress Event - Minimal overlay */}
      {currentStep === 2 && (
        <div className="absolute bottom-0 left-0 right-0 pointer-events-auto">
          <div className={`panel-glass rounded-t-3xl p-6 max-w-5xl mx-auto border-t-2 border-accent-orange/50 shadow-2xl transition-all duration-1000 ${interactiveReady ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <div className="text-3xl font-bold text-accent-orange mb-2 flex items-center gap-3">
                  <span className="text-4xl animate-bounce">⚠️</span>
                  <span>Step 2: Ground Falters</span>
                </div>
                <p className="text-xl text-gray-200 mb-4 leading-relaxed">
                  Ground compute fails under pressure. We need a second tier.
                </p>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <AnimatedMetricCard 
                    label="Latency" 
                    value={`${(isNaN(metrics.latency.avg) ? 200 : metrics.latency.avg).toFixed(0)}ms`} 
                    trend="up"
                    color="accent-orange"
                    isSpiking
                    animated
                  />
                  <AnimatedMetricCard 
                    label="Energy" 
                    value={`$${(isNaN(metrics.cost.perKwh) ? 0.15 : metrics.cost.perKwh).toFixed(2)}/kWh`} 
                    trend="up"
                    color="accent-orange"
                    isSpiking
                    animated
                  />
                  <AnimatedMetricCard 
                    label="Packet Loss" 
                    value={`${(isNaN(metrics.resilience.outageImpact) ? 0.8 : metrics.resilience.outageImpact * 100).toFixed(0)}%`} 
                    trend="up"
                    color="accent-orange"
                    isSpiking
                    animated
                  />
                </div>
              </div>
              <button
                onClick={nextStep}
                className="px-10 py-5 bg-accent-orange hover:bg-accent-orange/80 text-white rounded-2xl font-bold text-xl transition-all hover:scale-110 shadow-2xl hover:shadow-accent-orange/50 animate-pulse"
              >
                Introduce Orbit →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Orbit Reveal - Minimal overlay */}
      {currentStep === 3 && (
        <div className="absolute bottom-0 left-0 right-0 pointer-events-auto">
          <div className={`panel-glass rounded-t-3xl p-6 max-w-5xl mx-auto border-t-2 border-accent-blue/50 shadow-2xl transition-all duration-1000 ${interactiveReady ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <div className="text-3xl font-bold text-accent-blue mb-2 flex items-center gap-3">
                  <span className="text-4xl animate-spin">🌌</span>
                  <span>Step 3: Orbit Comes Online</span>
                </div>
                <p className="text-xl text-gray-200 mb-4 leading-relaxed">
                  Orbit adds a new layer: low-latency global paths, energy-flexibility, zero cooling limits.
                </p>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <BeforeAfterCard 
                    label="Latency" 
                    before="45ms" 
                    after={`${(isNaN(metrics.latency.avg) ? 25 : metrics.latency.avg).toFixed(0)}ms`} 
                    improving
                    animated
                  />
                  <BeforeAfterCard 
                    label="Energy Cost" 
                    before="$0.08" 
                    after={`$${(isNaN(metrics.cost.perKwh) ? 0.02 : metrics.cost.perKwh).toFixed(2)}`} 
                    improving
                    animated
                  />
                  <BeforeAfterCard 
                    label="Carbon" 
                    before="180g" 
                    after={`${(isNaN(metrics.carbon.perKwh) ? 0 : metrics.carbon.perKwh).toFixed(0)}g`} 
                    improving
                    animated
                  />
                </div>
              </div>
              <button
                onClick={nextStep}
                className="px-10 py-5 bg-accent-blue hover:bg-accent-blue/80 text-dark-bg rounded-2xl font-bold text-xl transition-all hover:scale-110 shadow-2xl hover:shadow-accent-blue/50 animate-pulse"
              >
                Why Orbit? →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Why Orbit */}
      {currentStep === 4 && viewerRef && <TutorialStep4 viewerRef={viewerRef} />}
    </div>
  );
}

function AnimatedMetricCard({ 
  label, 
  value, 
  trend, 
  color, 
  isSpiking = false,
  animated = false
}: { 
  label: string; 
  value: string; 
  trend: "up" | "down" | "stable"; 
  color: string;
  isSpiking?: boolean;
  animated?: boolean;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const valueRef = useRef(value);

  // Validate and sanitize value to prevent NaN
  const sanitizeValue = (val: string): string => {
    if (!val || val === 'NaN' || val.includes('NaN')) {
      return '0.00';
    }
    const num = parseFloat(val.replace(/[^0-9.-]/g, ''));
    if (isNaN(num) || !isFinite(num)) {
      return '0.00';
    }
    return val;
  };

  useEffect(() => {
    const safeValue = sanitizeValue(value);
    if (safeValue !== value) {
      setDisplayValue(safeValue);
      return;
    }

    if (animated) {
      const numValue = parseFloat(value.replace(/[^0-9.-]/g, ''));
      if (isNaN(numValue) || !isFinite(numValue)) {
        setDisplayValue('0.00');
        return;
      }

      const startValue = parseFloat(valueRef.current.replace(/[^0-9.-]/g, '')) || numValue;
      if (isNaN(startValue) || !isFinite(startValue)) {
        setDisplayValue(value);
        valueRef.current = value;
        return;
      }

      const diff = numValue - startValue;
      const steps = 30;
      const stepSize = diff / steps;
      let currentStep = 0;

      const interval = setInterval(() => {
        currentStep++;
        if (currentStep >= steps) {
          setDisplayValue(value);
          valueRef.current = value;
          clearInterval(interval);
        } else {
          const newValue = startValue + stepSize * currentStep;
          if (isNaN(newValue) || !isFinite(newValue)) {
            clearInterval(interval);
            setDisplayValue(value);
            return;
          }
          
          if (value.includes('ms')) {
            setDisplayValue(`${newValue.toFixed(0)}ms`);
          } else if (value.includes('$')) {
            setDisplayValue(`$${newValue.toFixed(2)}${value.includes('/kWh') ? '/kWh' : ''}`);
          } else if (value.includes('%')) {
            setDisplayValue(`${newValue.toFixed(0)}%`);
          } else if (value.includes('g')) {
            setDisplayValue(`${newValue.toFixed(0)}g/kWh`);
          } else {
            setDisplayValue(newValue.toFixed(0));
          }
        }
      }, 20);

      return () => clearInterval(interval);
    } else {
      setDisplayValue(sanitizeValue(value));
    }
  }, [value, animated]);

  const colorClasses = {
    "accent-blue": "text-accent-blue border-accent-blue",
    "accent-green": "text-accent-green border-accent-green",
    "accent-orange": "text-accent-orange border-accent-orange",
  };

  return (
    <div className={`panel-glass rounded-xl p-5 border-2 ${colorClasses[color as keyof typeof colorClasses]} ${isSpiking ? "animate-pulse" : ""} transition-all duration-300 hover:scale-105`}>
      <div className="text-sm text-gray-400 mb-2">{label}</div>
      <div className={`text-4xl font-bold ${colorClasses[color as keyof typeof colorClasses].split(" ")[0]} transition-all duration-300`}>
        {animated ? displayValue : value}
      </div>
      <div className="text-xs text-gray-500 mt-2 flex items-center gap-1">
        {trend === "down" ? "↓ Improving" : trend === "up" ? "↑ Spiking" : "→ Stable"}
        {animated && <span className="animate-ping">●</span>}
      </div>
    </div>
  );
}

function BeforeAfterCard({ 
  label, 
  before, 
  after, 
  improving,
  animated = false
}: { 
  label: string; 
  before: string; 
  after: string; 
  improving: boolean;
  animated?: boolean;
}) {
  const [showAfter, setShowAfter] = useState(false);

  useEffect(() => {
    if (animated) {
      const timer = setTimeout(() => setShowAfter(true), 500);
      return () => clearTimeout(timer);
    }
  }, [animated]);

  return (
    <div className="panel-glass rounded-xl p-5 border-2 border-accent-blue/50 transition-all duration-500 hover:scale-105">
      <div className="text-sm text-gray-400 mb-3">{label}</div>
      <div className="flex items-center justify-between">
        <div className={`text-lg text-gray-500 line-through transition-all duration-500 ${showAfter ? 'opacity-50 scale-90' : 'opacity-100'}`}>
          {before}
        </div>
        <div className={`text-3xl font-bold text-accent-green transition-all duration-500 ${showAfter ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`}>
          {after}
        </div>
      </div>
      {improving && showAfter && (
        <div className="text-xs text-accent-green mt-3 flex items-center gap-1 animate-pulse">
          <span>✓</span> Improving
        </div>
      )}
    </div>
  );
}
