/**
 * Integrity Test Runner
 * Runs all integrity tests and triggers auto-repair on failure
 */

import {
  testTotalComputeConserved,
  testNoNegativeCosts,
  testLatencyPhysicsBound,
  testCarbonDeclineRate,
  testOrbitalShareCapacity,
  runIntegrityTests,
  type IntegrityTestResult,
} from './integrity';
import { autoRepairOnTestFailure } from '../../dev/autoRepairPipeline';

export interface IntegrityTestSuite {
  computeConserved?: { input: number; output: number };
  costs?: Record<string, number>;
  latency?: { latency: number; distanceKm: number; orbitalDelayMs: number };
  carbonSeries?: number[];
  orbitalShare?: { share: number; capacity: number; demand: number };
}

/**
 * Run integrity test suite
 */
export async function runIntegrityTestSuite(
  suite: IntegrityTestSuite
): Promise<{
  allPassed: boolean;
  results: IntegrityTestResult[];
  repaired: boolean;
}> {
  const tests: Array<() => IntegrityTestResult> = [];

  // Add tests based on available data
  if (suite.computeConserved) {
    tests.push(() =>
      testTotalComputeConserved(
        suite.computeConserved!.input,
        suite.computeConserved!.output
      )
    );
  }

  if (suite.costs) {
    tests.push(() => testNoNegativeCosts(suite.costs!));
  }

  if (suite.latency) {
    tests.push(() =>
      testLatencyPhysicsBound(
        suite.latency!.latency,
        suite.latency!.distanceKm,
        suite.latency!.orbitalDelayMs
      )
    );
  }

  if (suite.carbonSeries) {
    tests.push(() => testCarbonDeclineRate(suite.carbonSeries!));
  }

  if (suite.orbitalShare) {
    tests.push(() =>
      testOrbitalShareCapacity(
        suite.orbitalShare!.share,
        suite.orbitalShare!.capacity,
        suite.orbitalShare!.demand
      )
    );
  }

  // Run tests
  const { allPassed, results, failures } = runIntegrityTests(tests);

  // Auto-repair on failure
  let repaired = false;
  if (!allPassed && failures.length > 0) {
    for (const failure of failures) {
      const repairResult = await autoRepairOnTestFailure(failure);
      if (repairResult.status === 'SUCCESS') {
        repaired = true;
      } else if (repairResult.status === 'MAX_ATTEMPTS') {
        throw new Error(
          `STRUCTURAL MODEL FAILURE: Could not repair ${failure.testName} after 5 attempts. ` +
          `Reason: ${repairResult.error}`
        );
      }
    }
  }

  return {
    allPassed,
    results,
    repaired,
  };
}

