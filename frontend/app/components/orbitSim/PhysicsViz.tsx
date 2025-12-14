"use client";

import React, { useMemo } from 'react';

/**
 * Physics Sandbox Visualizations
 * Minimal SVG graphics that respond to slider values
 */

// ============================================================================
// THERMAL VISUALIZATION - Radiator Panels
// ============================================================================

export const ThermalViz = ({ 
  radiatorArea = 80,        // m² (20-200)
  utilization = 0.5,        // 0-1
  tempC = 20,               // -20 to 60
}: {
  radiatorArea?: number;
  utilization?: number;
  tempC?: number;
}) => {
  // Scale radiator size based on area
  const scale = 0.3 + (radiatorArea / 200) * 0.7; // 0.3 to 1.0
  const panelCount = Math.ceil(radiatorArea / 25); // 1-8 panels
  
  // Color based on utilization (green → yellow → orange → red)
  const getHeatColor = (util: number) => {
    if (util < 0.5) return '#10b981';      // Green - cool
    if (util < 0.7) return '#84cc16';      // Lime
    if (util < 0.85) return '#f59e0b';     // Orange - warm
    if (util < 0.95) return '#ef4444';     // Red - hot
    return '#dc2626';                       // Dark red - critical
  };
  
  const heatColor = getHeatColor(utilization);
  const glowIntensity = Math.min(1, utilization * 1.2);
  
  return (
    <svg width="100%" height="120" viewBox="0 0 280 120" style={{ display: 'block' }}>
      <defs>
        {/* Heat glow filter */}
        <filter id="heatGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={3 * glowIntensity} result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        
        {/* Grid pattern for panels */}
        <pattern id="panelGrid" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M 8 0 L 0 0 0 8" fill="none" stroke="rgba(0,240,255,0.2)" strokeWidth="0.5" />
        </pattern>
      </defs>
      
      {/* Central satellite body */}
      <g transform="translate(140, 60)">
        {/* Core body */}
        <rect 
          x="-15" y="-15" 
          width="30" height="30" 
          rx="4"
          fill="rgba(0,20,40,0.8)"
          stroke="#00f0ff"
          strokeWidth="1.5"
        />
        
        {/* Heat indicator in core */}
        <circle 
          cx="0" cy="0" r="8"
          fill={heatColor}
          opacity={0.3 + utilization * 0.5}
          filter="url(#heatGlow)"
        />
        <circle 
          cx="0" cy="0" r="4"
          fill={heatColor}
        />
        
        {/* Radiator panels - left side */}
        {[...Array(Math.min(4, panelCount))].map((_, i) => {
          const panelWidth = 35 * scale;
          const panelHeight = 20 + i * 3;
          const xOffset = -20 - panelWidth - (i * 8 * scale);
          const yOffset = -panelHeight / 2;
          
          return (
            <g key={`left-${i}`} style={{ 
              transition: 'all 0.5s ease',
              opacity: 0.6 + (i / panelCount) * 0.4,
            }}>
              {/* Panel structure */}
              <rect
                x={xOffset}
                y={yOffset}
                width={panelWidth}
                height={panelHeight}
                rx="2"
                fill="url(#panelGrid)"
                stroke={heatColor}
                strokeWidth="1"
                style={{
                  filter: utilization > 0.7 ? 'url(#heatGlow)' : 'none',
                  transition: 'stroke 0.3s ease',
                }}
              />
              {/* Panel spine */}
              <line
                x1={xOffset + panelWidth / 2}
                y1={yOffset}
                x2={xOffset + panelWidth / 2}
                y2={yOffset + panelHeight}
                stroke="rgba(0,240,255,0.5)"
                strokeWidth="1"
              />
              {/* Connection arm */}
              <line
                x1="-15"
                y1="0"
                x2={xOffset + panelWidth}
                y2="0"
                stroke="rgba(0,240,255,0.3)"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            </g>
          );
        })}
        
        {/* Radiator panels - right side (mirror) */}
        {[...Array(Math.min(4, panelCount))].map((_, i) => {
          const panelWidth = 35 * scale;
          const panelHeight = 20 + i * 3;
          const xOffset = 20 + (i * 8 * scale);
          const yOffset = -panelHeight / 2;
          
          return (
            <g key={`right-${i}`} style={{ 
              transition: 'all 0.5s ease',
              opacity: 0.6 + (i / panelCount) * 0.4,
            }}>
              <rect
                x={xOffset}
                y={yOffset}
                width={panelWidth}
                height={panelHeight}
                rx="2"
                fill="url(#panelGrid)"
                stroke={heatColor}
                strokeWidth="1"
                style={{
                  filter: utilization > 0.7 ? 'url(#heatGlow)' : 'none',
                  transition: 'stroke 0.3s ease',
                }}
              />
              <line
                x1={xOffset + panelWidth / 2}
                y1={yOffset}
                x2={xOffset + panelWidth / 2}
                y2={yOffset + panelHeight}
                stroke="rgba(0,240,255,0.5)"
                strokeWidth="1"
              />
              <line
                x1="15"
                y1="0"
                x2={xOffset}
                y2="0"
                stroke="rgba(0,240,255,0.3)"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            </g>
          );
        })}
        
        {/* Heat radiation waves when hot */}
        {utilization > 0.6 && (
          <g opacity={utilization - 0.5}>
            {[0, 1, 2].map(i => (
              <ellipse
                key={i}
                cx="0"
                cy="0"
                rx={50 + i * 15}
                ry={30 + i * 10}
                fill="none"
                stroke={heatColor}
                strokeWidth="0.5"
                opacity={0.3 - i * 0.1}
                style={{
                  animation: `pulse ${2 + i * 0.5}s ease-in-out infinite`,
                }}
              />
            ))}
          </g>
        )}
      </g>
      
      {/* Temperature label */}
      <text x="140" y="110" textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="monospace">
        {tempC}°C · {(utilization * 100).toFixed(0)}% utilized
      </text>
    </svg>
  );
};

