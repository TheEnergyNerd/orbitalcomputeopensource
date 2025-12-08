/**
 * Integrity Tests
 * Authoritative validation that must never be bypassed, clamped, or softened
 */

export interface IntegrityTestResult {
  testName: string;
  passed: boolean;
  error?: string;
  details?: Record<string, any>;
}

/**
 * Test: Total compute must be conserved
 * Input compute = Output compute (no loss or creation)
 */
export function testTotalComputeConserved(
  inputCompute: number,
  outputCompute: number,
  tolerance: number = 0.01
): IntegrityTestResult {
  const diff = Math.abs(inputCompute - outputCompute);
  const passed = diff <= tolerance * inputCompute;

  return {
    testName: 'totalComputeConserved',
    passed,
    error: passed ? undefined : `Compute not conserved: input=${inputCompute}, output=${outputCompute}, diff=${diff}`,
    details: { inputCompute, outputCompute, diff, tolerance },
  };
}

/**
 * Test: No negative costs allowed
 */
export function testNoNegativeCosts(costs: Record<string, number>): IntegrityTestResult {
  const negativeCosts = Object.entries(costs).filter(([_, cost]) => cost < 0);
  const passed = negativeCosts.length === 0;

  return {
    testName: 'noNegativeCosts',
    passed,
    error: passed ? undefined : `Negative costs found: ${JSON.stringify(negativeCosts)}`,
    details: { negativeCosts },
  };
}

/**
 * Test: Latency must respect physics lower bound
 * latency >= distance / c + orbitalDelay
 */
export function testLatencyPhysicsBound(
  latency: number,
  distanceKm: number,
  orbitalDelayMs: number
): IntegrityTestResult {
  const SPEED_OF_LIGHT_KM_S = 299792.458;
  const physicsLowerBound = (distanceKm / SPEED_OF_LIGHT_KM_S) * 1000 + orbitalDelayMs;
  const passed = latency >= physicsLowerBound;

  return {
    testName: 'latencyPhysicsBound',
    passed,
    error: passed ? undefined : `Latency ${latency}ms violates physics bound ${physicsLowerBound.toFixed(2)}ms`,
    details: { latency, physicsLowerBound, distanceKm, orbitalDelayMs },
  };
}

/**
 * Test: Carbon decline rate must not exceed maximum transition rate
 */
export function testCarbonDeclineRate(
  carbonSeries: number[],
  maxTransitionRate: number = 0.5 // 50% per year max
): IntegrityTestResult {
  if (carbonSeries.length < 2) {
    return {
      testName: 'carbonDeclineRate',
      passed: true,
      details: { reason: 'Insufficient data points' },
    };
  }

  const violations: Array<{ year: number; rate: number }> = [];

  for (let i = 1; i < carbonSeries.length; i++) {
    const prev = carbonSeries[i - 1];
    const curr = carbonSeries[i];
    if (prev <= 0) continue;

    const declineRate = (prev - curr) / prev;
    if (declineRate > maxTransitionRate) {
      violations.push({ year: i, rate: declineRate });
    }
  }

  const passed = violations.length === 0;

  return {
    testName: 'carbonDeclineRate',
    passed,
    error: passed ? undefined : `Carbon decline rate violations: ${JSON.stringify(violations)}`,
    details: { violations, maxTransitionRate },
  };
}

/**
 * Test: Orbital share must not exceed shell capacity
 */
export function testOrbitalShareCapacity(
  orbitalShare: number,
  shellCapacity: number,
  totalDemand: number
): IntegrityTestResult {
  const orbitalCompute = orbitalShare * totalDemand;
  const passed = orbitalCompute <= shellCapacity;

  return {
    testName: 'orbitalShareCapacity',
    passed,
    error: passed ? undefined : `Orbital share ${orbitalShare} exceeds capacity: ${orbitalCompute} > ${shellCapacity}`,
    details: { orbitalShare, shellCapacity, orbitalCompute, totalDemand },
  };
}

/**
 * Run all integrity tests
 */
export function runIntegrityTests(tests: Array<() => IntegrityTestResult>): {
  allPassed: boolean;
  results: IntegrityTestResult[];
  failures: IntegrityTestResult[];
} {
  const results = tests.map(test => test());
  const failures = results.filter(r => !r.passed);
  const allPassed = failures.length === 0;

  return {
    allPassed,
    results,
    failures,
  };
}

