import axios from "axios";
import { useSimStore } from "../store/simStore";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export function useScenarioUpdate() {
  const { state, setScenario, setOrbitOffloadPercent } = useSimStore();

  const updateScenario = async (scenario?: string, orbitOffloadPercent?: number) => {
    try {
      const response = await axios.post(`${API_BASE}/scenario`, {
        mode: scenario,
        orbitOffloadPercent,
      }, {
        timeout: 10000, // 10 second timeout
      });
      
      console.log("[useScenarioUpdate] Scenario updated:", response.data);
      
      // Optimistically update local state
      if (scenario) {
        setScenario(scenario as any);
        console.log("[useScenarioUpdate] Local scenario set to:", scenario);
      }
      if (orbitOffloadPercent !== undefined) {
        setOrbitOffloadPercent(orbitOffloadPercent);
      }
    } catch (error: any) {
      // Silently handle scenario update errors
    }
  };

  return { updateScenario };
}

