"use client";

import React, { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import { useSimStore } from "../store/simStore";
import { useTutorialStore } from "../store/tutorialStore";

const GROUND_LABELS: Record<string, string> = {
  abilene_edge: "Abilene",
  nova_hub: "NoVA",
  dfw_hub: "DFW",
  phx_hub: "Phoenix",
};

export default function TutorialGlobe({
  viewerRef,
}: {
  viewerRef?: React.MutableRefObject<Cesium.Viewer | null>;
}) {
  const state = useSimStore((s) => s.state);
  const loading = useSimStore((s) => s.loading);
  const { currentStep, isActive } = useTutorialStore();
  const jobFlowRef = useRef<Cesium.Entity[]>([]);
  const pulseIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [viewerReady, setViewerReady] = useState(false);

  const getViewer = () => {
    const viewer = viewerRef?.current || null;
    if (!viewer || viewer.isDestroyed()) {
      return null;
    }
    return viewer;
  };

  // Detect when the shared viewer is ready
  useEffect(() => {
    if (viewerReady) return;
    const interval = setInterval(() => {
      const viewer = getViewer();
      if (viewer) {
        setViewerReady(true);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [viewerReady, viewerRef]);

  // Clear tutorial overlays when tutorial ends
  useEffect(() => {
    if (isActive) {
      return;
    }
    const viewer = getViewer();
    if (!viewer) return;

    jobFlowRef.current = [];
    if (pulseIntervalRef.current) {
      clearInterval(pulseIntervalRef.current);
      pulseIntervalRef.current = null;
    }
    viewer.entities.removeAll();
    viewer.scene.requestRender();
  }, [isActive, viewerReady]);

  // Step 1: Ground-only baseline
  useEffect(() => {
    if (!viewerReady || !isActive || currentStep !== 1 || loading || !state || !state.groundSites || state.groundSites.length === 0) {
      if (!viewerReady) console.log("[TutorialGlobe] Step 1: Waiting for viewer");
      if (!isActive) console.log("[TutorialGlobe] Step 1: Tutorial not active");
      if (currentStep !== 1) console.log(`[TutorialGlobe] Step 1: Wrong step (${currentStep})`);
      if (loading) console.log("[TutorialGlobe] Step 1: Still loading");
      if (!state || !state.groundSites || state.groundSites.length === 0) console.log("[TutorialGlobe] Step 1: No state or ground sites available");
      return;
    }
    const viewer = getViewer();
    if (!viewer) {
      console.log("[TutorialGlobe] Step 1: Viewer not available");
      return;
    }
    
    console.log(`[TutorialGlobe] Step 1: Rendering with ${state.groundSites?.length || 0} ground sites`);

    const entities = viewer.entities;
    entities.removeAll();
    jobFlowRef.current = [];

    state.groundSites.forEach((site) => {
      entities.add({
        id: site.id,
        position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0),
        point: {
          pixelSize: 30,
          color: Cesium.Color.fromCssColorString("#00ff88").withAlpha(0.9),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 4,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.0, 8.0e7, 0.5),
        },
        label: {
          text: GROUND_LABELS[site.id] || site.label,
          font: "24px 'JetBrains Mono', monospace",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 6,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.2, 8.0e7, 0.4),
        },
      });

      entities.add({
        id: `${site.id}_glow`,
        position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0),
        ellipse: {
          semiMajorAxis: 50000,
          semiMinorAxis: 50000,
          material: Cesium.Color.fromCssColorString("#00ff88").withAlpha(0.2),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
    });

    // Fiber routes
    const groundSites = state.groundSites;
    for (let i = 0; i < groundSites.length; i++) {
      for (let j = i + 1; j < groundSites.length; j++) {
        const site1 = groundSites[i];
        const site2 = groundSites[j];
        const polyline = entities.add({
          id: `ground_flow_${site1.id}_${site2.id}`,
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(site1.lon, site1.lat, 0),
              Cesium.Cartesian3.fromDegrees(site2.lon, site2.lat, 0),
            ],
            material: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.4),
            width: 3,
            clampToGround: true,
          },
        });
        jobFlowRef.current.push(polyline);
      }
    }

    let pulsePhase = 0;
    if (pulseIntervalRef.current) {
      clearInterval(pulseIntervalRef.current);
    }
    pulseIntervalRef.current = setInterval(() => {
      pulsePhase += 0.15;
      jobFlowRef.current.forEach((entity, idx) => {
        if (entity.polyline) {
          const alpha = 0.4 + Math.sin(pulsePhase + idx * 0.8) * 0.4;
          entity.polyline.material = Cesium.Color.fromCssColorString("#00d4ff").withAlpha(alpha);
          entity.polyline.width = 3 + Math.sin(pulsePhase + idx) * 1;
        }
      });

      state.groundSites.forEach((site, idx) => {
        const glow = entities.getById(`${site.id}_glow`);
        if (glow && glow.ellipse) {
          const scale = 1 + Math.sin(pulsePhase + idx) * 0.3;
          glow.ellipse.semiMajorAxis = 50000 * scale;
          glow.ellipse.semiMinorAxis = 50000 * scale;
          const alpha = 0.2 + Math.sin(pulsePhase * 2 + idx) * 0.15;
          glow.ellipse.material = Cesium.Color.fromCssColorString("#00ff88").withAlpha(alpha);
        }
      });
    }, 50);

    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#0f1a25");
    viewer.scene.requestRender();

    return () => {
      if (pulseIntervalRef.current) {
        clearInterval(pulseIntervalRef.current);
        pulseIntervalRef.current = null;
      }
    };
  }, [state, currentStep, isActive, viewerRef, viewerReady, loading]);

  // Step 2: Stress event
  useEffect(() => {
    if (!viewerReady || !isActive || currentStep !== 2 || !state) {
      if (!state) console.log("[TutorialGlobe] Step 2: No state available");
      return;
    }
    const viewer = getViewer();
    if (!viewer) return;
    
    console.log(`[TutorialGlobe] Step 2: Rendering with ${state.groundSites?.length || 0} ground sites`);

    const entities = viewer.entities;
    entities.removeAll();
    jobFlowRef.current = [];

    state.groundSites.forEach((site, idx) => {
      entities.add({
        id: site.id,
        position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0),
        point: {
          pixelSize: 35,
          color: Cesium.Color.fromCssColorString("#ff6b35").withAlpha(0.9),
          outlineColor: Cesium.Color.fromCssColorString("#ff0000"),
          outlineWidth: 5,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: GROUND_LABELS[site.id] || site.label,
          font: "24px 'JetBrains Mono', monospace",
          fillColor: Cesium.Color.fromCssColorString("#ff6b35"),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 6,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        },
      });

      entities.add({
        id: `${site.id}_warning`,
        position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0),
        ellipse: {
          semiMajorAxis: 60000,
          semiMinorAxis: 60000,
          material: Cesium.Color.fromCssColorString("#ff0000").withAlpha(0.3),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
    });

    const groundSites = state.groundSites;
    for (let i = 0; i < groundSites.length; i++) {
      for (let j = i + 1; j < groundSites.length; j++) {
        const site1 = groundSites[i];
        const site2 = groundSites[j];
        const polyline = entities.add({
          id: `stress_flow_${site1.id}_${site2.id}`,
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(site1.lon, site1.lat, 0),
              Cesium.Cartesian3.fromDegrees(site2.lon, site2.lat, 0),
            ],
            material: Cesium.Color.fromCssColorString("#ff0000").withAlpha(0.7),
            width: 5,
            clampToGround: true,
          },
        });
        jobFlowRef.current.push(polyline);
      }
    }

    let pulsePhase = 0;
    if (pulseIntervalRef.current) {
      clearInterval(pulseIntervalRef.current);
    }
    pulseIntervalRef.current = setInterval(() => {
      pulsePhase += 0.25;
      jobFlowRef.current.forEach((entity, idx) => {
        if (entity.polyline) {
          const alpha = 0.5 + Math.sin(pulsePhase * 3 + idx) * 0.4;
          entity.polyline.material = Cesium.Color.fromCssColorString("#ff0000").withAlpha(alpha);
          entity.polyline.width = 5 + Math.sin(pulsePhase * 2 + idx) * 2;
        }
      });

      state.groundSites.forEach((site, idx) => {
        const glow = entities.getById(`${site.id}_warning`);
        if (glow && glow.ellipse) {
          const scale = 1 + Math.sin(pulsePhase * 2 + idx) * 0.5;
          glow.ellipse.semiMajorAxis = 60000 * scale;
          glow.ellipse.semiMinorAxis = 60000 * scale;
          const alpha = 0.3 + Math.sin(pulsePhase * 4 + idx) * 0.3;
          glow.ellipse.material = Cesium.Color.fromCssColorString("#ff0000").withAlpha(alpha);
        }
      });
    }, 30);

    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#220909");
    viewer.scene.requestRender();

    return () => {
      if (pulseIntervalRef.current) {
        clearInterval(pulseIntervalRef.current);
        pulseIntervalRef.current = null;
      }
    };
  }, [state, currentStep, isActive, viewerRef, viewerReady, loading]);

  // Step 3: Orbit comes online
  useEffect(() => {
    if (!viewerReady || !isActive || currentStep !== 3 || !state) {
      if (!state) console.log("[TutorialGlobe] Step 3: No state available");
      return;
    }
    const viewer = getViewer();
    if (!viewer) return;
    
    console.log(`[TutorialGlobe] Step 3: Rendering with ${state.groundSites?.length || 0} ground sites, ${state.satellites?.length || 0} satellites`);

    const entities = viewer.entities;
    entities.removeAll();
    jobFlowRef.current = [];

    state.groundSites.forEach((site) => {
      entities.add({
        id: site.id,
        position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0),
        point: {
          pixelSize: 18,
          color: Cesium.Color.fromCssColorString("#00ff88").withAlpha(0.5),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: GROUND_LABELS[site.id] || site.label,
          font: "18px 'JetBrains Mono', monospace",
          fillColor: Cesium.Color.WHITE.withAlpha(0.6),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 4,
        },
      });
    });

    state.satellites.slice(0, 80).forEach((sat) => {
      const color = sat.sunlit
        ? Cesium.Color.fromCssColorString("#ffd700").withAlpha(0.95)
        : Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.85);

      entities.add({
        id: sat.id,
        position: Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000),
        point: {
          pixelSize: 14,
          color: color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 4,
          heightReference: Cesium.HeightReference.NONE,
          scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.0, 8.0e7, 0.3),
        },
      });

      entities.add({
        id: `${sat.id}_halo`,
        position: Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000),
        ellipse: {
          semiMajorAxis: 20000,
          semiMinorAxis: 20000,
          material: color.withAlpha(0.2),
          heightReference: Cesium.HeightReference.NONE,
        },
      });
    });

    if (state.groundSites.length > 0 && state.satellites.length > 0) {
      const groundSite = state.groundSites[0];
      state.satellites.slice(0, 5).forEach((satellite, idx) => {
        const orbitalPath = entities.add({
          id: `orbital_job_${idx}`,
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(groundSite.lon, groundSite.lat, 0),
              Cesium.Cartesian3.fromDegrees(
                satellite.lon,
                satellite.lat,
                satellite.alt_km * 1000
              ),
            ],
            material: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.7),
            width: 4,
          },
        });
        jobFlowRef.current.push(orbitalPath);
      });
    }

    let pulsePhase = 0;
    if (pulseIntervalRef.current) {
      clearInterval(pulseIntervalRef.current);
    }
    pulseIntervalRef.current = setInterval(() => {
      pulsePhase += 0.12;

      jobFlowRef.current.forEach((entity, idx) => {
        if (entity.polyline) {
          const alpha = 0.6 + Math.sin(pulsePhase + idx * 0.5) * 0.3;
          entity.polyline.material = Cesium.Color.fromCssColorString("#00d4ff").withAlpha(alpha);
          entity.polyline.width = 4 + Math.sin(pulsePhase * 2 + idx) * 2;
        }
      });

      state.satellites.slice(0, 80).forEach((sat, idx) => {
        const halo = entities.getById(`${sat.id}_halo`);
        if (halo && halo.ellipse) {
          const scale = 1 + Math.sin(pulsePhase + idx * 0.3) * 0.4;
          halo.ellipse.semiMajorAxis = 20000 * scale;
          halo.ellipse.semiMinorAxis = 20000 * scale;
          const alpha = 0.2 + Math.sin(pulsePhase * 2 + idx) * 0.15;
          const color = sat.sunlit
            ? Cesium.Color.fromCssColorString("#ffd700")
            : Cesium.Color.fromCssColorString("#00d4ff");
          halo.ellipse.material = color.withAlpha(alpha);
        }
      });
    }, 50);

    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#1a2332");
    viewer.scene.requestRender();

    return () => {
      if (pulseIntervalRef.current) {
        clearInterval(pulseIntervalRef.current);
        pulseIntervalRef.current = null;
      }
    };
  }, [state, currentStep, isActive, viewerRef, viewerReady, loading]);

  // Step 4: Return to normal visualization
  useEffect(() => {
    if (!viewerReady || !isActive || currentStep !== 4 || !state) return;
    const viewer = getViewer();
    if (!viewer) return;

    const entities = viewer.entities;
    entities.removeAll();
    jobFlowRef.current = [];

    state.groundSites.forEach((site) => {
      entities.add({
        id: site.id,
        position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0),
        point: {
          pixelSize: 20,
          color: Cesium.Color.fromCssColorString("#00ff88").withAlpha(0.9),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: GROUND_LABELS[site.id] || site.label,
          font: "20px 'JetBrains Mono', monospace",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 5,
        },
      });
    });

    state.satellites.forEach((sat) => {
      const color = sat.sunlit
        ? Cesium.Color.fromCssColorString("#ffd700").withAlpha(0.9)
        : Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.7);

      entities.add({
        id: sat.id,
        position: Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000),
        point: {
          pixelSize: 4 + sat.utilization * 2,
          color: color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.NONE,
        },
      });
    });

    if (state.groundSites.length > 0 && state.satellites.length > 0) {
      const groundSite = state.groundSites[0];
      const satellite = state.satellites[0];
      const orbitalPath = entities.add({
        id: "orbital_demo",
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(groundSite.lon, groundSite.lat, 0),
            Cesium.Cartesian3.fromDegrees(satellite.lon, satellite.lat, satellite.alt_km * 1000),
          ],
          material: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.5),
          width: 3,
        },
      });
      jobFlowRef.current.push(orbitalPath);
    }

    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#1a4a6e");
    viewer.scene.requestRender();

    return () => {
      if (pulseIntervalRef.current) {
        clearInterval(pulseIntervalRef.current);
        pulseIntervalRef.current = null;
      }
    };
  }, [state, currentStep, isActive, viewerRef, viewerReady, loading]);

  return null;
}


