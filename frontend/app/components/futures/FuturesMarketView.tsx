"use client";

import { useEffect, useState } from 'react';
import FuturesConeVisualization from './FuturesConeVisualization';
import { useSimulationStore } from '@/app/store/simulationStore';
import type { StrategyId } from '@/app/lib/futures/types';

export default function FuturesMarketView() {
  const [activeType, setActiveType] = useState<'orbit' | 'ground' | 'both'>('both');
  const [hoveredPoint, setHoveredPoint] = useState<{ type: 'orbit' | 'ground'; point: any } | null>(null);
  
  const timeline = useSimulationStore((s) => s.timeline);
  const config = useSimulationStore((s) => s.config);
  const currentYear = timeline.length > 0 ? timeline[timeline.length - 1].year : config.startYear;
  
  // Futures state from store
  const futuresForecast = useSimulationStore((s) => s.futuresForecast);
  const futuresSentiment = useSimulationStore((s) => s.futuresSentiment);
  const isRunningFutures = useSimulationStore((s) => s.isRunningFutures);
  const activeStrategy = useSimulationStore((s) => s.activeStrategy);
  const strategies = useSimulationStore((s) => s.strategies);
  const runFutures = useSimulationStore((s) => s.runFutures);
  const setStrategy = useSimulationStore((s) => s.setStrategy);
  
  // Calculate honest sentiment score from futures forecast
  const calculateSentimentLabel = () => {
    if (!futuresForecast) return { label: 'Neutral on Orbit', score: 0, color: 'text-gray-400' };
    
    // Inputs from the futures engine
    const pOrbitCheaper = futuresForecast.probOrbitCheaperByHorizon; // 0..1
    const horizonYear = futuresForecast.points.length > 0 
      ? futuresForecast.points[futuresForecast.points.length - 1].year 
      : currentYear + 20;
    const horizonYears = horizonYear - currentYear;
    
    // Sentiment score in [-1, 1]
    // pOrbitCheaper = 1.0 => sentimentScore = +1.0 (strongly bullish)
    // pOrbitCheaper = 0.5 => sentimentScore = 0.0 (neutral)
    // pOrbitCheaper = 0.0 => sentimentScore = -1.0 (strongly bearish)
    const sentimentScore = (pOrbitCheaper - 0.5) * 2;
    
    // Classify
    let label: "Bullish on Orbit" | "Neutral on Orbit" | "Bearish on Orbit";
    let color: string;
    
    if (sentimentScore > 0.2) {
      label = "Bullish on Orbit";
      color = "text-green-400";
    } else if (sentimentScore < -0.2) {
      label = "Bearish on Orbit";
      color = "text-red-400";
    } else {
      label = "Neutral on Orbit";
      color = "text-gray-400";
    }
    
    return { label, score: sentimentScore, color, pOrbitCheaper, horizonYear };
  };
  
  const sentimentInfo = calculateSentimentLabel();
  
  // Run futures on mount and when strategy changes
  useEffect(() => {
    if (!futuresForecast) {
      runFutures(1000);
    }
  }, [futuresForecast, runFutures]);
  
  useEffect(() => {
    // Re-run futures when strategy changes
    runFutures(1000);
  }, [activeStrategy, runFutures]);
  
  if (!futuresForecast || isRunningFutures) {
    return (
      <div className="fixed inset-0 pt-16 overflow-y-auto overflow-x-hidden pointer-events-none z-10">
        <div className="flex items-center justify-center h-full pointer-events-auto">
          <div className="text-center">
            <div className="text-gray-400 mb-2">
              {isRunningFutures ? 'Running Monte Carlo simulation...' : 'Loading forecast...'}
            </div>
            {isRunningFutures && (
              <div className="text-xs text-gray-500">Running 1,000 futures scenarios</div>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="fixed inset-0 pt-16 overflow-y-auto overflow-x-hidden pointer-events-none z-10">
      <div className="w-full p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 pointer-events-auto pb-8 max-w-[100vw]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 sm:mb-2">Futures Market</h1>
          <p className="text-gray-400 text-xs sm:text-sm">
            Forward uncertainty envelope for space compute vs ground compute economics
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Strategy selector */}
          <div className="flex gap-2 bg-gray-800 rounded-lg p-1">
            {(Object.keys(strategies) as StrategyId[]).map((strategyId) => (
              <button
                key={strategyId}
                onClick={() => setStrategy(strategyId)}
                className={`px-3 py-1 text-xs rounded transition capitalize ${
                  activeStrategy === strategyId
                    ? 'bg-cyan-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {strategyId}
              </button>
            ))}
          </div>
          
          {/* Run futures button */}
          <button
            onClick={() => runFutures(1000)}
            disabled={isRunningFutures}
            className={`px-4 py-2 text-xs rounded transition ${
              isRunningFutures
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-cyan-500 text-white hover:bg-cyan-600'
            }`}
          >
            {isRunningFutures ? 'Running...' : 'Run 1,000 Futures'}
          </button>
          
          {/* View toggle */}
          <div className="flex gap-2 bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setActiveType('orbit')}
              className={`px-3 py-1 text-xs rounded transition ${
                activeType === 'orbit'
                  ? 'bg-cyan-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Orbit
            </button>
            <button
              onClick={() => setActiveType('ground')}
              className={`px-3 py-1 text-xs rounded transition ${
                activeType === 'ground'
                  ? 'bg-red-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Ground
            </button>
            <button
              onClick={() => setActiveType('both')}
              className={`px-3 py-1 text-xs rounded transition ${
                activeType === 'both'
                  ? 'bg-purple-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Both
            </button>
          </div>
        </div>
      </div>
      
      {/* Probability indicator */}
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-400 mb-1">AI Forecast Probability</div>
            <div className="text-2xl font-bold text-white">
              {(futuresForecast.probOrbitCheaperByHorizon * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              chance orbit is cheaper than ground by {futuresForecast.points[futuresForecast.points.length - 1]?.year || currentYear + 20}
            </div>
          </div>
          
          <div className="text-xs text-gray-400 space-y-1">
            <div>
              Sentiment: <span className={sentimentInfo.color}>
                {sentimentInfo.label}
              </span>
            </div>
            {futuresSentiment && (
              <div>
                Volatility: {(futuresSentiment.volatilityLevel * 100).toFixed(0)}%
              </div>
            )}
            {process.env.NODE_ENV === 'development' && (
              <div className="mt-2 p-2 bg-gray-900/50 rounded text-xs font-mono">
                <div>pOrbitCheaper: {sentimentInfo.pOrbitCheaper?.toFixed(2) ?? 'N/A'}</div>
                <div>sentimentScore: {sentimentInfo.score.toFixed(2)}</div>
                <div>label: {sentimentInfo.label}</div>
                <div>horizonYear: {sentimentInfo.horizonYear}</div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Cone visualizations */}
      <div className="space-y-4 sm:space-y-6 mb-4 sm:mb-6">
        {(activeType === 'orbit' || activeType === 'both') && (
          <div className="bg-gray-900/50 rounded-lg p-4 sm:p-6 border border-gray-700 mb-4 sm:mb-0">
            <h2 className="text-lg font-semibold text-green-400 mb-4">Orbit Futures</h2>
            <div className="w-full overflow-x-auto">
              <FuturesConeVisualization
                forecast={futuresForecast}
                type="orbit"
                width={800}
                height={400}
                onHover={(point) => setHoveredPoint(point ? { type: 'orbit', point } : null)}
                animated={true}
              />
            </div>
          </div>
        )}
        
        {(activeType === 'ground' || activeType === 'both') && (
          <div className="bg-gray-900/50 rounded-lg p-4 sm:p-6 border border-gray-700">
            <h2 className="text-lg font-semibold text-red-400 mb-4">Ground Futures</h2>
            <div className="w-full overflow-x-auto">
              <FuturesConeVisualization
                forecast={futuresForecast}
                type="ground"
                width={800}
                height={400}
                onHover={(point) => setHoveredPoint(point ? { type: 'ground', point } : null)}
                animated={true}
              />
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

