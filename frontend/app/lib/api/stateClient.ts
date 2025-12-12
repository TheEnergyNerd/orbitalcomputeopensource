/**
 * API client for SystemState endpoints
 * Handles polling, updates, and state synchronization
 */
import axios from "axios";
import { SystemState } from "../types/SystemState";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export async function fetchSystemState(): Promise<SystemState> {
  try {
    const response = await axios.get<SystemState>(`${API_BASE}/api/state`, {
      timeout: 60000,
      validateStatus: () => true, // Don't throw on any status code
    });
    if (response.status === 200) {
      return response.data;
    }
    throw new Error(`Backend returned status ${response.status}`);
  } catch (error: any) {
    // Suppress CORS/network errors when backend isn't available
    if (error.code === 'ERR_NETWORK' || error.message?.includes('CORS') || error.message?.includes('Cross-Origin')) {
      // Return a default state or rethrow if needed
      throw new Error('Backend not available');
    }
    throw error;
  }
}

export async function updateSystemState(
  updates: Partial<SystemState>
): Promise<SystemState> {
  const response = await axios.post<SystemState>(
    `${API_BASE}/api/state/update`,
    updates,
    {
      timeout: 30000,
    }
  );
  return response.data;
}

export async function fetchTLEs(): Promise<Array<{ id: string; tleLine1: string; tleLine2: string }>> {
  const response = await axios.get(`${API_BASE}/api/tle/starlink`, {
    timeout: 30000,
  });
  return response.data;
}

