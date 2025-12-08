"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import axios from "axios";
import { SimState } from "../types";

interface SimContextType {
  state: SimState | null;
  selectedEntity: { type: "ground" | "orbital"; id: string } | null;
  setSelectedEntity: (entity: { type: "ground" | "orbital"; id: string } | null) => void;
  updateScenario: (mode?: string, orbitOffloadPercent?: number) => Promise<void>;
  loading: boolean;
}

const SimContext = createContext<SimContextType | undefined>(undefined);

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export function SimProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SimState | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<{ type: "ground" | "orbital"; id: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    const pollState = async () => {
      try {
        const response = await axios.get<SimState>(`${API_BASE}/state`, {
          timeout: 5000, // 5 second timeout
          validateStatus: () => true, // Don't throw on any status
        });
        // Validate response structure
        if (response.status === 200 && response.data && response.data.metrics) {
          setState(response.data);
          setLoading(false);
          retryCount = 0; // Reset retry count on success
        } else if (response.status >= 400) {
          // Backend error - silently handle
          retryCount++;
          if (retryCount >= MAX_RETRIES) {
            setLoading(false);
            if (interval) {
              clearInterval(interval);
              interval = null;
            }
          }
        }
      } catch (error: any) {
        // Silently handle all backend errors - new OrbitSim doesn't need backend
        retryCount++;
        if (retryCount >= MAX_RETRIES) {
          // Stop polling after max retries
          setLoading(false);
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
        }
        // Don't log errors - backend is optional
      }
    };

    pollState();
    interval = setInterval(pollState, 2000); // Poll every 2 seconds

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []);

  const updateScenario = async (mode?: string, orbitOffloadPercent?: number) => {
    try {
      await axios.post(`${API_BASE}/scenario`, {
        mode,
        orbitOffloadPercent,
      }, {
        validateStatus: () => true, // Don't throw on any status
      });
      // Optimistically update local state
      if (state) {
        setState({
          ...state,
          scenario: {
            mode: (mode || state.scenario.mode) as any,
            orbitOffloadPercent: orbitOffloadPercent ?? state.scenario.orbitOffloadPercent,
          },
        });
      }
    } catch (error) {
      // Silently handle - backend is optional
    }
  };

  return (
    <SimContext.Provider
      value={{
        state,
        selectedEntity,
        setSelectedEntity,
        updateScenario,
        loading,
      }}
    >
      {children}
    </SimContext.Provider>
  );
}

export function useSim() {
  const context = useContext(SimContext);
  if (context === undefined) {
    throw new Error("useSim must be used within a SimProvider");
  }
  return context;
}

