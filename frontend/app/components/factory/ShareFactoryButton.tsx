"use client";

import { useState } from "react";

export default function ShareFactoryButton() {
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = async () => {
    setIsSharing(true);
    try {
      // Capture screenshot of the factory view
      // For now, we'll use a simple approach - in production, use html2canvas or similar
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      
      // Get the factory strip element
      const factoryElement = document.querySelector('[data-factory-strip]');
      if (!factoryElement) {
        alert("Factory view not found");
        setIsSharing(false);
        return;
      }

      // For now, we'll just copy a text summary
      const shareText = `Check out my orbital compute factory! 🚀\n\nFactory status and metrics...`;
      
      if (navigator.share) {
        await navigator.share({
          title: "My Orbital Compute Factory",
          text: shareText,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        alert("Factory status copied to clipboard!");
      } else {
        alert("Sharing not supported on this device");
      }
    } catch (error) {
      console.error("Share failed:", error);
      alert("Failed to share factory");
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <button
      onClick={handleShare}
      disabled={isSharing}
      className="fixed bottom-[240px] right-6 z-30 px-4 py-2 bg-accent-blue/80 hover:bg-accent-blue text-white text-xs font-semibold rounded-lg transition-all shadow-lg disabled:opacity-50"
      title="Share your factory"
    >
      {isSharing ? "Sharing..." : "📤 Share Factory"}
    </button>
  );
}

