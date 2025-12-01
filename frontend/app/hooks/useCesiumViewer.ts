import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import { isSafeGpuDefault } from "../lib/env/browser";

// Set Cesium Ion token and base URL
if (typeof window !== "undefined") {
  if (process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN) {
    Cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
  }
  (window as any).CESIUM_BASE_URL = "/cesium/";
}

// Global viewer instance - only one should exist
let globalViewer: Cesium.Viewer | null = null;
let globalContainerId: string | null = null;

// Check for safe mode: URL overrides, otherwise Chrome defaults to safe GPU mode
function isSafeMode(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const forced = params.get("safeGpu");
  if (forced === "0") return false;
  if (forced === "1") return true;
  return isSafeGpuDefault();
}

export function useCesiumViewer(
  containerId: string,
  opts?: { safeGpu?: boolean }
) {
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const safeMode = opts?.safeGpu ?? isSafeMode();

  useEffect(() => {
    const el = document.getElementById(containerId);
    if (!el) {
      console.warn(`[useCesiumViewer] Container ${containerId} not found`);
      return;
    }

    // Basic WebGL capability check before attempting to construct the viewer
    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) {
        console.error(
          "[useCesiumViewer] WebGL context could not be created. Globe rendering is disabled."
        );
        (window as any).__CESIUM_INIT_ERROR =
          "WebGL is not available in this browser/tab. Try refreshing the page or restarting the browser.";
        return;
      }
    } catch (err) {
      console.error(
        "[useCesiumViewer] Error while probing WebGL support:",
        err
      );
      (window as any).__CESIUM_INIT_ERROR =
        "WebGL probing failed – globe rendering disabled for this session.";
      return;
    }

    // If we already have a viewer for this container, reuse it
    if (viewerRef.current && !viewerRef.current.isDestroyed()) {
      console.log(`[useCesiumViewer] Reusing existing viewer for ${containerId}`);
      return;
    }

    // If global viewer exists and is valid, reuse it
    if (globalViewer && !globalViewer.isDestroyed() && globalContainerId === containerId) {
      console.log(`[useCesiumViewer] Reusing global viewer for ${containerId}`);
      viewerRef.current = globalViewer;
      return;
    }

    // Destroy any existing global viewer if switching containers
    if (globalViewer && !globalViewer.isDestroyed() && globalContainerId !== containerId) {
      console.log(`[useCesiumViewer] Destroying previous global viewer (switching from ${globalContainerId} to ${containerId})`);
      try {
        globalViewer.destroy();
      } catch (e) {
        console.warn("[useCesiumViewer] Error destroying previous viewer:", e);
      }
      globalViewer = null;
      globalContainerId = null;
    }

    console.log(
      `[useCesiumViewer] Creating new viewer for ${containerId}${
        safeMode ? " (SAFE MODE)" : ""
      }`
    );

    let viewer: Cesium.Viewer;
    try {
      viewer = new Cesium.Viewer(el, {
        terrainProvider: new Cesium.EllipsoidTerrainProvider(), // Lightweight terrain
        baseLayerPicker: false,
        vrButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        animation: false,
        fullscreenButton: false,
        navigationHelpButton: false,
        skyBox: false,
        skyAtmosphere: false,
        // GPU optimization options
        requestRenderMode: true, // Only render when needed
        // In safe mode, render even less frequently to reduce GPU churn
        maximumRenderTimeChange: safeMode ? 2.0 : 1.0,
        // Do NOT use preserveDrawingBuffer unless absolutely necessary
      });
    } catch (err) {
      console.error(
        "[useCesiumViewer] Error constructing Cesium.Viewer – disabling globe for this session:",
        err
      );
      (window as any).__CESIUM_INIT_ERROR =
        "Failed to initialize the 3D globe (WebGL error). Try a full page reload; if it persists, restart the browser.";
      return;
    }

    // Configure scene for performance
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#1a2332");
    viewer.scene.globe.enableLighting = false;
    viewer.scene.skyBox = undefined;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#000000");
    viewer.scene.fog.enabled = false;
    viewer.scene.globe.showGroundAtmosphere = false;
    viewer.scene.globe.showWaterEffect = false;
    
    // In safe mode, disable additional features
    if (safeMode) {
      viewer.scene.globe.shadows = Cesium.ShadowMode.DISABLED;
      viewer.scene.requestRenderMode = true;
    }

    if (viewer.scene.globe.imageryLayers.length > 0) {
      viewer.scene.globe.imageryLayers.get(0).alpha = 0.15;
    }

    // Set container styles
    if (el) {
      (el as HTMLElement).style.position = "fixed";
      (el as HTMLElement).style.top = "0";
      (el as HTMLElement).style.left = "0";
      (el as HTMLElement).style.right = "0";
      (el as HTMLElement).style.bottom = "0";
      (el as HTMLElement).style.width = "100vw";
      (el as HTMLElement).style.height = "100vh";
      (el as HTMLElement).style.margin = "0";
      (el as HTMLElement).style.padding = "0";
      (el as HTMLElement).style.zIndex = "0";
    }

    // Ensure canvas fills container and is visible
    const canvas = el.querySelector("canvas");
    if (canvas) {
      (canvas as HTMLElement).style.width = "100%";
      (canvas as HTMLElement).style.height = "100%";
      (canvas as HTMLElement).style.display = "block";
      (canvas as HTMLElement).style.visibility = "visible";
      (canvas as HTMLElement).style.opacity = "1";
      (canvas as HTMLElement).style.position = "absolute";
      (canvas as HTMLElement).style.top = "0";
      (canvas as HTMLElement).style.left = "0";
      (canvas as HTMLElement).style.zIndex = "0";
    }
    
    // Ensure widget container has proper dimensions (critical fix for disappearing globe)
    const widget = (viewer as any).cesiumWidget;
    if (widget?.container) {
      const widgetContainer = widget.container as HTMLElement;
      const containerHeight = el.offsetHeight || window.innerHeight;
      const containerWidth = el.offsetWidth || window.innerWidth;
      widgetContainer.style.width = `${containerWidth}px`;
      widgetContainer.style.height = `${containerHeight}px`;
      widgetContainer.style.position = "relative";
      widgetContainer.style.overflow = "hidden";
    }

    // Force initial render - requestRenderMode might prevent initial render
    viewer.scene.requestRender();

    viewerRef.current = viewer;
    globalViewer = viewer;
    globalContainerId = containerId;

    // Log GPU event
    if (typeof window !== "undefined" && (window as any).logGpuEvent) {
      (window as any).logGpuEvent("viewer_created", { containerId, safeMode });
    }

    return () => {
      // Don't destroy on unmount - let the global instance persist
      // Only destroy if explicitly requested or on page unload
      console.log(`[useCesiumViewer] Component unmounting for ${containerId}, keeping viewer alive`);
    };
  }, [containerId, safeMode]);

  // Cleanup on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (globalViewer && !globalViewer.isDestroyed()) {
        console.log("[useCesiumViewer] Page unloading, destroying viewer");
        try {
          globalViewer.destroy();
        } catch (e) {
          console.warn("[useCesiumViewer] Error destroying viewer on unload:", e);
        }
        globalViewer = null;
        globalContainerId = null;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return viewerRef;
}

// Export function to get global viewer (for components that need it)
export function getGlobalViewer(): Cesium.Viewer | null {
  return globalViewer && !globalViewer.isDestroyed() ? globalViewer : null;
}

// Export function to check safe mode
export function getSafeMode(): boolean {
  return isSafeMode();
}

