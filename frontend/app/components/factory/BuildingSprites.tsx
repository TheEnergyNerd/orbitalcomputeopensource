"use client";

import React from "react";

interface BuildingSpriteProps {
  utilization: number; // 0-1
  isStarved: boolean;
  isConstrained: boolean;
  width?: number;
  height?: number;
}

/**
 * Chip Fab: tall cleanroom building with vertical vents
 */
export function ChipFabBuilding({ utilization, isStarved, isConstrained, width = 80, height = 60 }: BuildingSpriteProps) {
  const glowIntensity = Math.min(1, utilization * 1.5);
  const pulse = utilization > 0.9 ? "animate-pulse" : "";
  const borderColor = isStarved ? "#ef4444" : isConstrained ? "#f97316" : "#22c55e";
  
  return (
    <g>
      {/* Main building */}
      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        rx="4"
        fill="#1e293b"
        stroke={borderColor}
        strokeWidth={isStarved ? "3" : "2"}
        className={pulse}
        opacity={0.9}
      />
      
      {/* Vertical vents */}
      <rect x="10" y="5" width="4" height={height - 10} fill="#334155" />
      <rect x="width - 14" x={width - 14} y="5" width="4" height={height - 10} fill="#334155" />
      
      {/* Window strip (glows with utilization) */}
      <rect
        x="20"
        y="15"
        width={width - 40}
        height="8"
        fill="#60a5fa"
        opacity={0.3 + glowIntensity * 0.7}
        className="transition-opacity duration-300"
      />
      <rect
        x="20"
        y="28"
        width={width - 40}
        height="8"
        fill="#60a5fa"
        opacity={0.3 + glowIntensity * 0.7}
        className="transition-opacity duration-300"
      />
      <rect
        x="20"
        y="41"
        width={width - 40}
        height="8"
        fill="#60a5fa"
        opacity={0.3 + glowIntensity * 0.7}
        className="transition-opacity duration-300"
      />
    </g>
  );
}

/**
 * Rack Line: warehouse with roll-up doors
 */
export function ComputeLineBuilding({ utilization, isStarved, isConstrained, width = 80, height = 60 }: BuildingSpriteProps) {
  const glowIntensity = Math.min(1, utilization * 1.5);
  const pulse = utilization > 0.9 ? "animate-pulse" : "";
  const borderColor = isStarved ? "#ef4444" : isConstrained ? "#f97316" : "#22c55e";
  
  return (
    <g>
      {/* Main building */}
      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        rx="4"
        fill="#1e293b"
        stroke={borderColor}
        strokeWidth={isStarved ? "3" : "2"}
        className={pulse}
        opacity={0.9}
      />
      
      {/* Roll-up doors */}
      <rect x="15" y="10" width="20" height="40" fill="#0f172a" stroke="#475569" strokeWidth="1" />
      <rect x="45" y="10" width="20" height="40" fill="#0f172a" stroke="#475569" strokeWidth="1" />
      
      {/* Door details */}
      <line x1="15" y1="20" x2="35" y2="20" stroke="#475569" strokeWidth="1" />
      <line x1="15" y1="30" x2="35" y2="30" stroke="#475569" strokeWidth="1" />
      <line x1="15" y1="40" x2="35" y2="40" stroke="#475569" strokeWidth="1" />
      <line x1="45" y1="20" x2="65" y2="20" stroke="#475569" strokeWidth="1" />
      <line x1="45" y1="30" x2="65" y2="30" stroke="#475569" strokeWidth="1" />
      <line x1="45" y1="40" x2="65" y2="40" stroke="#475569" strokeWidth="1" />
      
      {/* Glowing windows */}
      <rect
        x="20"
        y="15"
        width="10"
        height="5"
        fill="#facc15"
        opacity={0.4 + glowIntensity * 0.6}
        className="transition-opacity duration-300"
      />
      <rect
        x="50"
        y="15"
        width="10"
        height="5"
        fill="#facc15"
        opacity={0.4 + glowIntensity * 0.6}
        className="transition-opacity duration-300"
      />
    </g>
  );
}

/**
 * Pod Factory: assembly hall with crane
 */
export function PodFactoryBuilding({ utilization, isStarved, isConstrained, width = 80, height = 60 }: BuildingSpriteProps) {
  const glowIntensity = Math.min(1, utilization * 1.5);
  const pulse = utilization > 0.9 ? "animate-pulse" : "";
  const borderColor = isStarved ? "#ef4444" : isConstrained ? "#f97316" : "#22c55e";
  const craneRotation = utilization > 0 ? (Date.now() / 2000) % 360 : 0; // Slow rotation when active
  
  return (
    <g>
      {/* Main building */}
      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        rx="4"
        fill="#1e293b"
        stroke={borderColor}
        strokeWidth={isStarved ? "3" : "2"}
        className={pulse}
        opacity={0.9}
      />
      
      {/* Crane arm (animated when active) */}
      {utilization > 0 && (
        <g transform={`translate(${width / 2}, 10) rotate(${craneRotation})`}>
          <line x1="0" y1="0" x2="0" y2="30" stroke="#cbd5e1" strokeWidth="2" />
          <line x1="0" y1="30" x2="-15" y2="45" stroke="#cbd5e1" strokeWidth="2" />
          <circle cx="-15" cy="45" r="3" fill="#f472b6" />
        </g>
      )}
      
      {/* Assembly floor */}
      <rect x="10" y="height - 15" width={width - 20} height="10" fill="#0f172a" />
      
      {/* Glowing windows */}
      <rect
        x="15"
        y="20"
        width="15"
        height="8"
        fill="#f472b6"
        opacity={0.4 + glowIntensity * 0.6}
        className="transition-opacity duration-300"
      />
      <rect
        x="50"
        y="20"
        width="15"
        height="8"
        fill="#f472b6"
        opacity={0.4 + glowIntensity * 0.6}
        className="transition-opacity duration-300"
      />
    </g>
  );
}

