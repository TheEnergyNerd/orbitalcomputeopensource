/**
 * Orbital Deployment Manager
 * Manages year-by-year satellite deployment based on deployment schedule
 */

// deploymentSchedule.ts removed - using strategyDeployment instead
import { assignSatelliteToShell } from "./shellAssignment";
import { getAltitudeForShell } from "./satellitePositioning";
import { 
  generateOrbitalState,
  getRandomInclination,
  calculateOrbitalPosition 
} from "./orbitalMechanics";
import type { Satellite, OrbitalState } from "../../state/orbitStore";

export interface DeploymentEvent {
  year: number;
  launchId: string;
  launchSite: { lat: number; lon: number; name: string };
  satsPerLaunch: number;
  targetShell: string;
  satellites: Satellite[];
}

const LAUNCH_SITES = [
  { lat: 28.5623, lon: -80.5774, name: "Cape Canaveral" }, // SLC-40, Florida
  { lat: 34.7420, lon: -120.5724, name: "Vandenberg" }, // LC-576E, California
  { lat: 25.9971, lon: -97.1554, name: "Boca Chica" }, // Starbase, Texas
];

/**
 * Generate deployment events for a year
 */
export function generateDeploymentForYear(year: number): DeploymentEvent[] {
  const deployment = getDeploymentForYear(year);
  if (!deployment) return [];
  
  const events: DeploymentEvent[] = [];
  let satIndex = 0;
  
  // Distribute launches throughout the year
  for (let launchNum = 0; launchNum < deployment.launches; launchNum++) {
    const launchSite = LAUNCH_SITES[launchNum % LAUNCH_SITES.length];
    const shell = assignSatelliteToShell(satIndex, deployment.newSats);
    const altitude = getAltitudeForShell(shell);
    
    // Generate satellites for this launch
    const satellites: Satellite[] = [];
    for (let i = 0; i < deployment.satsPerLaunch; i++) {
      const inclination = getRandomInclination();
      const orbitalState = generateOrbitalState(altitude, inclination);
      
      // Spread satellites around orbit
      orbitalState.theta += (i / deployment.satsPerLaunch) * 2 * Math.PI;
      
      // Calculate initial position
      const [x, y, z] = calculateOrbitalPosition(
        orbitalState.altitudeRadius,
        orbitalState.inclination,
        orbitalState.theta
      );
      
      satellites.push({
        x,
        y,
        z,
        id: `year_${year}_launch_${launchNum}_sat_${i}`,
        congestion: 0,
        shell: shell.shell === "LEO-1" ? 1 : shell.shell === "LEO-2" ? 2 : 3,
        orbitalState,
      });
      
      satIndex++;
    }
    
    events.push({
      year,
      launchId: `year_${year}_launch_${launchNum}`,
      launchSite,
      satsPerLaunch: deployment.satsPerLaunch,
      targetShell: shell.shell,
      satellites,
    });
  }
  
  return events;
}

/**
 * Get all satellites up to a given year
 */
export function getAllSatellitesUpToYear(year: number): Satellite[] {
  const allSats: Satellite[] = [];
  
  for (const deployment of DEPLOYMENT_SCHEDULE) {
    if (deployment.year <= year) {
      const events = generateDeploymentForYear(deployment.year);
      events.forEach(event => {
        allSats.push(...event.satellites);
      });
    }
  }
  
  return allSats;
}

