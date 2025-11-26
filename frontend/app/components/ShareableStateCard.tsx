"use client";

import { useState, useEffect } from "react";
import { useSimStore } from "../store/simStore";
import { useSandboxStore } from "../store/sandboxStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";

export default function ShareableStateCard() {
  const state = useSimStore((s) => s.state);
  const { orbitalComputeUnits, groundDCReduction } = useSandboxStore();
  const { getDeployedUnits } = useOrbitalUnitsStore();
  const [shareUrl, setShareUrl] = useState<string>("");

  useEffect(() => {
    if (!state) return;

    const shareData = {
      orbitShare: orbitalComputeUnits,
      groundReduction: groundDCReduction,
      latency: state.metrics.avgLatencyMs,
      carbon: state.metrics.carbonGround + state.metrics.carbonOrbit,
      deployedUnits: getDeployedUnits().length,
    };

    const encoded = btoa(JSON.stringify(shareData));
    setShareUrl(`${window.location.origin}/sandbox?state=${encoded}`);
  }, [state, orbitalComputeUnits, groundDCReduction, getDeployedUnits]);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "My Orbital Compute Configuration",
          text: "Check out my orbital compute setup!",
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or error
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(shareUrl);
      alert("URL copied to clipboard!");
    }
  };

  if (!state) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 panel-glass rounded-xl p-4 w-64 sm:w-72 max-w-[calc(100vw-12px)] shadow-2xl border border-white/10">
      <h3 className="text-lg font-bold text-accent-blue mb-4">Share Configuration</h3>
      <button
        onClick={handleShare}
        className="w-full px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 text-dark-bg rounded-lg font-semibold transition-all"
      >
        📤 Share State
      </button>
      {shareUrl && (
        <div className="mt-3 text-xs text-gray-400 break-all">
          {shareUrl.substring(0, 50)}...
        </div>
      )}
    </div>
  );
}