/**
 * Fuel Plant: horizontal tanks + pipes
 */
export function FuelPlantBuilding({ utilization, isStarved, isConstrained, width = 80, height = 60 }: BuildingSpriteProps) {
  const glowIntensity = Math.min(1, utilization * 1.5);
  const pulse = utilization > 0.9 ? "animate-pulse" : "";
  const borderColor = isStarved ? "#ef4444" : isConstrained ? "#f97316" : "#22c55e";
  const pipePulse = utilization > 0.7 ? "animate-pulse" : "";
  
  return (
    <g>
      {/* Main building base */}
      <rect
        x="0"
        y="20"
        width={width}
        height={height - 20}
        rx="4"
        fill="#1e293b"
        stroke={borderColor}
        strokeWidth={isStarved ? "3" : "2"}
        className={pulse}
        opacity={0.9}
      />
      
      {/* Horizontal tanks */}
      <ellipse cx="25" cy="15" rx="20" ry="8" fill="#334155" stroke="#475569" strokeWidth="1" />
      <ellipse cx="55" cy="15" rx="20" ry="8" fill="#334155" stroke="#475569" strokeWidth="1" />
      
      {/* Connecting pipe (pulses when active) */}
      <rect
        x="45"
        y="12"
        width="10"
        height="6"
        fill="#ef4444"
        opacity={0.6 + glowIntensity * 0.4}
        className={pipePulse}
      />
      
      {/* Glowing indicators */}
      <circle cx="25" cy="15" r="3" fill="#ef4444" opacity={0.5 + glowIntensity * 0.5} />
      <circle cx="55" cy="15" r="3" fill="#ef4444" opacity={0.5 + glowIntensity * 0.5} />
    </g>
  );
}

/**
 * Launch Complex: pad + tower + tiny rocket silhouette
 */
export function LaunchOpsBuilding({ utilization, isStarved, isConstrained, width = 80, height = 60 }: BuildingSpriteProps) {
  const glowIntensity = Math.min(1, utilization * 1.5);
  const pulse = utilization > 0.9 ? "animate-pulse" : "";
  const borderColor = isStarved ? "#ef4444" : isConstrained ? "#f97316" : "#22c55e";
  
  return (
    <g>
      {/* Launch pad base */}
      <rect
        x="0"
        y={height - 20}
        width={width}
        height="20"
        rx="2"
        fill="#0f172a"
        stroke="#475569"
        strokeWidth="1"
      />
      
      {/* Tower */}
      <rect
        x={width - 25}
        y="10"
        width="8"
        height={height - 30}
        fill="#334155"
        stroke="#475569"
        strokeWidth="1"
      />
      
      {/* Tower top (blinking when active) */}
      {utilization > 0 && (
        <circle
          cx={width - 21}
          cy="15"
          r="3"
          fill="#facc15"
          opacity={0.5 + (Math.sin(Date.now() / 500) * 0.5 + 0.5) * 0.5}
          className="transition-opacity duration-100"
        />
      )}
      
      {/* Rocket silhouette (centered on pad) */}
      <g transform={`translate(${width / 2}, ${height - 15})`}>
        <path
          d="M-4 0 L0 -12 L4 0 Z"
          fill="#cbd5e1"
          stroke="#94a3b8"
          strokeWidth="1"
        />
        <rect x="-2" y="-12" width="4" height="8" fill="#64748b" />
      </g>
      
      {/* Pad glow (when active) */}
      {utilization > 0 && (
        <ellipse
          cx={width / 2}
          cy={height - 10}
          rx={width / 3}
          ry="5"
          fill="#60a5fa"
          opacity={0.2 + glowIntensity * 0.3}
          className="transition-opacity duration-300"
        />
      )}
    </g>
  );
}

/**
 * Silicon Source: simple source node
 */
export function SiliconSourceBuilding({ utilization, isStarved, isConstrained, width = 60, height = 40 }: BuildingSpriteProps) {
  return (
    <g>
      <circle
        cx={width / 2}
        cy={height / 2}
        r={width / 2 - 2}
        fill="#1e293b"
        stroke="#a78bfa"
        strokeWidth="2"
        opacity={0.9}
      />
      <text
        x={width / 2}
        y={height / 2 + 4}
        textAnchor="middle"
        className="text-[10px] fill-purple-300 font-semibold"
      >
        Si
      </text>
    </g>
  );
}

/**
 * Steel Source: simple source node
 */
export function SteelSourceBuilding({ utilization, isStarved, isConstrained, width = 60, height = 40 }: BuildingSpriteProps) {
  return (
    <g>
      <circle
        cx={width / 2}
        cy={height / 2}
        r={width / 2 - 2}
        fill="#1e293b"
        stroke="#cbd5e1"
        strokeWidth="2"
        opacity={0.9}
      />
      <text
        x={width / 2}
        y={height / 2 + 4}
        textAnchor="middle"
        className="text-[10px] fill-slate-300 font-semibold"
      >
        Fe
      </text>
    </g>
  );
}

