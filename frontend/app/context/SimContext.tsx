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
    const pollState = async () => {
      try {
        const response = await axios.get<SimState>(`${API_BASE}/state`);
        // Validate response structure
        if (response.data && response.data.metrics) {
          setState(response.data);
          setLoading(false);
        } else {
          console.error("Invalid state structure:", response.data);
        }
      } catch (error: any) {
        console.error("Error fetching state:", error);
        if (error.response?.status === 503) {
          // Simulation not initialized yet, keep trying
          console.log("Waiting for simulation to initialize...");
        } else {
          setLoading(false);
        }
      }
    };

    pollState();
    const interval = setInterval(pollState, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, []);

  const updateScenario = async (mode?: string, orbitOffloadPercent?: number) => {
    try {
      await axios.post(`${API_BASE}/scenario`, {
        mode,
        orbitOffloadPercent,
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
      console.error("Error updating scenario:", error);
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

