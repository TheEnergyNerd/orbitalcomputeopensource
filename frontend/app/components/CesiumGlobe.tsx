"use client";

import React, { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import { useSimStore } from "../store/simStore";
import { useTutorialStore } from "../store/tutorialStore";

const GROUND_LABELS: Record<string, string> = {
  abilene_edge: "Abilene",
  nova_hub: "NoVA",
  dfw_hub: "DFW",
  phx_hub: "Phoenix",
};

const COUNTRY_GEOJSON_URL =
  "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";

const addSimpleCountryOutlines = (viewer: Cesium.Viewer | null | undefined) => {
  if (!viewer || viewer.isDestroyed()) {
    console.warn("[CesiumGlobe] Cannot add country outlines, viewer unavailable");
    return;
  }

  let entities: Cesium.EntityCollection | null = null;
  try {
    entities = viewer.entities;
  } catch (error) {
    console.warn("[CesiumGlobe] viewer.entities not ready for outlines:", error);
    return;
  }
  if (!entities) {
    console.warn("[CesiumGlobe] Entities collection missing, skipping outlines");
    return;
  }

  const outlines = [
    [-125, 49, -66, 49, -66, 25, -125, 25, -125, 49],
    [-140, 83, -52, 83, -52, 42, -140, 42, -140, 83],
    [-118, 32, -86, 32, -86, 14, -118, 14, -118, 32],
    [-10, 71, 40, 71, 40, 35, -10, 35, -10, 71],
  ];

  outlines.forEach((coords, idx) => {
    entities.add({
      id: `country_outline_${idx}`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(coords),
        width: 1,
        material: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.4),
      },
    });
  });
};

const ensureCountryOutlines = async (viewer: Cesium.Viewer) => {
  if (!viewer || viewer.isDestroyed()) {
    console.warn("[CesiumGlobe] Cannot ensure outlines, viewer unavailable");
    return null;
  }

  if ((viewer as any)._countryOutlinePromise) {
    return (viewer as any)._countryOutlinePromise;
  }

  const promise = (async () => {
    try {
      const dataSource = await Cesium.GeoJsonDataSource.load(
        COUNTRY_GEOJSON_URL,
        {
          stroke: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.5),
          fill: Cesium.Color.TRANSPARENT,
          strokeWidth: 1.2,
        }
      );
      viewer.dataSources.add(dataSource);
      (viewer as any)._countryOutlineSource = dataSource;
      return dataSource;
    } catch (error) {
      console.warn("[CesiumGlobe] GeoJSON outlines failed, using fallback:", error);
      addSimpleCountryOutlines(viewer);
      return null;
    }
  })();

  (viewer as any)._countryOutlinePromise = promise;
  return promise;
};

// Set Cesium Ion token and base URL
if (typeof window !== "undefined") {
  if (process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN) {
    Cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
  }
  (window as any).CESIUM_BASE_URL = "/cesium/";
}

// Maximum visible satellites based on mode
// Keep Chrome (safe mode) very light to avoid GPU crashes (Error 5)
const MAX_VISIBLE_SATS_NORMAL = 500;
const MAX_VISIBLE_SATS_PERFORMANCE = 300;
const MAX_VISIBLE_SATS_SAFE = 60;

