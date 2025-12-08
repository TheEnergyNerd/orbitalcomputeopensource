"use client";

import type { Tier } from "../../lib/orbitSim/orbitSimState";

interface FactoryModuleProps {
  stageId: 'silicon' | 'chips' | 'racks' | 'pods';
  tier: Tier;
  isBottleneck?: boolean;
}

/**
 * FactoryModule - SVG-based factory stage icons with animations
 */
export default function FactoryModule({ stageId, tier, isBottleneck }: FactoryModuleProps) {
  const size = 64; // Larger, more visible
  
  // Color-coded borders with glow effect
  const borderColor = 
    tier === 3 ? '#FFD700' : // gold
    tier === 2 ? '#3B82F6' : // blue
    '#6B7280'; // grey
  
  const borderGlow = 
    tier === 3 ? 'drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]' :
    tier === 2 ? 'drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]' :
    '';
  
  const baseClasses = `relative transition-all duration-300 ${borderGlow}`;
  const animationClass = 
    stageId === 'silicon' ? 'animate-pulse' :
    stageId === 'chips' ? '' : // scanning beam handled in SVG
    stageId === 'racks' ? 'animate-spin-slow' :
    'animate-spin-slow'; // pods orbit rotation
  
  return (
    <div className={baseClasses} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className={animationClass}
        style={{ animationDuration: stageId === 'racks' || stageId === 'pods' ? '3s' : '2s' }}
      >
        {/* Outer glow for tier 2/3 */}
        {tier >= 2 && (
          <rect
            x="3"
            y="3"
            width="94"
            height="94"
            rx="10"
            fill="none"
            stroke={borderColor}
            strokeWidth="1"
            opacity="0.3"
            className={isBottleneck ? 'animate-pulse' : ''}
          />
        )}
        
        {/* Border */}
        <rect
          x="5"
          y="5"
          width="90"
          height="90"
          rx="8"
          fill="none"
          stroke={borderColor}
          strokeWidth={tier >= 2 ? "4" : "3"}
          className={isBottleneck ? 'animate-pulse' : ''}
        />
        
        {/* Background gradient */}
        <defs>
          <linearGradient id={`grad-${stageId}-${tier}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={tier >= 2 ? "#1F2937" : "#111827"} stopOpacity="0.8" />
            <stop offset="100%" stopColor={tier >= 2 ? "#374151" : "#1F2937"} stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <rect
          x="8"
          y="8"
          width="84"
          height="84"
          rx="6"
          fill={`url(#grad-${stageId}-${tier})`}
        />
        
        {/* Stage-specific icon */}
        {stageId === 'silicon' && (
          <>
            {/* Quartz crucible with glow */}
            <ellipse cx="50" cy="60" rx="25" ry="15" fill="#4B5563" opacity="0.7" />
            <ellipse cx="50" cy="60" rx="23" ry="13" fill="#60A5FA" opacity="0.2">
              <animate attributeName="opacity" values="0.2;0.4;0.2" dur="2s" repeatCount="indefinite" />
            </ellipse>
            <path d="M 35 60 L 35 75 L 65 75 L 65 60" fill="#6B7280" />
            {/* Glowing ingot with stronger glow */}
            <rect x="45" y="30" width="10" height="30" rx="2" fill="#60A5FA" opacity="0.9">
              <animate attributeName="opacity" values="0.9;1;0.9" dur="1.5s" repeatCount="indefinite" />
            </rect>
            <rect x="44" y="29" width="12" height="32" rx="2" fill="#93C5FD" opacity="0.3">
              <animate attributeName="opacity" values="0.3;0.5;0.3" dur="1.5s" repeatCount="indefinite" />
            </rect>
            {/* Extrusion shape */}
            <rect x="47" y="25" width="6" height="8" rx="1" fill="#93C5FD" />
            {/* Heat waves */}
            <path d="M 40 35 Q 45 30 50 35 T 60 35" stroke="#3B82F6" strokeWidth="1" fill="none" opacity="0.4">
              <animate attributeName="opacity" values="0.4;0.6;0.4" dur="1s" repeatCount="indefinite" />
            </path>
          </>
        )}
        
        {stageId === 'chips' && (
          <>
            {/* Wafer with glow */}
            <circle cx="50" cy="50" r="30" fill="#1F2937" stroke="#4B5563" strokeWidth="2" />
            <circle cx="50" cy="50" r="28" fill="#3B82F6" opacity="0.1">
              <animate attributeName="opacity" values="0.1;0.2;0.1" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="50" cy="50" r="20" fill="#374151" />
            {/* Lithography head with glow */}
            <rect x="40" y="20" width="20" height="8" rx="2" fill="#60A5FA" />
            <rect x="41" y="21" width="18" height="6" rx="1" fill="#93C5FD" opacity="0.5">
              <animate attributeName="opacity" values="0.5;0.8;0.5" dur="1s" repeatCount="indefinite" />
            </rect>
            {/* Scanning beam with stronger effect */}
            <line x1="50" y1="20" x2="50" y2="50" stroke="#3B82F6" strokeWidth="3" opacity="0.8">
              <animate attributeName="opacity" values="0.8;1;0.8" dur="1.5s" repeatCount="indefinite" />
            </line>
            <line x1="50" y1="20" x2="50" y2="50" stroke="#60A5FA" strokeWidth="1" opacity="0.4">
              <animate attributeName="opacity" values="0.4;0.6;0.4" dur="1.5s" repeatCount="indefinite" />
            </line>
            {/* Circuit pattern with more detail */}
            <path d="M 35 45 L 45 45 L 45 50 L 55 50 L 55 45 L 65 45" stroke="#9CA3AF" strokeWidth="1.5" fill="none" />
            <path d="M 40 40 L 40 60 M 50 40 L 50 60 M 60 40 L 60 60" stroke="#6B7280" strokeWidth="1" fill="none" opacity="0.6" />
          </>
        )}
        
        {stageId === 'racks' && (
          <>
            {/* Server rack silhouette with glow */}
            <rect x="30" y="20" width="40" height="60" rx="2" fill="#1F2937" stroke="#4B5563" strokeWidth="2" />
            <rect x="28" y="18" width="44" height="64" rx="2" fill="#3B82F6" opacity="0.1">
              <animate attributeName="opacity" values="0.1;0.15;0.1" dur="2s" repeatCount="indefinite" />
            </rect>
            {/* Rack units with status LEDs */}
            {[0, 1, 2, 3, 4].map(i => (
              <g key={i}>
                <rect x="32" y={22 + i * 12} width="36" height="10" fill="#374151" />
                <rect x="34" y={24 + i * 12} width="32" height="6" fill="#1F2937" />
                {/* Status LED */}
                <circle cx="66" cy={27 + i * 12} r="2" fill="#10B981" opacity="0.8">
                  <animate attributeName="opacity" values="0.8;1;0.8" dur={`${1 + i * 0.2}s`} repeatCount="indefinite" />
                </circle>
              </g>
            ))}
            {/* Fans with motion blur effect */}
            <circle cx="70" cy="35" r="5" fill="#60A5FA" opacity="0.5">
              <animateTransform
                attributeName="transform"
                type="rotate"
                values="0 70 35;360 70 35"
                dur="0.8s"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="70" cy="35" r="3" fill="#93C5FD" opacity="0.8">
              <animateTransform
                attributeName="transform"
                type="rotate"
                values="0 70 35;360 70 35"
                dur="0.8s"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="70" cy="55" r="5" fill="#60A5FA" opacity="0.5">
              <animateTransform
                attributeName="transform"
                type="rotate"
                values="0 70 55;360 70 55"
                dur="0.8s"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="70" cy="55" r="3" fill="#93C5FD" opacity="0.8">
              <animateTransform
                attributeName="transform"
                type="rotate"
                values="0 70 55;360 70 55"
                dur="0.8s"
                repeatCount="indefinite"
              />
            </circle>
          </>
        )}
        
        {stageId === 'pods' && (
          <>
            {/* Satellite module with glow */}
            <rect x="35" y="40" width="30" height="20" rx="3" fill="#1F2937" stroke="#4B5563" strokeWidth="2" />
            <rect x="33" y="38" width="34" height="24" rx="3" fill="#3B82F6" opacity="0.15">
              <animate attributeName="opacity" values="0.15;0.2;0.15" dur="2s" repeatCount="indefinite" />
            </rect>
            {/* Internal components */}
            <rect x="38" y="43" width="24" height="14" rx="1" fill="#374151" />
            <circle cx="45" cy="50" r="2" fill="#10B981" opacity="0.8">
              <animate attributeName="opacity" values="0.8;1;0.8" dur="1.5s" repeatCount="indefinite" />
            </circle>
            <circle cx="55" cy="50" r="2" fill="#10B981" opacity="0.8">
              <animate attributeName="opacity" values="0.8;1;0.8" dur="1.5s" repeatCount="indefinite" />
            </circle>
            {/* Solar panels with enhanced glow */}
            <rect x="25" y="45" width="8" height="10" rx="1" fill="#FCD34D" opacity="0.9">
              <animateTransform
                attributeName="transform"
                type="rotate"
                values="0 29 50;-15 29 50;0 29 50"
                dur="4s"
                repeatCount="indefinite"
              />
            </rect>
            <rect x="24" y="44" width="10" height="12" rx="1" fill="#FCD34D" opacity="0.3">
              <animateTransform
                attributeName="transform"
                type="rotate"
                values="0 29 50;-15 29 50;0 29 50"
                dur="4s"
                repeatCount="indefinite"
              />
            </rect>
            <rect x="67" y="45" width="8" height="10" rx="1" fill="#FCD34D" opacity="0.9">
              <animateTransform
                attributeName="transform"
                type="rotate"
                values="0 71 50;15 71 50;0 71 50"
                dur="4s"
                repeatCount="indefinite"
              />
            </rect>
            <rect x="66" y="44" width="10" height="12" rx="1" fill="#FCD34D" opacity="0.3">
              <animateTransform
                attributeName="transform"
                type="rotate"
                values="0 71 50;15 71 50;0 71 50"
                dur="4s"
                repeatCount="indefinite"
              />
            </rect>
            {/* Antenna with signal waves */}
            <line x1="50" y1="40" x2="50" y2="30" stroke="#9CA3AF" strokeWidth="2" />
            <circle cx="50" cy="30" r="2" fill="#60A5FA" />
            <circle cx="50" cy="30" r="4" fill="#60A5FA" opacity="0.3">
              <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
            </circle>
          </>
        )}
      </svg>
    </div>
  );
}

