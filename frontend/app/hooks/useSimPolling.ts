import { useEffect } from "react";
import axios from "axios";
import { useSimStore, SimState } from "../store/simStore";
import { useSandboxStore } from "../store/sandboxStore";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export function useSimPolling() {
  const { setState, setLoading, setError } = useSimStore();
  // Access factory tick function via store getter (safe outside React render)
  const runFactoryTick = useSandboxStore.getState().runFactoryTick;

  useEffect(() => {
    let retryCount = 0;
    const MAX_RETRIES = 30; // Stop trying after 60 seconds (30 retries * 2 seconds)
    
    const pollState = async () => {
      try {
        const response = await axios.get<SimState>(`${API_BASE}/state`, {
          timeout: 180000, // 180 second timeout for large responses
          // Add signal for cancellation if component unmounts
        });
        console.log("[useSimPolling] Received state response, satellites:", response.data?.satellites?.length || 0);
        if (response.data && response.data.metrics) {
          // Set state first, then loading to false
          setState(response.data);
          setError(null);
          setLoading(false);
          retryCount = 0; // Reset retry count on success
          console.log("[useSimPolling] State loaded successfully, loading set to false");
          // Advance local factory engine by 1 simulated day per poll,
          // targeting current pods/month from backend metrics if available.
          const targetPodsPerMonth =
            (response.data.metrics as any)?.podsPerMonth ??
            (response.data.metrics as any)?.pods_per_month ??
            10;
          try {
            runFactoryTick(1, targetPodsPerMonth);
          } catch (e) {
            console.warn("[useSimPolling] runFactoryTick failed:", e);
          }
        } else {
          console.error("Invalid state structure:", response.data);
          setError("Invalid state structure");
          retryCount++;
          if (retryCount >= MAX_RETRIES) {
            setLoading(false);
          }
        }
      } catch (error: any) {
        console.error("Error fetching state:", error);
        retryCount++;
        
        if (error.response?.status === 503) {
          console.log(`Waiting for simulation to initialize... (attempt ${retryCount}/${MAX_RETRIES})`);
          if (retryCount >= MAX_RETRIES) {
            setError("Simulation initialization is taking too long. Please check the backend logs.");
            setLoading(false);
          }
        } else if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error') || error.code === 'ECONNREFUSED') {
          // Network error - backend might not be running
          console.warn(`Backend not reachable (attempt ${retryCount}/${MAX_RETRIES}). Is the server running on port 8000?`);
          // Only show error after a few retries to avoid flashing error messages
          if (retryCount >= 3) {
            setError("Cannot connect to backend. Please ensure the server is running on port 8000.");
          }
          if (retryCount >= MAX_RETRIES) {
            setLoading(false);
          }
        } else if (error.code === 'ECONNABORTED' || error.code === 5 || error.message?.includes('timeout')) {
          // Error code 5 is ECONNABORTED (timeout)
          const errorDetails = {
            code: error.code,
            message: error.message,
            response: error.response?.status,
            responseSize: error.response?.data ? JSON.stringify(error.response.data).length : 0,
            url: error.config?.url,
            timeout: error.config?.timeout,
            timestamp: new Date().toISOString(),
            retryCount: retryCount,
          };
          
          // Log to console
          console.error("[useSimPolling] Error 5 (Timeout) - Debug Info:", errorDetails);
          console.warn(`[useSimPolling] Request timeout (attempt ${retryCount}/${MAX_RETRIES}). Backend may be slow to respond.`);
          
          // Persist to localStorage so user can see it even after crash
          let savedToStorage = false;
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              const errorLog = JSON.parse(localStorage.getItem('orbitalCompute_errorLog') || '[]');
              errorLog.push(errorDetails);
              // Keep only last 10 errors
              if (errorLog.length > 10) {
                errorLog.shift();
              }
              localStorage.setItem('orbitalCompute_errorLog', JSON.stringify(errorLog));
              localStorage.setItem('orbitalCompute_lastError', JSON.stringify(errorDetails));
              savedToStorage = true;
              console.log("[useSimPolling] Error logged to localStorage successfully");
              console.log("[useSimPolling] To view errors, run in console:");
              console.log("localStorage.getItem('orbitalCompute_errorLog')");
              console.log("or");
              console.log("localStorage.getItem('orbitalCompute_lastError')");
            }
          } catch (e) {
            console.warn("[useSimPolling] Could not save error to localStorage:", e);
            if (e instanceof Error) {
            console.warn("[useSimPolling] localStorage may not be available:", e.message);
            } else {
              console.warn("[useSimPolling] localStorage may not be available (non-Error):", String(e));
            }
          }
          
          // Show error message with localStorage instructions
          if (retryCount >= 3) {
            const storageMsg = savedToStorage 
              ? "Error saved to localStorage. Run: localStorage.getItem('orbitalCompute_errorLog')"
              : "localStorage not available. Check console for error details above.";
            const errorMsg = `Request timeout (Error 5). ${storageMsg}`;
            setError(errorMsg);
            console.error("[useSimPolling] ERROR 5 DETAILS:", errorDetails);
            if (savedToStorage) {
              console.error("[useSimPolling] Error saved! Run this in console:");
              console.error("JSON.parse(localStorage.getItem('orbitalCompute_errorLog'))");
            } else {
              console.error("[useSimPolling] localStorage unavailable. Error details above.");
            }
          }
          if (retryCount >= MAX_RETRIES) {
            setLoading(false);
          }
        } else {
          console.warn(`Error: ${error.message || 'Unknown error'}`);
          // Only show error after multiple failures
          if (retryCount >= 5) {
            setError(error.message || "Failed to fetch simulation state");
          }
          if (retryCount >= MAX_RETRIES) {
            setLoading(false);
          }
        }
      }
    };

    pollState();
    const interval = setInterval(pollState, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [setState, setLoading, setError]);
}