// ============================================================================
// BACKHAUL VISUALIZATION - Laser Links
// ============================================================================

export const BackhaulViz = ({
  opticalTerminals = 4,     // 1-8
  linkCapacity = 100,       // 10-200 Gbps
  groundStations = 60,      // 20-150
  utilization = 0.5,        // 0-1
}: {
  opticalTerminals?: number;
  linkCapacity?: number;
  groundStations?: number;
  utilization?: number;
}) => {
  const beamCount = opticalTerminals;
  const beamThickness = 1 + (linkCapacity / 200) * 2; // 1-3px
  const stationCount = Math.min(7, Math.ceil(groundStations / 20)); // 1-7 visible
  
  // Beam color based on utilization
  const beamColor = utilization > 0.9 ? '#ef4444' : utilization > 0.7 ? '#f59e0b' : '#00f0ff';
  const beamOpacity = 0.4 + utilization * 0.4;
  
  // Station positions (curved along bottom)
  const stations = useMemo(() => {
    return [...Array(stationCount)].map((_, i) => {
      const t = (i + 0.5) / stationCount;
      const x = 40 + t * 200;
      const y = 100 + Math.sin(t * Math.PI) * -10;
      return { x, y };
    });
  }, [stationCount]);
  
  return (
    <svg width="100%" height="120" viewBox="0 0 280 120" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="beamGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={beamColor} stopOpacity={beamOpacity} />
          <stop offset="100%" stopColor={beamColor} stopOpacity={beamOpacity * 0.3} />
        </linearGradient>
        
        <filter id="beamGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        
        {/* Data packet animation */}
        <circle id="dataPacket" r="2" fill="#00f0ff" />
      </defs>
      
      {/* Satellite */}
      <g transform="translate(140, 35)">
        {/* Body */}
        <rect x="-12" y="-10" width="24" height="20" rx="3" 
          fill="rgba(0,20,40,0.8)" stroke="#00f0ff" strokeWidth="1.5" />
        
        {/* Solar panels */}
        <rect x="-45" y="-5" width="30" height="10" rx="2"
          fill="none" stroke="#00f0ff" strokeWidth="1" opacity="0.6" />
        <rect x="15" y="-5" width="30" height="10" rx="2"
          fill="none" stroke="#00f0ff" strokeWidth="1" opacity="0.6" />
        
        {/* Optical terminals (small circles on bottom) */}
        {[...Array(beamCount)].map((_, i) => {
          const angle = ((i - (beamCount - 1) / 2) / Math.max(1, beamCount - 1)) * 0.8;
          const x = Math.sin(angle) * 10;
          return (
            <circle
              key={i}
              cx={x}
              cy="12"
              r="2"
              fill={beamColor}
              style={{
                filter: 'url(#beamGlow)',
                animation: `pulse ${1.5 + i * 0.2}s ease-in-out infinite`,
              }}
            />
          );
        })}
      </g>
      
      {/* Laser beams to ground */}
      {stations.slice(0, beamCount).map((station, i) => {
        const satX = 140 + ((i - (beamCount - 1) / 2) / Math.max(1, beamCount - 1)) * 15;
        const satY = 47;
        
        return (
          <g key={i}>
            {/* Main beam */}
            <line
              x1={satX}
              y1={satY}
              x2={station.x}
              y2={station.y}
              stroke="url(#beamGradient)"
              strokeWidth={beamThickness}
              style={{
                filter: utilization > 0.5 ? 'url(#beamGlow)' : 'none',
              }}
            />
            
            {/* Data packet animation along beam */}
            <circle r="2" fill="#00f0ff" opacity="0.8">
              <animateMotion
                dur={`${1.5 + Math.random()}s`}
                repeatCount="indefinite"
                path={`M${satX},${satY} L${station.x},${station.y}`}
              />
            </circle>
          </g>
        );
      })}
      
      {/* Ground stations */}
      {stations.map((station, i) => {
        const isActive = i < beamCount;
        return (
          <g key={i} transform={`translate(${station.x}, ${station.y})`}>
            {/* Station dish */}
            <path
              d="M-6,0 Q0,-8 6,0"
              fill="none"
              stroke={isActive ? '#00f0ff' : '#334155'}
              strokeWidth="1.5"
              opacity={isActive ? 1 : 0.4}
            />
            {/* Base */}
            <line x1="0" y1="0" x2="0" y2="6" stroke={isActive ? '#00f0ff' : '#334155'} strokeWidth="1" opacity={isActive ? 1 : 0.4} />
            {/* Ground */}
            <line x1="-4" y1="6" x2="4" y2="6" stroke={isActive ? '#00f0ff' : '#334155'} strokeWidth="1" opacity={isActive ? 1 : 0.4} />
            
            {/* Active indicator */}
            {isActive && (
              <circle cy="-4" r="1.5" fill={beamColor} style={{ animation: 'pulse 1s ease-in-out infinite' }} />
            )}
          </g>
        );
      })}
      
      {/* Capacity label */}
      <text x="140" y="115" textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="monospace">
        {opticalTerminals}× {linkCapacity} Gbps · {groundStations} stations
      </text>
    </svg>
  );
};

