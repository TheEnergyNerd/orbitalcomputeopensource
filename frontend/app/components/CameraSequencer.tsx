"use client";

import { useEffect, useRef } from "react";
import * as Cesium from "cesium";

export interface CameraKeyframe {
  durationMs: number;
  destination: { lat: number; lon: number; height: number };
  heading?: number;
  pitch?: number;
}

interface CameraSequencerProps {
  viewerRef: React.MutableRefObject<Cesium.Viewer | null>;
  sequence: CameraKeyframe[];
  onComplete?: () => void;
}

export default function CameraSequencer({
  viewerRef,
  sequence,
  onComplete,
}: CameraSequencerProps) {
  const currentIndexRef = useRef(0);
  const isRunningRef = useRef(false);

  useEffect(() => {
    if (!viewerRef.current || sequence.length === 0 || isRunningRef.current) return;
    if (currentIndexRef.current >= sequence.length) return;

    isRunningRef.current = true;
    const viewer = viewerRef.current;

    const runSequence = async () => {
      for (let i = currentIndexRef.current; i < sequence.length; i++) {
        const keyframe = sequence[i];
        const destination = Cesium.Cartesian3.fromDegrees(
          keyframe.destination.lon,
          keyframe.destination.lat,
          keyframe.destination.height
        );

        await new Promise<void>((resolve) => {
          viewer.camera.flyTo({
            destination: destination,
            duration: keyframe.durationMs / 1000,
            orientation: {
              heading: keyframe.heading ? Cesium.Math.toRadians(keyframe.heading) : 0,
              pitch: keyframe.pitch ? Cesium.Math.toRadians(keyframe.pitch) : -0.5,
              roll: 0.0,
            },
            complete: () => {
              resolve();
            },
          });
        });

        currentIndexRef.current = i + 1;
      }

      isRunningRef.current = false;
      if (onComplete) {
        onComplete();
      }
    };

    runSequence();
  }, [viewerRef, sequence, onComplete]);

  return null;
}

export function runCameraSequence(
  viewer: Cesium.Viewer | null,
  frames: CameraKeyframe[]
): Promise<void> {
  if (!viewer) return Promise.resolve();

  return new Promise((resolve) => {
    let currentIndex = 0;

    const runNext = () => {
      if (currentIndex >= frames.length) {
        resolve();
        return;
      }

      const keyframe = frames[currentIndex];
      const destination = Cesium.Cartesian3.fromDegrees(
        keyframe.destination.lon,
        keyframe.destination.lat,
        keyframe.destination.height
      );

      viewer.camera.flyTo({
        destination: destination,
        duration: keyframe.durationMs / 1000,
        orientation: {
          heading: keyframe.heading ? Cesium.Math.toRadians(keyframe.heading) : 0,
          pitch: keyframe.pitch ? Cesium.Math.toRadians(keyframe.pitch) : -0.5,
          roll: 0.0,
        },
        complete: () => {
          currentIndex++;
          runNext();
        },
      });
    };

    runNext();
  });
}

