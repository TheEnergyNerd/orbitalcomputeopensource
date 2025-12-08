/**
 * Globe-Macro Integration Tests
 * Ensures congestion and failures properly affect global metrics
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createCongestionFrame, createCongestionState } from '../../lib/sim/orbit/congestion';
import { applyCongestionToGlobalMetrics } from '../../lib/sim/link/globeToMacro';
import { createFailureEvent } from '../../lib/sim/orbit/failure';
import { propagateFailure, registerRoute, ACTIVE_ROUTES } from '../../lib/sim/orbit/failurePropagation';

describe('Globe-Macro Consistency', () => {
  beforeEach(() => {
    // Clear active routes before each test
    ACTIVE_ROUTES.length = 0;
  });

  describe('Congestion → Metrics Coupling', () => {
    it('should increase latency multiplier when utilization spikes', () => {
      // Low utilization
      const lowFrame = createCongestionFrame({
        'shell-1': createCongestionState('shell-1', 0.2, 100),
      });
      const lowMultipliers = applyCongestionToGlobalMetrics(lowFrame);
      expect(lowMultipliers.latencyMultiplier).toBeLessThan(1.2);

      // High utilization
      const highFrame = createCongestionFrame({
        'shell-1': createCongestionState('shell-1', 0.9, 1000),
      });
      const highMultipliers = applyCongestionToGlobalMetrics(highFrame);
      expect(highMultipliers.latencyMultiplier).toBeGreaterThan(1.5);
      expect(highMultipliers.latencyMultiplier).toBeGreaterThan(lowMultipliers.latencyMultiplier);
    });

    it('should increase cost multiplier with utilization', () => {
      const frame = createCongestionFrame({
        'shell-1': createCongestionState('shell-1', 0.8, 800),
      });
      const multipliers = applyCongestionToGlobalMetrics(frame);
      expect(multipliers.costMultiplier).toBeGreaterThan(1.0);
      expect(multipliers.costMultiplier).toBeLessThan(2.0);
    });

    it('should calculate volatility index from variance', () => {
      // Low variance (uniform utilization)
      const uniformFrame = createCongestionFrame({
        'shell-1': createCongestionState('shell-1', 0.5, 500),
        'shell-2': createCongestionState('shell-2', 0.5, 500),
      });
      const uniformMultipliers = applyCongestionToGlobalMetrics(uniformFrame);
      
      // High variance (uneven utilization)
      const unevenFrame = createCongestionFrame({
        'shell-1': createCongestionState('shell-1', 0.9, 900),
        'shell-2': createCongestionState('shell-2', 0.1, 100),
      });
      const unevenMultipliers = applyCongestionToGlobalMetrics(unevenFrame);
      
      expect(unevenMultipliers.volatilityIndex).toBeGreaterThan(uniformMultipliers.volatilityIndex);
    });

    it('should update metrics within 1 tick', () => {
      const frame = createCongestionFrame({
        'shell-1': createCongestionState('shell-1', 0.95, 950),
      });
      const multipliers = applyCongestionToGlobalMetrics(frame);
      
      // Metrics should be immediately affected
      expect(multipliers.latencyMultiplier).toBeGreaterThan(1.5);
      expect(multipliers.costMultiplier).toBeGreaterThan(1.4);
    });
  });

  describe('Failure → Routing Disruption', () => {
    it('should propagate failure to affected routes', () => {
      // Register a route
      const route = {
        id: 'route-1',
        shellId: 'shell-1',
        latency: 90,
        cost: 100,
        droppedPackets: 0,
        origin: { lat: 0, lon: 0 },
        destination: { lat: 10, lon: 10 },
      };
      registerRoute(route);

      // Create failure event
      const failure = createFailureEvent(
        'failure-1',
        'shell-1',
        'COLLISION',
        0.75,
        { lat: 5, lon: 5 }
      );

      // Propagate failure
      propagateFailure(failure);

      // Route should be affected
      expect(route.latency).toBeGreaterThan(90);
      expect(route.cost).toBeGreaterThan(100);
      expect(route.droppedPackets).toBeGreaterThan(0);
      expect(failure.affectedRoutes).toContain('route-1');
    });

    it('should increase latency and cost based on severity', () => {
      const route = {
        id: 'route-2',
        shellId: 'shell-1',
        latency: 100,
        cost: 100,
        droppedPackets: 0,
        origin: { lat: 0, lon: 0 },
        destination: { lat: 10, lon: 10 },
      };
      registerRoute(route);

      const lowSeverityFailure = createFailureEvent(
        'failure-low',
        'shell-1',
        'SAT_FAILURE',
        0.25,
        { lat: 5, lon: 5 }
      );
      propagateFailure(lowSeverityFailure);

      const lowLatency = route.latency;
      const lowCost = route.cost;

      // Reset route
      route.latency = 100;
      route.cost = 100;
      route.droppedPackets = 0;

      const highSeverityFailure = createFailureEvent(
        'failure-high',
        'shell-1',
        'COLLISION',
        1.0,
        { lat: 5, lon: 5 }
      );
      propagateFailure(highSeverityFailure);

      expect(route.latency).toBeGreaterThan(lowLatency);
      expect(route.cost).toBeGreaterThan(lowCost);
    });
  });

  describe('Congestion → Futures Volatility', () => {
    it('should increase volatility index when congestion variance is high', () => {
      // Low variance
      const lowVarFrame = createCongestionFrame({
        'shell-1': createCongestionState('shell-1', 0.5, 500),
        'shell-2': createCongestionState('shell-2', 0.5, 500),
      });
      const lowVarMultipliers = applyCongestionToGlobalMetrics(lowVarFrame);

      // High variance
      const highVarFrame = createCongestionFrame({
        'shell-1': createCongestionState('shell-1', 0.95, 950),
        'shell-2': createCongestionState('shell-2', 0.05, 50),
      });
      const highVarMultipliers = applyCongestionToGlobalMetrics(highVarFrame);

      expect(highVarMultipliers.volatilityIndex).toBeGreaterThan(lowVarMultipliers.volatilityIndex);
    });
  });

  describe('Reroute Traffic → Carbon Update', () => {
    it('should increase carbon multiplier with congestion', () => {
      const frame = createCongestionFrame({
        'shell-1': createCongestionState('shell-1', 0.8, 800),
      });
      const multipliers = applyCongestionToGlobalMetrics(frame);
      
      // Carbon should increase due to extra hops
      expect(multipliers.carbonMultiplier).toBeGreaterThan(1.0);
      expect(multipliers.carbonMultiplier).toBeLessThan(1.5);
    });
  });

  describe('System Relaxation', () => {
    it('should relax metrics when congestion is removed', () => {
      // High congestion
      const highFrame = createCongestionFrame({
        'shell-1': createCongestionState('shell-1', 0.9, 900),
      });
      const highMultipliers = applyCongestionToGlobalMetrics(highFrame);

      // No congestion
      const noFrame = createCongestionFrame({
        'shell-1': createCongestionState('shell-1', 0.1, 100),
      });
      const noMultipliers = applyCongestionToGlobalMetrics(noFrame);

      expect(noMultipliers.latencyMultiplier).toBeLessThan(highMultipliers.latencyMultiplier);
      expect(noMultipliers.costMultiplier).toBeLessThan(highMultipliers.costMultiplier);
      expect(noMultipliers.volatilityIndex).toBeLessThan(highMultipliers.volatilityIndex);
    });
  });
});

