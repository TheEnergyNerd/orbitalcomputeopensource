"use client";

import { useEffect } from "react";
import * as Cesium from "cesium";

export default function GlobePositionDebug({ viewerRef }: { viewerRef?: React.MutableRefObject<Cesium.Viewer | null> }) {
  useEffect(() => {
    const updatePosition = () => {
      const viewer = viewerRef?.current;
      if (!viewer || viewer.isDestroyed()) {
        return;
      }

      const container = viewer.container?.parentElement;
      const canvas = viewer.canvas;
      const viewerContainer = viewer.container;
      const widget = (viewer as any).cesiumWidget;
      const widgetContainer = widget?.container;

      const containerRect = container?.getBoundingClientRect();
      const canvasRect = canvas?.getBoundingClientRect();
      const viewerRect = viewerContainer?.getBoundingClientRect();
      const widgetRect = widgetContainer?.getBoundingClientRect();

      const containerComputed = container ? window.getComputedStyle(container) : null;

      console.group("[GlobePositionDebug] Position Report");
      console.log("Viewport:", {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      
      console.log("React Container:", {
        top: containerRect?.top ?? 'N/A',
        left: containerRect?.left ?? 'N/A',
        width: containerRect?.width ?? 'N/A',
        height: containerRect?.height ?? 'N/A',
        computedTop: containerComputed?.top ?? 'N/A',
        computedLeft: containerComputed?.left ?? 'N/A',
        computedPosition: containerComputed?.position ?? 'N/A',
        computedWidth: containerComputed?.width ?? 'N/A',
        computedHeight: containerComputed?.height ?? 'N/A',
        computedTransform: containerComputed?.transform ?? 'N/A',
        inlineStyle: container ? {
          position: container.style.position,
          top: container.style.top,
          left: container.style.left,
          width: container.style.width,
          height: container.style.height,
        } : 'N/A',
      });

      console.log("Viewer Container:", {
        top: viewerRect?.top ?? 'N/A',
        left: viewerRect?.left ?? 'N/A',
        width: viewerRect?.width ?? 'N/A',
        height: viewerRect?.height ?? 'N/A',
        styleTop: viewerContainer?.style.top ?? 'N/A',
        styleLeft: viewerContainer?.style.left ?? 'N/A',
        stylePosition: viewerContainer?.style.position ?? 'N/A',
        styleWidth: viewerContainer?.style.width ?? 'N/A',
        styleHeight: viewerContainer?.style.height ?? 'N/A',
      });

      console.log("Widget Container:", {
        top: widgetRect?.top ?? 'N/A',
        left: widgetRect?.left ?? 'N/A',
        width: widgetRect?.width ?? 'N/A',
        height: widgetRect?.height ?? 'N/A',
        styleTop: widgetContainer?.style.top ?? 'N/A',
        styleLeft: widgetContainer?.style.left ?? 'N/A',
        stylePosition: widgetContainer?.style.position ?? 'N/A',
      });

      console.log("Canvas:", {
        top: canvasRect?.top ?? 'N/A',
        left: canvasRect?.left ?? 'N/A',
        width: canvas?.width ?? 'N/A',
        height: canvas?.height ?? 'N/A',
        styleTop: canvas?.style.top ?? 'N/A',
        styleLeft: canvas?.style.left ?? 'N/A',
        stylePosition: canvas?.style.position ?? 'N/A',
        styleWidth: canvas?.style.width ?? 'N/A',
        styleHeight: canvas?.style.height ?? 'N/A',
      });

      // Camera and Scene Diagnostics
      if (viewer && viewer.camera && viewer.scene) {
        try {
          const position = viewer.camera.positionCartographic;
          const height = position ? position.height : null;
          const longitude = position ? Cesium.Math.toDegrees(position.longitude) : null;
          const latitude = position ? Cesium.Math.toDegrees(position.latitude) : null;
          
          // Get camera direction
          const direction = viewer.camera.direction;
          const directionCartographic = Cesium.Cartographic.fromCartesian(direction);
          const directionLon = Cesium.Math.toDegrees(directionCartographic.longitude);
          const directionLat = Cesium.Math.toDegrees(directionCartographic.latitude);
          
          // Check if render loop is running
          const widget = (viewer as any).cesiumWidget;
          const isRendering = widget ? !widget.useDefaultRenderLoop : false;
          const renderMode = widget ? (widget.useDefaultRenderLoop ? 'default' : 'manual') : 'unknown';
          
          // Check canvas rendering
          const canvas = viewer.canvas;
          const canvasContext = canvas ? canvas.getContext('webgl') || canvas.getContext('webgl2') || canvas.getContext('2d') : null;
          const isCanvasRendering = canvasContext !== null;
          
          console.log("Camera State:", {
            height: height ? `${(height / 1000).toFixed(1)}km` : 'N/A',
            longitude: longitude ? `${longitude.toFixed(2)}°` : 'N/A',
            latitude: latitude ? `${latitude.toFixed(2)}°` : 'N/A',
            direction: `lon: ${directionLon.toFixed(2)}°, lat: ${directionLat.toFixed(2)}°`,
            pitch: viewer.camera.pitch ? `${Cesium.Math.toDegrees(viewer.camera.pitch).toFixed(2)}°` : 'N/A',
            heading: viewer.camera.heading ? `${Cesium.Math.toDegrees(viewer.camera.heading).toFixed(2)}°` : 'N/A',
          });
          
          console.log("Scene State:", {
            globeShow: viewer.scene.globe.show,
            globeBaseColor: viewer.scene.globe.baseColor?.toCssColorString() ?? 'N/A',
            backgroundColor: viewer.scene.backgroundColor?.toCssColorString() ?? 'N/A',
            imageryLayers: viewer.scene.globe.imageryLayers.length,
            imageryAlpha: viewer.scene.globe.imageryLayers.length > 0 ? viewer.scene.globe.imageryLayers.get(0).alpha : 'N/A',
            fogEnabled: viewer.scene.fog.enabled,
            skyBox: viewer.scene.skyBox ? 'present' : 'undefined',
          });
          
          console.log("Rendering State:", {
            renderMode: renderMode,
            isRendering: isRendering,
            canvasContext: isCanvasRendering ? 'available' : 'missing',
            canvasWidth: canvas?.width ?? 'N/A',
            canvasHeight: canvas?.height ?? 'N/A',
            canvasDisplay: canvas?.style.display ?? 'N/A',
            canvasVisibility: canvas?.style.visibility ?? 'N/A',
            canvasOpacity: canvas?.style.opacity ?? 'N/A',
          });
          
          // Check if camera is looking at Earth (height should be reasonable, pitch should be negative)
          const cameraIssues: string[] = [];
          if (height && (height > 50000000 || height < 1000000)) {
            cameraIssues.push(`⚠️ Camera height is extreme: ${(height / 1000).toFixed(1)}km (should be 2-40M)`);
          }
          if (viewer.camera.pitch && viewer.camera.pitch > 0) {
            cameraIssues.push(`⚠️ Camera pitch is positive (looking up at space): ${Cesium.Math.toDegrees(viewer.camera.pitch).toFixed(2)}°`);
          }
          if (!viewer.scene.globe.show) {
            cameraIssues.push(`⚠️ Globe is not shown!`);
          }
          if (viewer.scene.globe.imageryLayers.length === 0) {
            cameraIssues.push(`⚠️ No imagery layers loaded!`);
          }
          if (!isCanvasRendering) {
            cameraIssues.push(`⚠️ Canvas context not available - canvas may not be rendering!`);
          }
          if (canvas && (canvas.width === 0 || canvas.height === 0)) {
            cameraIssues.push(`⚠️ Canvas has zero dimensions: ${canvas.width}x${canvas.height}`);
          }
          
          if (cameraIssues.length > 0) {
            console.warn("Camera/Scene Issues:", cameraIssues);
          } else {
            console.log("✓ Camera and scene appear correctly configured");
          }
        } catch (error) {
          console.warn("Error checking camera/scene state:", error);
        }
      }

      // Diagnosis
      const issues: string[] = [];
      if (containerRect && containerRect.top > 100) {
        issues.push(`⚠️ Container is ${containerRect.top.toFixed(0)}px from top (should be ~0px)`);
      }
      if (containerRect && containerRect.width < window.innerWidth * 0.9) {
        issues.push(`⚠️ Container width (${containerRect.width.toFixed(0)}px) is much smaller than viewport (${window.innerWidth}px)`);
      }
      if (containerRect && containerRect.height < window.innerHeight * 0.9) {
        issues.push(`⚠️ Container height (${containerRect.height.toFixed(0)}px) is much smaller than viewport (${window.innerHeight}px)`);
      }
      if (containerRect && containerRect.top < 100 && containerRect.width >= window.innerWidth * 0.9) {
        issues.push("✓ Container appears correctly positioned");
      }

      if (issues.length > 0) {
        console.log("Diagnosis:", issues);
      }

      console.groupEnd();
    };

    const interval = setInterval(updatePosition, 2000);
    updatePosition();

    return () => clearInterval(interval);
  }, [viewerRef]);

  return null;
}

