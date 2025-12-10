"use client";

import { useState } from "react";

interface GlossaryItem {
  id: string;
  title: string;
  description: string;
  visual: React.ReactNode;
  color?: string;
}

export function VisualGlossary() {
  const [isOpen, setIsOpen] = useState(false);

  const glossaryItems: GlossaryItem[] = [
    {
      id: "class-a",
      title: "Class A Satellites",
      description: "Teal circles. Low-latency networking & compute.",
      visual: (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-teal-400 shadow-lg shadow-teal-400/50"></div>
          <span className="text-xs text-gray-300">Teal sphere (small)</span>
        </div>
      ),
      color: "#00d4aa",
    },
    {
      id: "class-b",
      title: "Class B Satellites",
      description: "White diamonds. High-power compute, always sun-facing.",
      visual: (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 transform rotate-45 bg-white shadow-lg shadow-cyan-400/70 border border-cyan-300/50"></div>
          <span className="text-xs text-gray-300">White diamond (large)</span>
        </div>
      ),
      color: "#ffffff",
    },
    {
      id: "route-thickness",
      title: "Route Thickness",
      description: "Thicker = more traffic. Scales 10–500+ Mbps.",
      visual: (
        <div className="flex flex-col gap-1 items-center">
          <div className="h-0.5 bg-cyan-400 w-20 opacity-60"></div>
          <div className="h-1 bg-cyan-400 w-20 opacity-70"></div>
          <div className="h-2 bg-cyan-400 w-20 opacity-80"></div>
          <div className="h-3 bg-cyan-400 w-20 opacity-90"></div>
          <span className="text-xs text-gray-400 mt-1">10 → 500+ Mbps</span>
        </div>
      ),
    },
    {
      id: "route-jitter",
      title: "Route Jitter",
      description: "Wavy = high congestion. Smooth = low congestion.",
      visual: (
        <div className="flex flex-col items-center gap-1">
          <svg width="100" height="30" className="text-cyan-400">
            <path
              d="M 0 15 Q 25 10, 50 15 T 100 15"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              className="animate-pulse"
            />
            <path
              d="M 0 15 Q 25 20, 50 15 T 100 15"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              opacity="0.6"
              className="animate-pulse"
              style={{ animationDelay: "0.1s" }}
            />
          </svg>
          <span className="text-xs text-gray-400">Low → High congestion</span>
        </div>
      ),
    },
    {
      id: "route-speed",
      title: "Route Speed",
      description: "Faster particles = lower latency. Slower = higher latency.",
      visual: (
        <div className="flex flex-col items-center gap-1">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping"></div>
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping" style={{ animationDelay: "0.1s" }}></div>
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping" style={{ animationDelay: "0.2s" }}></div>
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping" style={{ animationDelay: "0.3s" }}></div>
          </div>
          <span className="text-xs text-gray-400">Fast (low latency)</span>
        </div>
      ),
    },
    {
      id: "route-color",
      title: "Route Colors",
      description: "Cyan = orbit, Green = ground, Purple = core.",
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
      description: "Data flows both ways: ↔ Ground ↔ Orbit.",
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
      description: "VLEO: 250-350km, LEO: 400-600km, SSO: 800-1000km, MEO: 10k-15k km, GEO: 35,786km.",
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
      id: "pulse-effects",
      title: "Pulse Effects",
      description: "Shell rings pulse on year advance.",
      visual: (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full border-2 border-teal-400 animate-ping"></div>
          <span className="text-xs text-gray-300">Annual pulse</span>
        </div>
      ),
    },
    {
      id: "breathing-glow",
      title: "Class B Breathing",
      description: "Pulsing glow based on sun alignment.",
      visual: (
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 transform rotate-45 bg-white shadow-lg shadow-cyan-400/50 animate-pulse"></div>
          <span className="text-xs text-gray-300">Breathing glow</span>
        </div>
      ),
    },
    {
      id: "world-tint",
      title: "World Tint",
      description: "Red = orbital worse. Green = orbital better.",
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
      title: "Strategy Cues",
      description: "COST: Yellow/green. LATENCY: Blue/white. CARBON: Emerald.",
      visual: (
        <div className="flex flex-col gap-1 text-xs text-gray-400">
          <div>COST → Yellow/green glow</div>
          <div>LATENCY → Blue/white glow</div>
          <div>CARBON → Emerald glow</div>
        </div>
      ),
    },
  ];

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          console.log('[VisualGlossary] Button clicked, opening glossary');
          setIsOpen(true);
        }}
        className="fixed bottom-6 right-6 z-[200] px-4 py-2 bg-gray-800/90 hover:bg-gray-700/90 border border-gray-600 rounded-lg text-sm text-white transition-colors shadow-lg pointer-events-auto"
        aria-label="Open visual glossary"
      >
        📖 Visual Guide
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-[200] w-96 max-w-[90vw] max-h-[85vh] overflow-y-auto panel-glass rounded-2xl p-5 shadow-2xl border border-white/10 pointer-events-auto">
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

      <div className="mt-4 pt-4 border-t border-gray-700">
        <p className="text-xs text-gray-500">
          All visual encodings are state-triggered and reflect actual simulation data.
        </p>
      </div>
    </div>
  );
}

