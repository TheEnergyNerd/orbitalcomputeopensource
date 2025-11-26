"use client";

import { useEffect, useRef } from "react";
import * as Cesium from "cesium";

export default function CameraPresets({ viewerRef }: { viewerRef: React.MutableRefObject<Cesium.Viewer | null> }) {
  const handleViewEarth = () => {
    if (viewerRef.current) {
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-100, 40, 15000000),
        duration: 3.0,
      });
    }
  };

  const handleViewAbilene = () => {
    if (viewerRef.current) {
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-99.74, 32.45, 50000),
        duration: 3.0,
      });
    }
  };

  const handleViewOrbit = () => {
    if (viewerRef.current) {
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-100, 40, 20000000),
        duration: 3.0,
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-0.3),
          roll: 0.0,
        },
      });
    }
  };

  const handleViewLEORing = () => {
    if (viewerRef.current) {
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-100, 40, 10000000),
        duration: 3.0,
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-0.5),
          roll: 0.0,
        },
      });
    }
  };

  return (
    <div className="fixed top-6 left-[220px] sm:left-[220px] flex flex-wrap gap-2 z-[90] max-w-[calc(100vw-240px)]">
      <button
        onClick={handleViewEarth}
        className="px-4 py-2 bg-accent-blue/90 hover:bg-accent-blue text-dark-bg rounded-lg text-sm font-semibold btn-primary shadow-lg"
      >
        View Earth
      </button>
      <button
        onClick={handleViewAbilene}
        className="px-4 py-2 bg-accent-blue/90 hover:bg-accent-blue text-dark-bg rounded-lg text-sm font-semibold btn-primary shadow-lg"
      >
        View Abilene
      </button>
    </div>
  );
}

