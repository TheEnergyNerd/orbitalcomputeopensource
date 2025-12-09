/**
 * Supply Chain Events System
 * Random events that perturb factory stages
 */

import type { StageId, SupplyEvent, FactoryGameState } from './factoryModel';

// SupplyEventType is not exported from factoryModel, define it here
// Based on actual usage in this file
export type SupplyEventType = 'capacity_drop' | 'efficiency_hit' | 'outage' | 'launch_risk_spike' | 'supply_boost' | 'supply_drop' | 'demand_spike' | 'demand_drop';

/**
 * Event descriptions by type and stage
 */
function describeEvent(stageId: StageId, type: SupplyEventType, severity: number): string {
  const stageNames: Record<StageId, string> = {
    silicon: 'Silicon',
    chips: 'Chips',
    racks: 'Racks',
    pods: 'Pods',
    launch: 'Launch',
  };

  const stageName = stageNames[stageId];
  const severityPct = Math.round(severity * 100);

  switch (type) {
    case 'capacity_drop':
      if (stageId === 'silicon') {
        return `Silicon shortage – wafer fab offline (${severityPct}% capacity loss)`;
      } else if (stageId === 'racks') {
        return `Rack factory fire – output reduced (${severityPct}% capacity loss)`;
      }
      return `${stageName} capacity drop – ${severityPct}% reduction`;
    
    case 'efficiency_hit':
      if (stageId === 'chips') {
        return `Yield problems – more scrap per chip (${severityPct}% efficiency loss)`;
      }
      return `${stageName} efficiency issues – ${severityPct}% loss`;
    
    case 'outage':
      if (stageId === 'pods') {
        return `Cleanroom contamination – pods delayed (${severityPct}% outage)`;
      }
      return `${stageName} outage – ${severityPct}% capacity loss`;
    
    case 'launch_risk_spike':
      return `Launch pad damage – higher failure risk (${severityPct}% reliability loss)`;
    
    default:
      return `${stageName} event – ${severityPct}% impact`;
  }
}

/**
 * Pick a random stage
 */
function pickRandomStage(): StageId {
  const stages: StageId[] = ['silicon', 'chips', 'racks', 'pods', 'launch'];
  return stages[Math.floor(Math.random() * stages.length)];
}

/**
 * Pick event type for a stage
 */
function pickTypeForStage(stageId: StageId): SupplyEventType {
  // Different stages have different event type probabilities
  const rand = Math.random();
  
  switch (stageId) {
    case 'silicon':
      return rand < 0.7 ? 'capacity_drop' : 'efficiency_hit';
    case 'chips':
      return rand < 0.6 ? 'efficiency_hit' : 'capacity_drop';
    case 'racks':
      return rand < 0.7 ? 'capacity_drop' : 'outage';
    case 'pods':
      return rand < 0.6 ? 'outage' : 'efficiency_hit';
    case 'launch':
      return rand < 0.8 ? 'launch_risk_spike' : 'capacity_drop';
    default:
      return 'capacity_drop';
  }
}

/**
 * Maybe spawn a new event based on sim time and current state
 */
export function maybeSpawnEvent(state: FactoryGameState): FactoryGameState {
  // Check if there's already an active unresolved event
  const active = state.events.find(ev => !ev.resolved && (ev.spawnTime + ev.duration) > state.simTime);
  if (active) return state;

  // 5% chance per check (adjust frequency as needed)
  if (Math.random() > 0.05) return state;

  const stage: StageId = pickRandomStage();
  const type = pickTypeForStage(stage);
  const severity = 0.3 + Math.random() * 0.4; // 30-70% severity
  const duration = 30 + Math.random() * 60; // 30-90 simTime units

  const ev: SupplyEvent = {
    id: `ev-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    stageId: stage,
    type: type as string, // SupplyEvent.type is string, not SupplyEventType
    severity,
    spawnTime: state.simTime,
    duration: duration,
    resolved: false,
  };

  return {
    ...state,
    events: [...state.events, ev],
  };
}

/**
 * Resolve an event by investing points in the affected stage
 * Returns true if the event should be resolved
 */
export function shouldResolveEvent(
  event: SupplyEvent,
  stageUpgrades: { capacityPoints: number; efficiencyPoints: number; reliabilityPoints: number },
  pointsInvestedAfterEvent: number
): boolean {
  // If player invested at least 2 points in this stage after event creation, resolve it
  return pointsInvestedAfterEvent >= 2;
}

/**
 * Get active events for a stage
 */
export function getActiveEventsForStage(
  events: SupplyEvent[],
  stageId: StageId,
  simTime: number
): SupplyEvent[] {
  return events.filter(
    ev => ev.stageId === stageId &&
          !ev.resolved &&
          ev.expiresAt > simTime
  );
}

/**
 * Get all active events
 */
export function getActiveEvents(events: SupplyEvent[], simTime: number): SupplyEvent[] {
  return events.filter(ev => !ev.resolved && (ev.spawnTime + ev.duration) > simTime);
}

/**
 * Resolve an event (mark as resolved)
 */
export function resolveEvent(events: SupplyEvent[], eventId: string): SupplyEvent[] {
  return events.map(ev => 
    ev.id === eventId ? { ...ev, resolved: true } : ev
  );
}

/**
 * Clean up expired events (optional: remove old resolved events)
 */
export function cleanupEvents(events: SupplyEvent[], simTime: number, maxAge: number = 1000): SupplyEvent[] {
  return events.filter(ev => {
    const expiresAt = ev.spawnTime + ev.duration;
    // Keep active events
    if (!ev.resolved && expiresAt > simTime) return true;
    // Keep recently resolved events
    if (ev.resolved && simTime - expiresAt < maxAge) return true;
    // Remove old events
    return false;
  });
}




