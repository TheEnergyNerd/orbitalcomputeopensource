"use client";

import { useState, useRef, useEffect } from "react";
import * as Cesium from "cesium";
import { useOrbitalUnitsStore, UNIT_DEFINITIONS, UnitType } from "../store/orbitalUnitsStore";

interface DragToOrbitProps {
  viewerRef: React.MutableRefObject<Cesium.Viewer | null>;
}

export default function DragToOrbit({ viewerRef }: DragToOrbitProps) {
  const [dragging, setDragging] = useState<UnitType | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const { addToQueue } = useOrbitalUnitsStore();

  useEffect(() => {
    if (!viewerRef.current || !dragging) return;

    const viewer = viewerRef.current;
    const handleMouseMove = (event: MouseEvent) => {
      setDragPosition({ x: event.clientX, y: event.clientY });
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (!viewer || !dragging) return;

      // Get world position from screen coordinates
      const cartesian = viewer.camera.pickEllipsoid(
        new Cesium.Cartesian2(event.clientX, event.clientY),
        viewer.scene.globe.ellipsoid
      );

      if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);

        // Add unit to queue at this location
        const unitDef = UNIT_DEFINITIONS[dragging];
        addToQueue({
          type: dragging,
          name: unitDef.name,
          cost: unitDef.cost,
          powerOutputMw: unitDef.powerOutputMw,
          latencyMs: unitDef.latencyMs,
          lifetimeYears: unitDef.lifetimeYears,
          buildTimeDays: unitDef.buildTimeDays,
        });
      }

      setDragging(null);
      setDragPosition(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, viewerRef, addToQueue]);

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40 panel-glass rounded-xl p-4 w-64 sm:w-72 max-w-[calc(100vw-12px)] shadow-2xl border border-white/10">
        <h3 className="text-lg font-bold text-accent-blue mb-4">Deploy Units</h3>
        <div className="space-y-2">
          {(["leo_pod", "geo_hub", "server_farm"] as UnitType[]).map((type) => {
            const def = UNIT_DEFINITIONS[type];
            return (
              <div
                key={type}
                draggable
                onDragStart={() => setDragging(type)}
                className="p-3 bg-gray-800/50 hover:bg-gray-700/50 rounded-lg cursor-move border border-gray-700/50 hover:border-accent-blue/50 transition-all"
              >
                <div className="text-sm font-semibold text-white">{def.name}</div>
                <div className="text-xs text-gray-400">{def.powerOutputMw} MW</div>
              </div>
            );
          })}
        </div>
        <div className="text-xs text-gray-500 mt-3 italic">
          Drag to globe to deploy
        </div>
      </div>

      {dragging && dragPosition && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: dragPosition.x - 50,
            top: dragPosition.y - 50,
          }}
        >
          <div className="bg-accent-blue/80 text-dark-bg px-4 py-2 rounded-lg font-semibold shadow-lg">
            {UNIT_DEFINITIONS[dragging].name}
          </div>
        </div>
      )}
    </>
  );
}

