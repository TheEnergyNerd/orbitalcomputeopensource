"use client";

import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";

export default function DeploymentTimeDisplay() {
  const { totalRealWorldTimeDays } = useOrbitalUnitsStore();
  
  // Base year is 2024
  const BASE_YEAR = 2024;
  const currentYear = BASE_YEAR + Math.floor(totalRealWorldTimeDays / 365);
  const monthsIntoYear = Math.floor((totalRealWorldTimeDays % 365) / 30);
  
  // Format: "2024" or "2025 Q1" etc
  const formatYear = () => {
    if (totalRealWorldTimeDays === 0) {
      return BASE_YEAR.toString();
    }
    
    if (monthsIntoYear === 0) {
      return currentYear.toString();
    }
    
    // Show quarter or month
    const quarter = Math.floor(monthsIntoYear / 3) + 1;
    if (quarter <= 4) {
      return `${currentYear} Q${quarter}`;
    }
    
    // If more than a year, show year + months
    const years = Math.floor(totalRealWorldTimeDays / 365);
    const months = Math.floor((totalRealWorldTimeDays % 365) / 30);
    if (years > 0 && months > 0) {
      return `${currentYear} (+${months}mo)`;
    }
    
    return currentYear.toString();
  };
  
  if (totalRealWorldTimeDays === 0) {
    return null; // Don't show if no deployments
  }
  
  return (
    <div className="fixed top-6 left-6 z-40 pointer-events-none">
      <div className="panel-glass rounded-lg p-3 border border-accent-blue/50 shadow-lg">
        <div className="text-xs text-gray-400 mb-1">Simulation Year</div>
        <div className="text-2xl font-bold text-accent-blue">
          {formatYear()}
        </div>
        {totalRealWorldTimeDays > 0 && (
          <div className="text-xs text-gray-500 mt-1">
            {Math.floor(totalRealWorldTimeDays / 365)}y {Math.floor((totalRealWorldTimeDays % 365) / 30)}mo elapsed
          </div>
        )}
      </div>
    </div>
  );
}

