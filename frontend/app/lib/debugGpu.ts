// GPU diagnostics utility
let lastLog = 0;
const LOG_THROTTLE_MS = 1000; // Only log once per second

export function logGpuEvent(label: string, extra?: any) {
  const now = performance.now();
  if (now - lastLog < LOG_THROTTLE_MS) return;
  lastLog = now;
  
  const timestamp = new Date().toISOString();
  console.log(`[GPU] ${timestamp} ${label}`, extra || "");
  
  // Also store in window for debugging
  if (typeof window !== "undefined") {
    if (!(window as any).gpuLog) {
      (window as any).gpuLog = [];
    }
    (window as any).gpuLog.push({
      timestamp,
      label,
      extra,
      time: now,
    });
    
    // Keep only last 100 entries
    if ((window as any).gpuLog.length > 100) {
      (window as any).gpuLog.shift();
    }
  }
}

// Expose to window for console debugging
if (typeof window !== "undefined") {
  (window as any).logGpuEvent = logGpuEvent;
  (window as any).getGpuLog = () => (window as any).gpuLog || [];
  (window as any).clearGpuLog = () => {
    (window as any).gpuLog = [];
  };
}