export default function CesiumGlobe({ viewerRef }: { viewerRef?: React.MutableRefObject<Cesium.Viewer | null> }) {
  const internalViewerRef = useRef<Cesium.Viewer | null>(null);
  const actualViewerRef = viewerRef || internalViewerRef;
  const state = useSimStore((s) => s.state);
  const selectedEntity = useSimStore((s) => s.selectedEntity);
  const setSelectedEntity = useSimStore((s) => s.setSelectedEntity);
  const performanceMode = useSimStore((s) => s.performanceMode);
  const tutorialActive = useTutorialStore((s) => s.isActive);
  const { getSafeMode } = require("../hooks/useCesiumViewer");
  const safeMode = getSafeMode();

  // Throttle requestRender in safe mode so Chrome GPU stays idle when we are
  let lastSafeRenderTime = useRef<number>(0);


  // Update satellites and ground sites (skip while tutorial is running)
  useEffect(() => {
    if (tutorialActive) {
      return;
    }
    const viewer = actualViewerRef.current;
    if (
      !viewer ||
      viewer.isDestroyed() ||
      !state ||
      !state.satellites ||
      state.satellites.length === 0
    ) {
      return;
    }
    if (viewer.isDestroyed()) return;

    const entities = viewer.entities;

    // Clear existing entities
    entities.removeAll();

      // Add ground sites
      if (state.groundSites) {
        const glowSize = 65000;
        const labelStyle = new Cesium.NearFarScalar(1.5e7, 1.0, 8.0e7, 0.35);

        state.groundSites.forEach((site) => {
          if (
            !Number.isFinite(site.lat) ||
            !Number.isFinite(site.lon)
          ) {
            return;
          }
          const label = GROUND_LABELS[site.id] || site.id;
          const baseEntity = entities.add({
            id: site.id,
            position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0),
            point: {
              pixelSize: 24,
              color: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.95),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 4,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.0, 8.0e7, 0.45),
            },
            label: {
              text: label,
              font: "18px 'JetBrains Mono', monospace",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 4,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              scaleByDistance: labelStyle,
              pixelOffset: new Cesium.Cartesian2(0, -12),
            },
          });

          (baseEntity as any)._entityType = "ground";

          // Add glow halo
          entities.add({
            id: `${site.id}_halo`,
            position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0),
            ellipse: {
              semiMajorAxis: glowSize,
              semiMinorAxis: glowSize,
              material: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.18),
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
        });
      }

      const groundLookup = new Map(
        state.groundSites?.map((site) => [site.id, site]) ?? []
      );

      // Determine max satellites based on mode
      const maxSats = safeMode
        ? MAX_VISIBLE_SATS_SAFE
        : performanceMode
        ? MAX_VISIBLE_SATS_PERFORMANCE
        : MAX_VISIBLE_SATS_NORMAL;
      
      const satellitesToShow = state.satellites.slice(0, maxSats);
      
      // Batch entity creation to reduce GPU churn
      entities.suspendEvents();
      
      try {
        satellitesToShow.forEach((sat) => {
          if (
            !Number.isFinite(sat.lat) ||
            !Number.isFinite(sat.lon) ||
            !Number.isFinite(sat.alt_km)
          ) {
            return;
          }
          const color = sat.sunlit
            ? Cesium.Color.fromCssColorString("#ffd06a")
            : Cesium.Color.fromCssColorString("#4fc3f7");
          const entityId = `sat_${sat.id}`;
          const existing = entities.getById(entityId);
          if (existing) {
            entities.remove(existing);
          }
          const satEntity = entities.add({
            id: entityId,
            position: Cesium.Cartesian3.fromDegrees(
              sat.lon,
              sat.lat,
              sat.alt_km * 1000
            ),
            point: safeMode
              ? {
                  // Very lightweight dots in safe mode
                  pixelSize: 3,
                  color,
                }
              : {
                  pixelSize: sat.sunlit ? 10 : 7,
                  color,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 1,
                  scaleByDistance: new Cesium.NearFarScalar(
                    3.0e6,
                    0.9,
                    1.0e8,
                    0.15
                  ),
                  distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
                    1.0e5,
                    1.0e8
                  ),
                },
          });

          (satEntity as any)._entityType = "satellite";
          (satEntity as any)._satelliteId = sat.id;

          // Draw line from satellite to its current gateway (only in non-safe mode to reduce GPU load)
          if (!safeMode && sat.nearestGatewayId) {
            const gateway = groundLookup.get(sat.nearestGatewayId);
            if (gateway) {
              const linkId = `link_${sat.id}_${gateway.id}`;
              const existingLink = entities.getById(linkId);
              if (existingLink) {
                entities.remove(existingLink);
              }
              entities.add({
                id: linkId,
                polyline: {
                  positions: Cesium.Cartesian3.fromDegreesArrayHeights([
                    gateway.lon,
                    gateway.lat,
                    0,
                    sat.lon,
                    sat.lat,
                    sat.alt_km * 1000,
                  ]),
                  width: 2,
                  material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.2,
                    color: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.4),
                  }),
                },
              });
            }
          }
        });
        
        // Resume events and request single render after batch
        entities.resumeEvents();

        // In safe mode, only request a render at most every 5 seconds to avoid idle GPU churn
        if (safeMode) {
          const nowTs = Date.now();
          if (nowTs - lastSafeRenderTime.current > 5000) {
            viewer.scene.requestRender();
            lastSafeRenderTime.current = nowTs;
          }
        } else {
          viewer.scene.requestRender();
        }
        
        // Log GPU event
        const { logGpuEvent } = require("../lib/debugGpu");
        logGpuEvent("satellites_rendered", { 
          count: satellitesToShow.length, 
          maxSats, 
          safeMode, 
          performanceMode 
        });
        
        console.log(`[CesiumGlobe] Added ${satellitesToShow.length} satellites and ${state.groundSites?.length || 0} ground sites`);
      } catch (error) {
        entities.resumeEvents();
        console.error("[CesiumGlobe] Error updating entities:", error);
      }
  }, [state, performanceMode, tutorialActive]);

  // Handle entity selection
  useEffect(() => {
    if (!actualViewerRef.current) return;
    const viewer = actualViewerRef.current;
    if (viewer.isDestroyed()) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: any) => {
      const pickedObject = viewer.scene.pick(click.position);
      if (!pickedObject || !pickedObject.id) {
        setSelectedEntity(null);
        return;
      }

      const entity: any = pickedObject.id;
      const rawId: string =
        typeof entity.id === "string" ? entity.id : (entity.id?.id as string);

      if (entity._entityType === "ground") {
        setSelectedEntity({ type: "ground", id: rawId });
        // Zoom to ground site - use bounding sphere like tutorial
        const groundSite = state?.groundSites?.find((s) => s.id === rawId);
        if (groundSite && viewer) {
          const position = Cesium.Cartesian3.fromDegrees(groundSite.lon, groundSite.lat, 0);
          const boundingSphere = new Cesium.BoundingSphere(position, 50000);
          viewer.camera.flyToBoundingSphere(boundingSphere, {
            duration: 2.0,
            offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-90), 50000), // Birds-eye view: -90 degrees pitch
          });
        }
        return;
      }

      if (entity._entityType === "satellite") {
        const satId = entity._satelliteId || rawId.replace(/^sat_/, "");
        setSelectedEntity({ type: "satellite", id: satId });
        // Zoom to satellite - use bounding sphere like tutorial
        const satellite = state?.satellites?.find((s) => s.id === satId);
        if (satellite && viewer) {
          const position = Cesium.Cartesian3.fromDegrees(satellite.lon, satellite.lat, satellite.alt_km * 1000);
          const boundingSphere = new Cesium.BoundingSphere(position, 100000);
          viewer.camera.flyToBoundingSphere(boundingSphere, {
            duration: 2.0,
            offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-90), satellite.alt_km * 1000 + 100000), // Birds-eye view: -90 degrees pitch
          });
        }
        return;
      }

      // Fallback detection
      if (rawId?.startsWith("sat_")) {
        const satId = rawId.replace("sat_", "");
        setSelectedEntity({ type: "satellite", id: satId });
        // Zoom to satellite with animation - ensure camera looks at target
        const satellite = state?.satellites?.find((s) => s.id === satId);
        if (satellite && viewer) {
          const destination = Cesium.Cartesian3.fromDegrees(satellite.lon, satellite.lat, satellite.alt_km * 1000 + 100000);
          viewer.camera.flyTo({
            destination: destination,
            duration: 2.0,
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-90), // Birds-eye view: -90 degrees pitch
              roll: 0.0,
            },
          });
          // Ensure camera looks at the target after flyTo completes
          viewer.camera.flyTo({
            destination: destination,
            duration: 2.0,
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-0.5),
              roll: 0.0,
            },
            complete: () => {
              viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            },
          });
        }
      } else if (state?.groundSites?.some((site) => site.id === rawId)) {
        setSelectedEntity({ type: "ground", id: rawId });
        // Zoom to ground site with animation - ensure camera looks at target
        const groundSite = state.groundSites.find((s) => s.id === rawId);
        if (groundSite && viewer) {
          const destination = Cesium.Cartesian3.fromDegrees(groundSite.lon, groundSite.lat, 50000);
          viewer.camera.flyTo({
            destination: destination,
            duration: 2.0,
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-0.5),
              roll: 0.0,
            },
          });
          // Ensure camera looks at the target after flyTo completes
          viewer.camera.flyTo({
            destination: destination,
            duration: 2.0,
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-0.5),
              roll: 0.0,
            },
            complete: () => {
              viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            },
          });
        }
      } else {
        setSelectedEntity(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, [setSelectedEntity, state]);

  // Viewer is created by useCesiumViewer hook; this component only manipulates entities.
  return null;
}
