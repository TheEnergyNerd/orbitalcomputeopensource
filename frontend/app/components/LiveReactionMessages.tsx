"use client";

import { useEffect, useState } from "react";

interface ReactionMessage {
  id: string;
  text: string;
  timestamp: number;
}

/**
 * LiveReactionMessages - Shows ephemeral feedback messages when sliders change
 */
export default function LiveReactionMessages() {
  const [messages, setMessages] = useState<ReactionMessage[]>([]);

  useEffect(() => {
    const handleControlsChanged = () => {
      // This will be populated by ControlsPanel when sliders change
    };

    window.addEventListener('controls-changed', handleControlsChanged);
    return () => window.removeEventListener('controls-changed', handleControlsChanged);
  }, []);

  // Clean up old messages
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setMessages(prev => prev.filter(m => now - m.timestamp < 1000)); // Keep for 1 second
    }, 100);

    return () => clearInterval(interval);
  }, []);

  if (messages.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-40 pointer-events-none">
      <div className="space-y-1">
        {messages.map(msg => (
          <div
            key={msg.id}
            className="text-xs text-cyan-400 bg-gray-900/90 px-3 py-1 rounded border border-cyan-500/50 animate-pulse"
            style={{
              animation: 'fadeInOut 1s ease-in-out',
            }}
          >
            {msg.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper function to show a reaction message (called from ControlsPanel)
export function showReactionMessage(text: string) {
  const event = new CustomEvent('reaction-message', { detail: { text } });
  window.dispatchEvent(event);
}

