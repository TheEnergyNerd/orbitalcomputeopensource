"use client";

import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import { useSandboxStore } from "../../store/sandboxStore";
import { getGlobalViewer } from "../../hooks/useCesiumViewer";

/**
 * LaunchGlobeEffects - Adds visual effects to the globe when launches happen
 * - Flare at ground DC points
 * - Pod icons blink in around globe rim
 * - Orbit ring pulse
 */
export default function LaunchGlobeEffects() {
  const { lastLaunchMetrics } = useSandboxStore();
  const lastLaunchRef = useRef<any>(null);
  const effectsRef = useRef<Cesium.Entity[]>([]);

  useEffect(() => {
    // Detect new launch
    if (lastLaunchMetrics && lastLaunchMetrics !== lastLaunchRef.current) {
      const podsLaunched = lastLaunchMetrics.podsLaunched;
      if (podsLaunched > 0) {
        const viewer = getGlobalViewer();
        if (!viewer || viewer.isDestroyed()) return;

        // Clear previous effects
        effectsRef.current.forEach((entity) => {
          try {
            viewer.entities.remove(entity);
          } catch (e) {
            // Entity might already be removed
          }
        });
        effectsRef.current = [];

        // Add flare at ground DC locations (simplified - use a few key locations)
        const groundDCLocations = [
          { lon: -100, lat: 40 }, // Central US
          { lon: -74, lat: 40 },  // East Coast
          { lon: -122, lat: 37 }, // West Coast
        ];

        groundDCLocations.forEach((loc, idx) => {
          const flare = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(loc.lon, loc.lat, 0),
            point: {
              pixelSize: 20,
              color: Cesium.Color.YELLOW.withAlpha(0.9),
              outlineColor: Cesium.Color.ORANGE,
              outlineWidth: 2,
              scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.0),
            },
          });
          effectsRef.current.push(flare);

          // Animate flare (pulse and fade)
          const startTime = Date.now();
          const animate = () => {
            const elapsed = Date.now() - startTime;
            if (elapsed > 1000) {
              // Remove after 1 second
              try {
                viewer.entities.remove(flare);
              } catch (e) {
                // Already removed
              }
              return;
            }

            const progress = elapsed / 1000;
            const pulse = Math.sin(progress * Math.PI * 4) * 0.3 + 0.7; // Pulse effect
            const fade = 1 - progress; // Fade out

            if (flare.point) {
              flare.point.pixelSize = 20 * pulse;
              flare.point.color = Cesium.Color.YELLOW.withAlpha(0.9 * fade);
            }

            requestAnimationFrame(animate);
          };
          animate();
        });

        // Add pod icons around globe rim (orbit ring)
        const numPods = Math.min(podsLaunched, 20); // Limit to 20 for performance
        for (let i = 0; i < numPods; i++) {
          const angle = (i / numPods) * Math.PI * 2;
          const altitude = 700; // LEO altitude in km
          const lat = Math.sin(angle) * 60; // Spread across latitudes
          const lon = (angle / Math.PI) * 180;

          const podIcon = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(lon, lat, altitude * 1000),
            point: {
              pixelSize: 8,
              color: Cesium.Color.CYAN.withAlpha(0.8),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1,
              scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.0),
            },
          });
          effectsRef.current.push(podIcon);

          // Animate pod icon (fade in, then fade out)
          const startTime = Date.now();
          const delay = (i / numPods) * 200; // Stagger appearance
          const animate = () => {
            const elapsed = Date.now() - startTime - delay;
            if (elapsed < 0) {
              requestAnimationFrame(animate);
              return;
            }
            if (elapsed > 2000) {
              // Remove after 2 seconds
              try {
                viewer.entities.remove(podIcon);
              } catch (e) {
                // Already removed
              }
              return;
            }

            const progress = elapsed / 2000;
            let alpha = 0;
            if (progress < 0.2) {
              // Fade in
              alpha = progress / 0.2;
            } else if (progress > 0.8) {
              // Fade out
              alpha = (1 - progress) / 0.2;
            } else {
              alpha = 1;
            }

            if (podIcon.point) {
              podIcon.point.color = Cesium.Color.CYAN.withAlpha(0.8 * alpha);
            }

            requestAnimationFrame(animate);
          };
          animate();
        }

        // Add orbit ring pulse (semi-transparent ring at LEO altitude)
        const ringPulse = viewer.entities.add({
          polyline: {
            positions: (() => {
              const positions: Cesium.Cartesian3[] = [];
              const radius = 6371 + 700; // Earth radius + LEO altitude in km
              for (let i = 0; i <= 360; i += 5) {
                const lat = 0; // Equatorial orbit
                const lon = i;
                positions.push(
                  Cesium.Cartesian3.fromDegrees(lon, lat, 700 * 1000)
                );
              }
              return positions;
            })(),
            width: 2,
            material: Cesium.Color.CYAN.withAlpha(0.3),
            clampToGround: false,
          },
        });
        effectsRef.current.push(ringPulse);

        // Animate ring pulse
        const startTime = Date.now();
        const animateRing = () => {
          const elapsed = Date.now() - startTime;
          if (elapsed > 2000) {
            try {
              viewer.entities.remove(ringPulse);
            } catch (e) {
              // Already removed
            }
            return;
          }

          const progress = elapsed / 2000;
          const pulse = Math.sin(progress * Math.PI * 2) * 0.3 + 0.3;
          const fade = 1 - progress;

          if (ringPulse.polyline) {
            ringPulse.polyline.material = Cesium.Color.CYAN.withAlpha(pulse * fade);
            ringPulse.polyline.width = 2 + pulse * 2;
          }

          requestAnimationFrame(animateRing);
        };
        animateRing();

        lastLaunchRef.current = lastLaunchMetrics;
      }
    }

    // Cleanup on unmount
    return () => {
      const viewer = getGlobalViewer();
      if (viewer && !viewer.isDestroyed()) {
        effectsRef.current.forEach((entity) => {
          try {
            viewer.entities.remove(entity);
          } catch (e) {
            // Already removed
          }
        });
      }
      effectsRef.current = [];
    };
  }, [lastLaunchMetrics]);

  return null; // This component only adds visual effects, no UI
}

