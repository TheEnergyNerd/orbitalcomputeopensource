"use client";

import { useState, useEffect } from "react";
import type { SurfaceType } from "./SurfaceTabs";
import { useOrbitSim } from "../state/orbitStore";

interface GlossaryItem {
  id: string;
  title: string;
  description: string;
  visual: React.ReactNode;
  color?: string;
}

interface VisualGlossaryProps {
  activeSurface?: SurfaceType;
}

export function VisualGlossary({ activeSurface }: VisualGlossaryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const showComputeRoutes = useOrbitSim((s) => s.showComputeRoutes);
  const setShowComputeRoutes = useOrbitSim((s) => s.setShowComputeRoutes);
  
  // Debug: Log when component renders (before early return)
  useEffect(() => {
    console.log('[VisualGlossary] Component rendered, activeSurface:', activeSurface, 'isOpen:', isOpen);
  }, [activeSurface, isOpen]);
  
  // Only show in world view tab
  if (activeSurface !== "world") {
    console.log('[VisualGlossary] Early return - activeSurface not world:', activeSurface);
    return null;
  }
  
  console.log('[VisualGlossary] Rendering button/panel for activeSurface:', activeSurface);

  const glossaryItems: GlossaryItem[] = [
    {
      id: "shapes-circles-squares",
      title: "Shapes: Circles vs Squares",
      description: "Circles (spheres) = Satellites in orbit. Squares = Ground sites (data centers in blue, launch sites in orange). Satellites move along orbital paths; ground sites are fixed on Earth's surface.",
      visual: (
        <div className="flex flex-col gap-2 items-center">
          <div className="flex gap-3">
            <div className="w-4 h-4 rounded-full bg-teal-400 shadow-lg"></div>
            <span className="text-xs text-gray-300">Circle = Satellite</span>
          </div>
          <div className="flex gap-3">
            <div className="w-4 h-4 bg-blue-500"></div>
            <span className="text-xs text-gray-300">Square = Ground Site</span>
          </div>
        </div>
      ),
    },
    {
      id: "ground-site-colors",
      title: "Ground Site Colors",
      description: "Blue spheres = Data centers (compute facilities on Earth). Orange spheres = Launch sites (rocket launch facilities). Both are fixed on Earth's surface and don't move like satellites.",
      visual: (
        <div className="flex flex-col gap-2 items-center">
          <div className="flex gap-3 items-center">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-xs text-gray-300">Blue = Data Center</span>
          </div>
          <div className="flex gap-3 items-center">
            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
            <span className="text-xs text-gray-300">Orange = Launch Site</span>
          </div>
        </div>
      ),
    },
    {
      id: "class-a",
      title: "Class A Satellites",
      description: "Teal spheres. Low-latency networking & compute. Smaller size, dense mesh routing.",
      visual: (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-teal-400 shadow-lg shadow-teal-400/50"></div>
          <span className="text-xs text-gray-300">Teal sphere</span>
        </div>
      ),
      color: "#00d4aa",
    },
    {
      id: "class-b",
      title: "Class B Satellites",
      description: "White diamonds. High-power inference compute. Always sun-facing. SSO orbit (800-1000km).",
      visual: (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 transform rotate-45 bg-white shadow-lg shadow-cyan-400/70 border border-cyan-300/50"></div>
          <span className="text-xs text-gray-300">White diamond (sun-facing)</span>
        </div>
      ),
      color: "#ffffff",
    },
    {
      id: "route-lines",
      title: "Number of Route Lines",
      description: "Each route between satellites or ground stations is shown as a line. More routes = more lines visible. Square nodes appear along routes, representing intermediate relay points or data processing stations that route traffic between endpoints.",
      visual: (
        <div className="flex flex-col gap-2 items-center">
          <div className="flex items-center gap-2">
            <div className="w-16 h-0.5 bg-cyan-400"></div>
            <div className="w-2 h-2 bg-blue-500"></div>
            <div className="w-16 h-0.5 bg-cyan-400"></div>
          </div>
          <span className="text-xs text-gray-400">Route line → Square node → Route line</span>
        </div>
      ),
    },
    {
      id: "route-jitter",
      title: "Route Jitter",
      description: "Wavy/vibrating lines = high congestion. Smooth = low congestion. Only appears when congestion > 30%.",
      visual: (
        <div className="flex flex-col items-center gap-1">
          <svg width="100" height="30" className="text-cyan-400">
            <path
              d="M 0 15 Q 25 10, 50 15 T 100 15"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            <path
              d="M 0 15 Q 25 20, 50 15 T 100 15"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              opacity="0.6"
            />
          </svg>
          <span className="text-xs text-gray-400">Low → High congestion</span>
        </div>
      ),
    },
    {
      id: "route-particles",
      title: "Routing Particles",
      description: "Luminous packets move along routes. Size = traffic load (larger = more traffic). Speed = inverse latency. Spacing = congestion. Bunch up when congested.",
      visual: (
        <div className="flex flex-col items-center gap-1">
          <div className="flex gap-1 items-center">
            <div className="w-1 h-1 bg-cyan-400 rounded-full"></div>
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full"></div>
            <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
            <div className="w-2.5 h-2.5 bg-cyan-400 rounded-full"></div>
          </div>
          <span className="text-xs text-gray-400">Size = traffic load</span>
        </div>
      ),
    },
    {
      id: "route-color",
      title: "Route Colors",
      description: "Cyan = orbit-to-orbit, Green = ground-to-ground, Purple = core routing. Color intensity = traffic load.",
      visual: (
        <div className="flex gap-3">
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-2 bg-cyan-400 rounded"></div>
            <span className="text-xs text-gray-400">Orbit</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-2 bg-green-400 rounded"></div>
            <span className="text-xs text-gray-400">Ground</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-2 bg-purple-400 rounded"></div>
            <span className="text-xs text-gray-400">Core</span>
          </div>
        </div>
      ),
    },
    {
      id: "bidirectional",
      title: "Bidirectional Routes",
      description: "Data flows both ways: Ground ↔ Orbit. Arrows show direction of data packets.",
      visual: (
        <div className="flex items-center gap-2">
          <div className="flex gap-1 items-center">
            <span className="text-cyan-400 text-lg">→</span>
            <span className="text-gray-500 text-sm">↔</span>
            <span className="text-cyan-400 text-lg">←</span>
          </div>
          <span className="text-xs text-gray-300">Dual flow</span>
        </div>
      ),
    },
    {
      id: "shell-altitude",
      title: "Orbital Shells",
      description: "VLEO: 250-350km (smallest), LEO: 400-600km, SSO: 800-1000km (Class B), MEO: 10k-15k km (larger), GEO: 35,786km (largest).",
      visual: (
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">VLEO</span>
            <span className="text-gray-500">250-350 km</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">LEO</span>
            <span className="text-gray-500">400-600 km</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">SSO</span>
            <span className="text-gray-500">800-1000 km</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">MEO</span>
            <span className="text-gray-500">10,000-15,000 km</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">GEO</span>
            <span className="text-gray-500">35,786 km</span>
          </div>
        </div>
      ),
    },
    {
      id: "shell-pulse",
      title: "Annual Deployment Pulse",
      description: "Shell rings briefly expand 2-4px when year advances, then relax back (400ms decay).",
      visual: (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full border-2 border-teal-400"></div>
          <span className="text-xs text-gray-300">Pulse on year advance</span>
        </div>
      ),
    },
    {
      id: "world-tint",
      title: "Carbon World Tint",
      description: "Red tint = orbital compute worse than ground. Green-cyan tint = orbital better (after crossover). One-time change, no oscillation.",
      visual: (
        <div className="flex gap-2">
          <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500"></div>
          <span className="text-gray-400">→</span>
          <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500"></div>
        </div>
      ),
    },
    {
      id: "strategy-visuals",
      title: "Strategy Visual Cues",
      description: "COST: Yellow/green chart glow, shell contraction. LATENCY: Blue/white glow, faster routing. CARBON: Emerald glow, sun-facing highlights. BALANCED: Mixed, neutral.",
      visual: (
        <div className="flex flex-col gap-1 text-xs text-gray-400">
          <div>COST → Yellow/green</div>
          <div>LATENCY → Blue/white</div>
          <div>CARBON → Emerald</div>
          <div>BALANCED → Mixed</div>
        </div>
      ),
    },
  ];

  if (!isOpen) {
    return (
      <div className="fixed top-[180px] right-6 z-[100] flex flex-col gap-2 pointer-events-auto">
        <button
          onClick={() => {
            console.log('[VisualGlossary] Button clicked, opening glossary');
            setIsOpen(true);
          }}
          className="px-4 py-2.5 bg-gray-900/95 hover:bg-gray-800/95 border-2 border-cyan-500/50 rounded-lg text-sm font-semibold text-white transition-colors shadow-xl"
          style={{ 
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 12px rgba(0, 212, 255, 0.3)'
          }}
          aria-label="Open visual glossary"
        >
          📖 Visual Guide
        </button>
        <label className="px-4 py-2 bg-gray-900/95 hover:bg-gray-800/95 border-2 border-cyan-500/50 rounded-lg text-sm font-semibold text-white transition-colors shadow-xl cursor-pointer flex items-center gap-2"
          style={{ 
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 12px rgba(0, 212, 255, 0.3)'
          }}>
          <input
            type="checkbox"
            checked={showComputeRoutes}
            onChange={(e) => setShowComputeRoutes(e.target.checked)}
            className="w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500"
          />
          <span>Show AI Job Routing</span>
        </label>
      </div>
    );
  }

  return (
    <div className="fixed top-[180px] right-6 z-[100] w-96 max-w-[90vw] max-h-[85vh] overflow-y-auto panel-glass rounded-2xl p-5 shadow-2xl border border-white/10 pointer-events-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Visual Glossary</h2>
        <button
          onClick={() => {
            console.log('[VisualGlossary] Close button clicked');
            setIsOpen(false);
          }}
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="Close glossary"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-4">
        {glossaryItems.map((item) => (
          <div
            key={item.id}
            className="border-b border-gray-700 pb-4 last:border-b-0"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                {item.visual}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white mb-1">{item.title}</h3>
                <p className="text-xs text-gray-400 leading-relaxed">{item.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-700 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showComputeRoutes}
            onChange={(e) => setShowComputeRoutes(e.target.checked)}
            className="w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500"
          />
          <span className="text-sm text-white font-medium">Show AI Job Routing</span>
        </label>
        <p className="text-xs text-gray-500">
          All visual encodings are state-triggered and reflect actual simulation data. Effects activate based on year, strategy, and system state.
        </p>
      </div>
    </div>
  );
}
