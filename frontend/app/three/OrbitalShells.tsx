"use client";

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { TorusGeometry, Mesh, Color } from "three";
import { useOrbitSim } from "../state/orbitStore";
import { ORBIT_SHELLS, getShellByAltitude } from "../lib/orbitSim/orbitShells";

// NEW 4-SHELL MODEL (ENERGY-FIRST)
const SHELLS = ORBIT_SHELLS.map((shell, index) => {
  const avgAltitude = shell.altitude_km; // Now a single value, not a range
  const radius = 1 + (avgAltitude / 6371); // Earth radius + altitude in normalized units
  
  // Color coding by shell type
  let color: Color;
  switch (shell.id) {
    case "LEO_340":
      color = new Color(0x4a90e2); // Blue
      break;
    case "LEO_550":
      color = new Color(0xf5a623); // Orange
      break;
    case "LEO_1100":
      color = new Color(0xbd10e0); // Purple
      break;
    case "MEO_8000":
      color = new Color(0xe74c3c); // Red
      break;
    case "MEO_20000":
      color = new Color(0x9b59b6); // Purple
      break;
    default:
      color = new Color(0x00ffff); // Cyan fallback
  }
  
  return {
    id: index + 1,
    shell_id: shell.id,
    altitude: avgAltitude,
    radius,
    color,
    shell_data: shell,
  };
});

export function OrbitalShells() {
  const shellsRef = useRef<Map<number, Mesh>>(new Map());
  const rotationRef = useRef<Map<number, number>>(new Map());

  // Initialize rotations
  useEffect(() => {
    SHELLS.forEach((shell) => {
      rotationRef.current.set(shell.id, Math.random() * Math.PI * 2);
    });
  }, []);

  // Get congestion data
  const satellites = useOrbitSim((s) => s.satellites);

  // Calculate congestion per shell using new 4-shell model
  const shellCongestion = useRef<Map<number, number>>(new Map());
  useEffect(() => {
    SHELLS.forEach((shell) => {
      const shellSats = satellites.filter(s => {
        // Calculate altitude from position
        const alt = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z) - 1;
        const altKm = alt * 6371; // Convert to km
        // Check if satellite is in this shell's altitude range
        const shellData = shell.shell_data;
        return altKm >= shellData.altitude_range_km[0] && altKm <= shellData.altitude_range_km[1];
      });
      
      // Calculate congestion index: active_routes / satellites_in_shell
      // For now, use average congestion of satellites in shell
      const avgCongestion = shellSats.length > 0
        ? shellSats.reduce((sum, s) => sum + (s.congestion || 0), 0) / shellSats.length
        : 0;
      
      shellCongestion.current.set(shell.id, avgCongestion);
    });
  }, [satellites]);

  // Get simulation time state - use separate selectors to avoid infinite loops
  const simPaused = useOrbitSim((s) => s.simPaused);
  const simSpeed = useOrbitSim((s) => s.simSpeed);

  // Animate shells
  const frameCount = useRef(0);
  useFrame((state, delta) => {
    frameCount.current++;
    const effectiveDelta = simPaused ? 0 : delta * simSpeed;
    
    // Log only occasionally
    
    SHELLS.forEach((shell) => {
      const mesh = shellsRef.current.get(shell.id);
      if (!mesh) {
        if (frameCount.current % 300 === 0) {
          console.log(`[OrbitalShells] Shell ${shell.id} mesh missing!`);
        }
        return;
      }

      // Slow rotation - make it MORE visible
      if (!simPaused && effectiveDelta > 0) {
        const currentRot = rotationRef.current.get(shell.id) || 0;
        const newRot = currentRot + effectiveDelta * 0.3; // Visible rotation speed
        rotationRef.current.set(shell.id, newRot);
        mesh.rotation.z = newRot;
      }
      
      // Add subtle breathing/pulsing effect
      const simTime = useOrbitSim.getState().simTime;
      const breath = 1 + Math.sin(simTime * 0.3 + shell.id) * 0.02; // Subtle pulse
      mesh.scale.set(breath, breath, breath);

      // Update color based on congestion - FORCE some congestion for visibility
      let congestion = shellCongestion.current.get(shell.id) || 0;
      // Add fake congestion for shell 1 to make it visible
      if (shell.id === 1 && congestion < 0.5) {
        congestion = 0.6; // Force yellow/red
      }
      
      let color: Color;
      if (congestion < 0.3) {
        color = new Color(0x00ffff); // Cyan = low
      } else if (congestion < 0.7) {
        color = new Color(0xffff00); // Yellow = rising
      } else {
        color = new Color(0xff0000); // Red = saturated
      }

      // Update glow intensity (ensure minimum visibility)
      const intensity = Math.max(0.5, 0.3 + congestion * 0.7); // Brighter
      const material = mesh.material as any;
      if (material) {
        material.color.copy(color);
        material.emissive.copy(color);
        material.emissiveIntensity = intensity;
        
        if (frameCount.current % 300 === 0 && shell.id === 1) {
          console.log(`[OrbitalShells] Shell ${shell.id}: congestion=${congestion.toFixed(2)}, color=${color.getHexString()}, intensity=${intensity.toFixed(2)}`);
        }
      }
    });
  });

  useEffect(() => {
    console.log(`[OrbitalShells] Component mounted, rendering ${SHELLS.length} shells, ${satellites.length} satellites`);
    SHELLS.forEach((shell) => {
      console.log(`[OrbitalShells] Shell ${shell.id}: radius=${shell.radius}, altitude=${shell.altitude}km`);
    });
  }, [satellites.length]);

  return (
    <>
      {SHELLS.map((shell) => (
        <mesh
          key={shell.id}
          ref={(ref) => {
            if (ref) {
              shellsRef.current.set(shell.id, ref);
              console.log(`[OrbitalShells] Shell ${shell.id} mesh created`);
            }
          }}
        >
          <torusGeometry args={[shell.radius, 0.008, 32, 128]} />
          <meshStandardMaterial
            color={shell.color}
            transparent
            opacity={0.7}
            emissive={shell.color}
            emissiveIntensity={0.6}
            side={2} // DoubleSide
            depthWrite={false}
            depthTest={true}
          />
        </mesh>
      ))}
    </>
  );
}

