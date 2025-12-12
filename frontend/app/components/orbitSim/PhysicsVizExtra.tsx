"use client";

import React, { useMemo } from 'react';

/**
 * Additional Physics Sandbox Visualizations
 * Compute/Silicon and Power/Solar sections
 */

// ============================================================================
// COMPUTE / SILICON VISUALIZATION - Chip Die
// ============================================================================

export const ComputeViz = ({
  processNode = 7,          // 3-14 nm
  chipTdp = 300,            // 100-500 W
  radiationHardening = 1,   // 0=soft, 1=standard, 2=full
  memoryPerNode = 128,      // 64-512 GB
  efficiency = 15,          // GFLOPS/W (calculated)
}: {
  processNode?: number;
  chipTdp?: number;
  radiationHardening?: number;
  memoryPerNode?: number;
  efficiency?: number;
}) => {
  // Chip size scales inversely with process node
  const chipScale = 0.7 + ((14 - processNode) / 11) * 0.3;
  
  // Core count based on TDP and process
  const coreCount = Math.floor((chipTdp / (processNode * 3)) * (processNode < 7 ? 1.5 : 1));
  const gridSize = Math.ceil(Math.sqrt(coreCount));
  
  // Heat color based on TDP
  const heatIntensity = (chipTdp - 100) / 400;
  const heatColor = heatIntensity > 0.7 ? '#ef4444' : heatIntensity > 0.4 ? '#f59e0b' : '#10b981';
  
  // Shielding visualization
  const shieldingLayers = radiationHardening + 1;
  
  // Memory stacks (HBM towers)
  const memoryStacks = Math.ceil(memoryPerNode / 64);
  
  return (
    <svg width="100%" height="120" viewBox="0 0 280 120" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="chipGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="50%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
        
        <linearGradient id="heatSpread" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={heatColor} stopOpacity="0.6" />
          <stop offset="50%" stopColor={heatColor} stopOpacity="0.2" />
          <stop offset="100%" stopColor={heatColor} stopOpacity="0" />
        </linearGradient>
        
        <filter id="chipGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        
        <pattern id="coreGrid" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="rgba(0,240,255,0.1)" rx="1" />
        </pattern>
      </defs>
      
      {/* Radiation shielding layers */}
      {[...Array(shieldingLayers)].map((_, i) => (
        <rect
          key={i}
          x={95 - i * 8}
          y={25 - i * 8}
          width={90 + i * 16}
          height={70 + i * 16}
          rx={4 + i * 2}
          fill="none"
          stroke={i === shieldingLayers - 1 ? '#64748b' : 'rgba(100,116,139,0.3)'}
          strokeWidth={1}
          strokeDasharray={i === 0 ? 'none' : '4 2'}
        />
      ))}
      
      {/* Main chip package */}
      <g transform={`translate(140, 60) scale(${chipScale})`}>
        {/* Substrate */}
        <rect
          x="-50" y="-35"
          width="100" height="70"
          rx="4"
          fill="url(#chipGradient)"
          stroke="#00f0ff"
          strokeWidth="1.5"
        />
        
        {/* Heat spread */}
        <rect
          x="-45" y="-30"
          width="90" height="60"
          rx="2"
          fill="url(#heatSpread)"
          style={{
            animation: chipTdp > 300 ? 'pulse 2s ease-in-out infinite' : 'none',
          }}
        />
        
        {/* Die area with cores */}
        <rect
          x="-35" y="-22"
          width="50" height="44"
          rx="2"
          fill="url(#coreGrid)"
          stroke="rgba(0,240,255,0.3)"
          strokeWidth="0.5"
        />
        
        {/* Individual cores lighting up */}
        {[...Array(Math.min(16, coreCount))].map((_, i) => {
          const row = Math.floor(i / 4);
          const col = i % 4;
          const isActive = i < coreCount * 0.8;
          return (
            <rect
              key={i}
              x={-32 + col * 12}
              y={-19 + row * 10}
              width="10"
              height="8"
              rx="1"
              fill={isActive ? heatColor : 'rgba(0,240,255,0.1)'}
              opacity={isActive ? 0.4 + Math.random() * 0.3 : 0.2}
              style={{
                animation: isActive ? `flicker ${0.5 + Math.random()}s ease-in-out infinite` : 'none',
              }}
            />
          );
        })}
        
        {/* HBM Memory stacks */}
        {[...Array(Math.min(4, memoryStacks))].map((_, i) => (
          <g key={i} transform={`translate(${22 + (i % 2) * 14}, ${-18 + Math.floor(i / 2) * 24})`}>
            {/* Memory stack (3D effect) */}
            {[...Array(4)].map((_, layer) => (
              <rect
                key={layer}
                x={-layer * 0.5}
                y={-layer * 2}
                width="10"
                height="16"
                rx="1"
                fill={layer === 0 ? 'rgba(139,92,246,0.6)' : 'rgba(139,92,246,0.2)'}
                stroke="rgba(139,92,246,0.8)"
                strokeWidth="0.5"
              />
            ))}
            <text x="5" y="22" textAnchor="middle" fill="#8b5cf6" fontSize="6" fontFamily="monospace">
              HBM
            </text>
          </g>
        ))}
        
        {/* Interconnects */}
        <line x1="15" y1="-5" x2="20" y2="-5" stroke="#00f0ff" strokeWidth="0.5" opacity="0.5" />
        <line x1="15" y1="5" x2="20" y2="5" stroke="#00f0ff" strokeWidth="0.5" opacity="0.5" />
        
        {/* Process node label */}
        <text x="0" y="0" textAnchor="middle" fill="#00f0ff" fontSize="10" fontWeight="bold" fontFamily="monospace">
          {processNode}nm
        </text>
      </g>
      
      {/* Pin array (bottom) */}
      {[...Array(12)].map((_, i) => (
        <rect
          key={i}
          x={75 + i * 11}
          y="98"
          width="6"
          height="8"
          rx="1"
          fill="#475569"
        />
      ))}
      
      {/* Efficiency indicator */}
      <g transform="translate(230, 25)">
        <text fill="#64748b" fontSize="8" fontFamily="monospace">GFLOPS/W</text>
        <text y="14" fill="#00f0ff" fontSize="14" fontWeight="bold" fontFamily="monospace">
          {efficiency.toFixed(1)}
        </text>
      </g>
      
      {/* Hardening indicator */}
      <g transform="translate(230, 60)">
        <text fill="#64748b" fontSize="8" fontFamily="monospace">HARDENING</text>
        <text y="14" fill={radiationHardening === 2 ? '#10b981' : radiationHardening === 1 ? '#f59e0b' : '#ef4444'} 
              fontSize="10" fontWeight="bold" fontFamily="monospace">
          {['SOFT', 'STANDARD', 'FULL'][radiationHardening]}
        </text>
      </g>
      
      {/* Stats label */}
      <text x="140" y="115" textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="monospace">
        {coreCount} cores · {chipTdp}W TDP · {memoryPerNode}GB HBM
      </text>
      
      <style>
        {`
          @keyframes flicker {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.7; }
          }
        `}
      </style>
    </svg>
  );
};

