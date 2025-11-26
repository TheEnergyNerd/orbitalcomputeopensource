"use client";

import React, { useState, useEffect } from "react";
import { useTutorialStore } from "../store/tutorialStore";
import { useSimStore } from "../store/simStore";
import * as Cesium from "cesium";

interface MetricCardProps {
  title: string;
  description: string;
  demoType: "latency" | "energy" | "carbon" | "resilience";
  viewerRef: React.MutableRefObject<Cesium.Viewer | null>;
}

export default function TutorialStep4({ viewerRef }: { viewerRef: React.MutableRefObject<Cesium.Viewer | null> }) {
  const { completeTutorial } = useTutorialStore();
  const state = useSimStore((s) => s.state);
  const [activeCard, setActiveCard] = useState<"latency" | "energy" | "carbon" | "resilience" | null>(null);

  const cards: MetricCardProps[] = [
    {
      title: "Global Latency Advantage",
      description: "Orbit is the only consistent global low-latency tier",
      demoType: "latency",
      viewerRef,
    },
    {
      title: "Energy Advantage",
      description: "Zero cooling requirement = 40-60% cost reduction",
      demoType: "energy",
      viewerRef,
    },
    {
      title: "Carbon Advantage",
      description: "Solar-powered = zero carbon emissions",
      demoType: "carbon",
      viewerRef,
    },
    {
      title: "Resilience / Redundancy",
      description: "Fiber cuts? Orbital paths instantly fill in",
      demoType: "resilience",
      viewerRef,
    },
  ];

  // Auto-cycle through cards
  useEffect(() => {
    if (activeCard === null) {
      setActiveCard("latency");
      return;
    }

    const cycle = setInterval(() => {
      const currentIndex = cards.findIndex((c) => c.demoType === activeCard);
      const nextIndex = (currentIndex + 1) % cards.length;
      setActiveCard(cards[nextIndex].demoType);
    }, 4000);

    return () => clearInterval(cycle);
  }, [activeCard]);

  return (
    <div className="fixed bottom-0 left-0 right-0 pointer-events-auto z-50">
      <div className="panel-glass rounded-t-3xl p-8 max-w-6xl mx-auto border-t-2 border-accent-blue/50 shadow-2xl">
        <p className="text-2xl text-white mb-6 text-center font-bold">
          Compute in orbit solves the bottlenecks ground cannot.
        </p>
        
        <div className="grid grid-cols-2 gap-6 mb-8">
          {cards.map((card, idx) => (
            <MetricCard
              key={card.demoType}
              {...card}
              isActive={activeCard === card.demoType}
              onActivate={() => setActiveCard(card.demoType)}
              delay={idx * 200}
            />
          ))}
        </div>

        <button
          onClick={completeTutorial}
          className="w-full px-10 py-5 bg-accent-blue hover:bg-accent-blue/80 text-dark-bg rounded-2xl font-bold text-xl transition-all hover:scale-105 shadow-2xl hover:shadow-accent-blue/50 animate-pulse"
        >
          Launch Full Simulator 🚀
        </button>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  description,
  demoType,
  viewerRef,
  isActive,
  onActivate,
  delay = 0,
}: MetricCardProps & { isActive: boolean; onActivate: () => void; delay?: number }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  const state = useSimStore((s) => s.state);

  useEffect(() => {
    if (!isActive || !viewerRef.current || !state) return;

    const viewer = viewerRef.current;
    const entities = viewer.entities;

    // Clear previous demo entities
    const demoEntities = entities.values.filter((e) => e.id?.toString().startsWith(`demo_${demoType}_`));
    demoEntities.forEach((e) => entities.remove(e));

    if (demoType === "latency") {
      // Show latency comparison: ground vs orbit paths
      if (state.groundSites.length > 0 && state.satellites.length > 0) {
        const site1 = state.groundSites[0];
        const site2 = state.groundSites[state.groundSites.length > 1 ? 1 : 0];
        const sat = state.satellites[0];

        // Ground path (longer, slower)
        entities.add({
          id: `demo_latency_ground`,
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(site1.lon, site1.lat, 0),
              Cesium.Cartesian3.fromDegrees(site2.lon, site2.lat, 0),
            ],
            material: Cesium.Color.fromCssColorString("#ff6b35").withAlpha(0.6),
            width: 3,
            clampToGround: true,
          },
        });

        // Orbital path (shorter, faster)
        entities.add({
          id: `demo_latency_orbit`,
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(site1.lon, site1.lat, 0),
              Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000),
              Cesium.Cartesian3.fromDegrees(site2.lon, site2.lat, 0),
            ],
            material: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.8),
            width: 4,
          },
        });
      }
    } else if (demoType === "energy") {
      // Show cooling cost visualization
      state.groundSites.forEach((site, idx) => {
        entities.add({
          id: `demo_energy_${site.id}`,
          position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0),
          cylinder: {
            length: site.coolingMw * 2000, // Visualize cooling cost
            topRadius: 5000,
            bottomRadius: 5000,
            material: Cesium.Color.fromCssColorString("#ff6b35").withAlpha(0.5),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString("#ff0000"),
          },
        });
      });

      // Orbit has no cooling
      state.satellites.slice(0, 5).forEach((sat) => {
        entities.add({
          id: `demo_energy_${sat.id}`,
          position: Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000),
          point: {
            pixelSize: 10,
            color: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.9),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
          },
        });
      });
    } else if (demoType === "carbon") {
      // Show carbon emissions: ground (red) vs orbit (green/blue)
      state.groundSites.forEach((site) => {
        entities.add({
          id: `demo_carbon_${site.id}`,
          position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0),
          point: {
            pixelSize: 25,
            color: Cesium.Color.fromCssColorString("#ff0000").withAlpha(0.8),
            outlineColor: Cesium.Color.fromCssColorString("#ff6b35"),
            outlineWidth: 3,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        });
      });

      // Orbit: zero carbon (green/blue)
      state.satellites.slice(0, 20).forEach((sat) => {
        entities.add({
          id: `demo_carbon_${sat.id}`,
          position: Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000),
          point: {
            pixelSize: 8,
            color: Cesium.Color.fromCssColorString("#00ff88").withAlpha(0.9),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
          },
        });
      });
    } else if (demoType === "resilience") {
      // Simulate fiber cut and orbital reroute
      if (state.groundSites.length > 1 && state.satellites.length > 0) {
        const site1 = state.groundSites[0];
        const site2 = state.groundSites[1];
        const sat = state.satellites[0];

        // Broken ground path (red, dashed)
        entities.add({
          id: `demo_resilience_broken`,
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(site1.lon, site1.lat, 0),
              Cesium.Cartesian3.fromDegrees(site2.lon, site2.lat, 0),
            ],
            material: Cesium.Color.fromCssColorString("#ff0000").withAlpha(0.3),
            width: 2,
            clampToGround: true,
          },
        });

        // Orbital reroute (blue, active)
        entities.add({
          id: `demo_resilience_reroute`,
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(site1.lon, site1.lat, 0),
              Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000),
              Cesium.Cartesian3.fromDegrees(site2.lon, site2.lat, 0),
            ],
            material: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.9),
            width: 5,
          },
        });
      }
    }

    return () => {
      // Cleanup on unmount or deactivate
      const demoEntities = entities.values.filter((e) => e.id?.toString().startsWith(`demo_${demoType}_`));
      demoEntities.forEach((e) => entities.remove(e));
    };
  }, [isActive, demoType, viewerRef, state]);

  return (
    <div
      className={`panel-glass rounded-xl p-6 border-2 transition-all duration-500 cursor-pointer transform ${
        isActive
          ? "border-accent-blue/80 bg-accent-blue/20 scale-105 shadow-2xl"
          : "border-accent-blue/30 hover:border-accent-blue/60 hover:scale-102"
      } ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
      onClick={onActivate}
    >
      <div className={`text-xl font-bold mb-3 flex items-center gap-2 ${isActive ? "text-accent-blue" : "text-gray-300"}`}>
        {isActive && <span className="text-2xl animate-pulse">▶</span>}
        {title}
      </div>
      <div className="text-sm text-gray-400 leading-relaxed">{description}</div>
      {isActive && (
        <div className="mt-4 p-3 bg-accent-blue/20 rounded-lg border border-accent-blue/50">
          <div className="text-sm text-accent-blue font-semibold animate-pulse flex items-center gap-2">
            <span>🌐</span> Demo active on globe
          </div>
        </div>
      )}
    </div>
  );
}

