"use client";

import { useState } from "react";
import { useSandboxStore } from "../store/sandboxStore";

export default function LaunchLogisticsAccordion() {
  const [isOpen, setIsOpen] = useState(false);
  const { orbitalComputeUnits } = useSandboxStore();
  
  return (
    <div className="mt-4 pt-4 border-t border-gray-700/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-xs text-gray-400 hover:text-gray-300 transition-colors"
      >
        <span className="font-semibold">Launch Logistics (advanced)</span>
        <span className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>
      
      {isOpen && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="bg-gray-800/50 rounded p-2">
            <div className="text-gray-500 mb-1">Cost per Sat</div>
            <div className="text-accent-orange font-semibold">$500K-$2M</div>
          </div>
          <div className="bg-gray-800/50 rounded p-2">
            <div className="text-gray-500 mb-1">Launch Time</div>
            <div className="text-accent-blue font-semibold">6-12 months</div>
          </div>
          <div className="bg-gray-800/50 rounded p-2">
            <div className="text-gray-500 mb-1">Orbital Lifetime</div>
            <div className="text-accent-green font-semibold">5-7 years</div>
          </div>
        </div>
      )}
    </div>
  );
}