// ============================================================================
// POWER / SOLAR VISUALIZATION - Solar Array with Battery
// ============================================================================

export const PowerViz = ({
  solarEfficiency = 32,     // 25-45%
  degradationRate = 1.5,    // 0.5-3% per year
  batteryBuffer = 30,       // 0-60 min
  powerMargin = 20,         // 10-30%
  batteryDensity = 250,     // 150-400 Wh/kg
  batteryCost = 150,        // 50-300 $/kWh
}: {
  solarEfficiency?: number;
  degradationRate?: number;
  batteryBuffer?: number;
  powerMargin?: number;
  batteryDensity?: number;
  batteryCost?: number;
}) => {
  // Solar panel fill based on efficiency
  const panelFill = solarEfficiency / 45;
  
  // Degradation visualization (years shown)
  const yearsToShow = 5;
  const degradedPanels = [...Array(yearsToShow)].map((_, i) => 
    Math.pow(1 - degradationRate / 100, i + 1)
  );
  
  // Battery size based on buffer
  const batteryScale = 0.5 + (batteryBuffer / 60) * 0.5;
  
  // Battery color based on density (higher = better = greener)
  const densityRatio = (batteryDensity - 150) / 250;
  const batteryColor = densityRatio > 0.6 ? '#10b981' : densityRatio > 0.3 ? '#f59e0b' : '#ef4444';
  
  return (
    <svg width="100%" height="120" viewBox="0 0 280 120" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="solarCell" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e40af" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1e40af" />
        </linearGradient>
        
        <linearGradient id="solarActive" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity={panelFill} />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity={panelFill * 0.5} />
        </linearGradient>
        
        <linearGradient id="batteryFill" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor={batteryColor} />
          <stop offset="100%" stopColor={batteryColor} stopOpacity="0.5" />
        </linearGradient>
        
        <filter id="sunGlow">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        
        <filter id="energyGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      
      {/* Sun */}
      <g transform="translate(40, 35)">
        {/* Glow */}
        <circle r="20" fill="#fbbf24" opacity="0.2" filter="url(#sunGlow)" />
        
        {/* Core */}
        <circle r="12" fill="#fbbf24" />
        <circle r="8" fill="#fde047" />
      </g>
      
      {/* Energy flow lines */}
      <g opacity="0.6">
        <path
          d="M 60,35 Q 90,35 110,45"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2"
          strokeDasharray="4 4"
          style={{ animation: 'energyFlow 1s linear infinite' }}
        />
        <path
          d="M 60,40 Q 95,45 115,55"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          style={{ animation: 'energyFlow 1.2s linear infinite' }}
        />
      </g>
      
      {/* Solar Panel Array */}
      <g transform="translate(140, 50)">
        {/* Main panel structure */}
        <rect
          x="-45" y="-25"
          width="90" height="50"
          rx="3"
          fill="url(#solarCell)"
          stroke="#00f0ff"
          strokeWidth="1"
        />
        
        {/* Active area overlay */}
        <rect
          x="-43" y="-23"
          width="86" height="46"
          rx="2"
          fill="url(#solarActive)"
        />
        
        {/* Cell grid */}
        {[...Array(6)].map((_, row) => (
          [...Array(8)].map((_, col) => (
            <rect
              key={`${row}-${col}`}
              x={-42 + col * 11}
              y={-22 + row * 8}
              width="9"
              height="6"
              rx="0.5"
              fill="none"
              stroke="rgba(0,0,0,0.3)"
              strokeWidth="0.5"
            />
          ))
        ))}
        
        {/* Efficiency indicator bar */}
        <rect x="-45" y="30" width="90" height="4" rx="2" fill="rgba(255,255,255,0.1)" />
        <rect 
          x="-45" y="30" 
          width={90 * (solarEfficiency / 45)} 
          height="4" 
          rx="2" 
          fill="#3b82f6"
          filter="url(#energyGlow)"
          style={{ transition: 'width 0.3s ease' }}
        />
        <text x="-45" y="44" fill="#64748b" fontSize="7" fontFamily="monospace">{solarEfficiency}% eff</text>
      </g>
      
      {/* Battery Pack */}
      <g transform={`translate(230, 55) scale(${batteryScale})`}>
        {/* Battery housing */}
        <rect
          x="-18" y="-30"
          width="36" height="55"
          rx="4"
          fill="rgba(0,20,40,0.8)"
          stroke={batteryColor}
          strokeWidth="1.5"
        />
        
        {/* Battery terminal */}
        <rect x="-6" y="-34" width="12" height="4" rx="1" fill="#475569" />
        
        {/* Charge level */}
        <rect
          x="-14" y={-26 + (1 - batteryBuffer/60) * 47}
          width="28"
          height={(batteryBuffer/60) * 47}
          rx="2"
          fill="url(#batteryFill)"
          style={{ transition: 'all 0.3s ease' }}
        />
        
        {/* Charge indicator lines */}
        {[...Array(4)].map((_, i) => (
          <line
            key={i}
            x1="-10" y1={-20 + i * 12}
            x2="10" y2={-20 + i * 12}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="0.5"
          />
        ))}
        
        {/* Lightning bolt */}
        <path
          d="M 2,-10 L -4,2 L 1,2 L -2,12 L 6,0 L 1,0 Z"
          fill={batteryColor}
          opacity="0.8"
        />
        
        {/* Buffer time */}
        <text x="0" y="35" textAnchor="middle" fill={batteryColor} fontSize="9" fontWeight="bold" fontFamily="monospace">
          {batteryBuffer}min
        </text>
      </g>
      
      {/* Degradation timeline (small) - visual only, no text */}
      <g transform="translate(85, 95)">
        <g transform="translate(0, 8)">
          {degradedPanels.map((level, i) => (
            <rect
              key={i}
              x={i * 14}
              y={10 - level * 10}
              width="10"
              height={level * 10}
              rx="1"
              fill={level > 0.9 ? '#3b82f6' : level > 0.8 ? '#f59e0b' : '#ef4444'}
              opacity={0.6}
            />
          ))}
        </g>
      </g>
      
      {/* Battery specs - removed text */}
      
      <style>
        {`
          @keyframes rayPulse {
            0%, 100% { opacity: 0.4; transform: scale(1); }
            50% { opacity: 0.8; transform: scale(1.1); }
          }
          @keyframes energyFlow {
            0% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: -16; }
          }
        `}
      </style>
    </svg>
  );
};