// ============================================================================
// MAINTENANCE VISUALIZATION - Fleet & Drones
// ============================================================================

export const MaintenanceViz = ({
  fleetSize = 5000,         // 1000-10000
  failureRate = 3,          // 0.5-10%
  servicerDrones = 40,      // 0-100
  survivalRate = 0.94,      // 0-1
}: {
  fleetSize?: number;
  failureRate?: number;
  servicerDrones?: number;
  survivalRate?: number;
}) => {
  // Show representative satellites (not all 5000!)
  const displaySats = Math.min(24, Math.ceil(fleetSize / 400));
  const displayDrones = Math.min(5, Math.ceil(servicerDrones / 20));
  const deadSats = Math.floor(displaySats * (1 - survivalRate) * 2); // Exaggerate for visibility
  
  // Generate satellite positions in orbital arc
  const satellites = useMemo(() => {
    return [...Array(displaySats)].map((_, i) => {
      const angle = (i / displaySats) * Math.PI + Math.PI;
      const radius = 40;
      const x = 140 + Math.cos(angle) * radius * 2.5;
      const y = 55 + Math.sin(angle) * radius;
      const isDead = i < deadSats;
      return { x, y, isDead, angle };
    });
  }, [displaySats, deadSats]);
  
  // Drone positions
  const drones = useMemo(() => {
    return [...Array(displayDrones)].map((_, i) => {
      const sat = satellites[Math.floor(Math.random() * satellites.length)];
      return {
        x: sat.x + (Math.random() - 0.5) * 30,
        y: sat.y + (Math.random() - 0.5) * 20,
        targetX: sat.x,
        targetY: sat.y,
      };
    });
  }, [displayDrones, satellites]);
  
  return (
    <svg width="100%" height="120" viewBox="0 0 280 120" style={{ display: 'block' }}>
      <defs>
        <filter id="deadGlow">
          <feGaussianBlur stdDeviation="2" />
          <feColorMatrix values="1 0 0 0 0  0 0.2 0 0 0  0 0 0.2 0 0  0 0 0 1 0" />
        </filter>
      </defs>
      
      {/* Orbital path */}
      <ellipse
        cx="140" cy="55"
        rx="100" ry="40"
        fill="none"
        stroke="rgba(0,240,255,0.1)"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      
      {/* Earth (partial arc at bottom) */}
      <path
        d="M 40,120 Q 140,85 240,120"
        fill="none"
        stroke="rgba(0,240,255,0.15)"
        strokeWidth="40"
      />
      <path
        d="M 40,120 Q 140,90 240,120"
        fill="none"
        stroke="rgba(16,185,129,0.1)"
        strokeWidth="2"
      />
      
      {/* Satellites */}
      {satellites.map((sat, i) => (
        <g 
          key={i} 
          transform={`translate(${sat.x}, ${sat.y})`}
          style={{
            transition: 'opacity 0.5s ease',
            opacity: sat.isDead ? 0.3 : 1,
          }}
        >
          {/* Satellite body */}
          <rect
            x="-3" y="-2"
            width="6" height="4"
            rx="1"
            fill={sat.isDead ? '#64748b' : 'rgba(0,20,40,0.9)'}
            stroke={sat.isDead ? '#ef4444' : '#00f0ff'}
            strokeWidth="0.75"
            style={{
              filter: sat.isDead ? 'url(#deadGlow)' : 'none',
            }}
          />
          {/* Solar panels */}
          <line x1="-7" y1="0" x2="-3" y2="0" stroke={sat.isDead ? '#64748b' : '#00f0ff'} strokeWidth="0.75" />
          <line x1="3" y1="0" x2="7" y2="0" stroke={sat.isDead ? '#64748b' : '#00f0ff'} strokeWidth="0.75" />
          
          {/* Dead indicator */}
          {sat.isDead && (
            <text x="0" y="-5" textAnchor="middle" fill="#ef4444" fontSize="6">✕</text>
          )}
        </g>
      ))}
      
      {/* Service drones */}
      {drones.map((drone, i) => (
        <g key={i}>
          {/* Drone path */}
          <line
            x1={drone.x} y1={drone.y}
            x2={drone.targetX} y2={drone.targetY}
            stroke="rgba(250,204,21,0.3)"
            strokeWidth="0.5"
            strokeDasharray="2 2"
          />
          
          {/* Drone */}
          <g 
            transform={`translate(${drone.x}, ${drone.y})`}
            style={{
              animation: `float ${2 + i * 0.3}s ease-in-out infinite`,
            }}
          >
            <circle r="3" fill="rgba(250,204,21,0.2)" />
            <circle r="1.5" fill="#facc15" />
            {/* Propulsion glow */}
            <circle r="2" fill="none" stroke="#facc15" strokeWidth="0.5" opacity="0.5">
              <animate attributeName="r" values="2;4;2" dur="1s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.5;0;0.5" dur="1s" repeatCount="indefinite" />
            </circle>
          </g>
        </g>
      ))}
      
      {/* Stats label */}
      <text x="140" y="115" textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="monospace">
        {fleetSize.toLocaleString()} sats · {servicerDrones} drones · {(survivalRate * 100).toFixed(0)}% survival
      </text>
      
      {/* Keyframe for float animation */}
      <style>
        {`
          @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-3px); }
          }
        `}
      </style>
    </svg>
  );
};

