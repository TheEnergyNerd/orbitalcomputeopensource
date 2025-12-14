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
    // CRITICAL FIX: New OrbitSim doesn't need backend - disable polling completely
    // Set loading to false immediately and don't poll
    setLoading(false);
    setError(null);
    
    // Return early - don't set up any polling
    return;
    
    // OLD CODE BELOW - DISABLED
    /*
    let retryCount = 0;
    const MAX_RETRIES = 3; // Stop trying after 6 seconds (3 retries * 2 seconds)
    
    // Immediately set loading to false - new OrbitSim doesn't need backend
    setLoading(false);
    
    const pollState = async () => {
      try {
        const response = await axios.get<SimState>(`${API_BASE}/state`, {
          timeout: 2000, // 2 second timeout - fail fast
          validateStatus: () => true, // Don't throw on any status code
          // Add signal for cancellation if component unmounts
        });
        // Check if response is valid (200 status) and has expected structure
        if (response.status === 200 && response.data && response.data.metrics) {
          // Set state first, then loading to false
          setState(response.data);
          setError(null);
          setLoading(false);
          retryCount = 0; // Reset retry count on success
          // Advance local factory engine by 1/30 month per poll (daily tick)
          try {
            runFactoryTick(1 / 30); // 1 day = 1/30 month
          } catch (e) {
            // Silently handle factory tick errors
          }
          
          // Step new Factorio-style simulation (1 minute per poll, scaled by timeScale)
          try {
            const { simState } = useSandboxStore.getState();
            if (simState) {
              // stepSimulation removed - simulation stepping handled elsewhere
              // The sim state is updated through other mechanisms
            }
          } catch (e) {
            // Silently handle simulation step errors
          }
        } else if (response.status >= 400 || response.status === 0) {
          // Backend error or not available - silently handle, don't set error
          retryCount++;
          if (retryCount >= MAX_RETRIES) {
            setError(null); // Clear any previous errors
            setLoading(false);
            return; // Stop polling
          }
        } else {
          // Invalid structure but not an error status - backend might be returning something unexpected
          // Silently handle, don't show error to user
          retryCount++;
          if (retryCount >= MAX_RETRIES) {
            setError(null);
            setLoading(false);
            return; // Stop polling
          }
        }
      } catch (error: any) {
        retryCount++;
        
        // Suppress CORS errors when backend isn't available (common in dev)
        // Check for CORS-related errors in multiple ways
        const isCorsError = 
          error.message?.includes('CORS') || 
          error.message?.includes('Cross-Origin') ||
          error.code === 'ERR_NETWORK' ||
          error.message?.includes('Network Error') ||
          error.code === 'ECONNREFUSED' ||
          (error.response === undefined && error.request !== undefined);
        
        if (isCorsError) {
          // Backend not available or CORS issue - silently handle
          // New OrbitSim doesn't need backend, so stop immediately
          setError(null);
          setLoading(false);
          return; // Stop polling immediately
        }
        
        if (error.response?.status === 503) {
          if (retryCount >= MAX_RETRIES) {
            setError("Simulation initialization is taking too long. Please check the backend logs.");
            setLoading(false);
          }
        } else if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error') || error.code === 'ECONNREFUSED') {
          // Network error - backend might not be running
          // New OrbitSim doesn't need backend, so stop polling immediately
          setError(null); // Don't show error - new OrbitSim is self-contained
          setLoading(false);
          return; // Stop polling immediately
        } else if (error.response?.status === 500) {
          // Backend error - new OrbitSim doesn't need backend, so stop polling immediately
          setError(null);
          setLoading(false);
          return; // Stop polling immediately
        } else if (error.code === 'ECONNABORTED' || error.code === 5 || error.message?.includes('timeout')) {
          // Error code 5 is ECONNABORTED (timeout)
          // New OrbitSim doesn't need backend, so stop immediately
          setError(null);
          setLoading(false);
          return; // Stop polling immediately
        } else {
          // Any other error - new OrbitSim doesn't need backend, so stop immediately
          setError(null);
          setLoading(false);
          return; // Stop polling immediately
        }
      }
    };

    pollState();
    const interval = setInterval(pollState, 2000); // Poll every 2 seconds
    
    // Step the Factorio simulation continuously (every 100ms = 10 times per second)
    const simInterval = setInterval(() => {
      try {
        const { stepSimulation, simState } = useSandboxStore.getState();
        if (simState) {
          stepSimulation(1 / 60); // Step by 1/60 minute (1 second) each tick
        }
      } catch (e) {
        // Silently handle simulation step errors
      }
    }, 100); // Run every 100ms
    
    return () => {
      clearInterval(interval);
      clearInterval(simInterval);
    };
    */
  }, [setState, setLoading, setError]);
}

