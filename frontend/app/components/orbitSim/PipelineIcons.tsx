"use client";

import React from "react";
import type { StageId } from "../../lib/orbitSim/factoryTypes";

interface PipelineIconProps {
  stageId: StageId;
  className?: string;
  color?: string;
}

/**
 * SVG Icon Paths for Pipeline Stages
 * Returns the SVG path elements for embedding directly in SVG
 */
export function PipelineIconPaths({ stageId, color = "currentColor" }: { stageId: StageId; color?: string }) {
  switch (stageId) {
    case 'silicon':
      return (
        <g fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L3 7L12 12L21 7L12 2Z" />
          <path d="M3 7V17L12 22L21 17V7" />
          <path d="M12 12V22" />
          <circle cx="8" cy="10" r="1" fill={color} />
          <circle cx="16" cy="10" r="1" fill={color} />
        </g>
      );
    
    case 'chips':
      return (
        <g fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="7" y="7" width="10" height="10" rx="1" />
          <path d="M4 8H7M17 8H20M4 16H7M17 16H20M8 4V7M16 4V7M8 17V20M16 17V20" />
          <circle cx="10" cy="10" r="0.5" fill={color} />
          <circle cx="14" cy="10" r="0.5" fill={color} />
          <circle cx="10" cy="14" r="0.5" fill={color} />
          <circle cx="14" cy="14" r="0.5" fill={color} />
        </g>
      );
    
    case 'racks':
      return (
        <g fill="none" stroke={color} strokeWidth="1.5">
          <rect x="5" y="3" width="14" height="18" rx="1" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
          <line x1="6" y1="8" x2="18" y2="8" />
          <line x1="6" y1="13" x2="18" y2="13" />
          <line x1="6" y1="18" x2="18" y2="18" />
          <circle cx="7.5" cy="5.5" r="0.8" fill={color} />
          <circle cx="7.5" cy="10.5" r="0.8" fill={color} />
          <circle cx="7.5" cy="15.5" r="0.8" fill={color} />
        </g>
      );
    
    case 'pods':
      return (
        <g fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
          <rect x="6" y="8" width="12" height="8" rx="1" />
          <path d="M8 8V6C8 4.895 8.895 4 10 4H14C15.105 4 16 4.895 16 6V8" />
          <path d="M8 16V18C8 19.105 8.895 20 10 20H14C15.105 20 16 19.105 16 18V16" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <circle cx="10" cy="12" r="0.8" fill={color} />
          <circle cx="14" cy="12" r="0.8" fill={color} />
          <path d="M3 12L6 12M18 12L21 12" />
        </g>
      );
    
    case 'launch':
      return (
        <g fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" />
          <path d="M12 10V18" />
          <path d="M8 14L12 18L16 14" />
          <circle cx="12" cy="6" r="1" fill={color} />
        </g>
      );
    
    default:
      return null;
  }
}

/**
 * Standalone PipelineIcon component (for use outside SVG)
 */
export function PipelineIcon({ stageId, className = "w-5 h-5", color }: { stageId: StageId; className?: string; color?: string }) {
  const iconColor = color || "currentColor";
  
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <PipelineIconPaths stageId={stageId} color={iconColor} />
    </svg>
  );
}