// ============================================================================
// COST VISUALIZATION - Launch Vehicle
// ============================================================================

export const CostViz = ({
  launchCostPerKg = 100,    // 20-500 $/kg
  launchesPerYear = 24,     // 6-52
  satsPerLaunch = 40,       // 10-100
  massPerSat = 3000,        // calculated
}: {
  launchCostPerKg?: number;
  launchesPerYear?: number;
  satsPerLaunch?: number;
  massPerSat?: number;
}) => {
  // Rocket size based on launch frequency
  const rocketScale = 0.6 + (launchesPerYear / 52) * 0.4;
  
  // Payload visualization
  const payloadRows = Math.min(4, Math.ceil(satsPerLaunch / 25));
  const payloadCols = Math.min(6, Math.ceil(satsPerLaunch / payloadRows / 4));
  
  // Cost color (green = cheap, red = expensive)
  const costRatio = (launchCostPerKg - 20) / (500 - 20);
  const costColor = costRatio < 0.3 ? '#10b981' : costRatio < 0.6 ? '#f59e0b' : '#ef4444';
  
  return (
    <svg width="100%" height="120" viewBox="0 0 280 120" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="rocketBody" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        
        <linearGradient id="flameGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="50%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
        </linearGradient>
        
        <filter id="flameGlow">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      
      {/* Launch pad */}
      <rect x="50" y="105" width="80" height="4" rx="2" fill="#334155" />
      <rect x="70" y="95" width="5" height="14" fill="#475569" />
      <rect x="105" y="95" width="5" height="14" fill="#475569" />
      
      {/* Rocket */}
      <g transform={`translate(90, ${105 - 60 * rocketScale}) scale(${rocketScale})`}>
        {/* Flame */}
        <ellipse 
          cx="0" cy="65" 
          rx="8" ry="20"
          fill="url(#flameGradient)"
          style={{
            filter: 'url(#flameGlow)',
            animation: 'flicker 0.15s ease-in-out infinite',
          }}
        />
        
        {/* Body */}
        <path
          d="M-12,60 L-12,20 Q-12,0 0,-10 Q12,0 12,20 L12,60 Z"
          fill="url(#rocketBody)"
          stroke="#00f0ff"
          strokeWidth="1"
        />
        
        {/* Fins */}
        <path d="M-12,50 L-22,65 L-12,60 Z" fill="#1e293b" stroke="#00f0ff" strokeWidth="0.5" />
        <path d="M12,50 L22,65 L12,60 Z" fill="#1e293b" stroke="#00f0ff" strokeWidth="0.5" />
        
        {/* Payload section (window) */}
        <rect x="-8" y="10" width="16" height="25" rx="2" fill="rgba(0,240,255,0.1)" stroke="#00f0ff" strokeWidth="0.5" />
        
        {/* Satellites in payload bay */}
        {[...Array(payloadRows)].map((_, row) => (
          [...Array(payloadCols)].map((_, col) => (
            <rect
              key={`${row}-${col}`}
              x={-6 + col * 3}
              y={12 + row * 5}
              width="2"
              height="3"
              rx="0.5"
              fill="#00f0ff"
              opacity={0.6}
            />
          ))
        ))}
        
        {/* SpaceX-style grid fins */}
        <rect x="-15" y="15" width="3" height="8" rx="0.5" fill="#475569" />
        <rect x="12" y="15" width="3" height="8" rx="0.5" fill="#475569" />
      </g>
      
      {/* Cost indicator */}
      <g transform="translate(180, 30)">
        <text x="0" y="0" fill="#64748b" fontSize="10" fontFamily="monospace">COST/KG</text>
        <text x="0" y="18" fill={costColor} fontSize="16" fontWeight="bold" fontFamily="monospace">
          ${launchCostPerKg}
        </text>
        
        {/* Cost bar */}
        <rect x="0" y="26" width="70" height="4" rx="2" fill="rgba(255,255,255,0.1)" />
        <rect 
          x="0" y="26" 
          width={70 * (1 - costRatio)} 
          height="4" 
          rx="2" 
          fill={costColor}
          style={{ transition: 'width 0.3s ease' }}
        />
        <text x="0" y="44" fill="#64748b" fontSize="7" fontFamily="monospace">CHEAPER</text>
        <text x="70" y="44" fill="#64748b" fontSize="7" fontFamily="monospace" textAnchor="end">PRICIER</text>
      </g>
      
      {/* Launch frequency */}
      <g transform="translate(180, 75)">
        <text x="0" y="0" fill="#64748b" fontSize="10" fontFamily="monospace">LAUNCHES/YR</text>
        <text x="0" y="18" fill="#00f0ff" fontSize="16" fontWeight="bold" fontFamily="monospace">
          {launchesPerYear}
        </text>
        <text x="40" y="18" fill="#64748b" fontSize="10" fontFamily="monospace">
          × {satsPerLaunch} sats
        </text>
      </g>
      
      {/* Flame flicker animation */}
      <style>
        {`
          @keyframes flicker {
            0%, 100% { transform: scaleY(1); opacity: 0.9; }
            50% { transform: scaleY(0.9); opacity: 1; }
          }
        `}
      </style>
    </svg>
  );
};
