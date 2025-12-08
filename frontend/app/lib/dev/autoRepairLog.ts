/**
 * Auto-Repair Log
 * Human-visible log of model repair history
 */

import type { RepairLogEntry } from './autoRepairPipeline';

export interface RepairLogDisplay {
  entries: RepairLogEntry[];
  totalRepairs: number;
  successfulRepairs: number;
  failedRepairs: number;
}

/**
 * Get formatted repair log for UI display
 */
export function getRepairLogDisplay(entries: RepairLogEntry[]): RepairLogDisplay {
  const successful = entries.filter(e => e.status === 'SUCCESS').length;
  const failed = entries.filter(e => e.status === 'FAILED' || e.status === 'MAX_ATTEMPTS').length;

  return {
    entries,
    totalRepairs: entries.length,
    successfulRepairs: successful,
    failedRepairs: failed,
  };
}

/**
 * Format repair entry for display
 */
export function formatRepairEntry(entry: RepairLogEntry): string {
  const date = new Date(entry.timestamp).toLocaleString();
  const statusIcon = entry.status === 'SUCCESS' ? '✓' : entry.status === 'FAILED' ? '✗' : '⚠';
  
  return `${statusIcon} [${date}] ${entry.testName}: ${entry.status}`;
}

