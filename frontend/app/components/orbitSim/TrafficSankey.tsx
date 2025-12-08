"use client";

import React, { useMemo } from 'react';
import type { RouterPolicy } from '../../lib/ai/routerTypes';
import { JOB_TYPES, DESTS } from '../../lib/ai/routerTypes';

interface TrafficSankeyProps {
  routerPolicy: RouterPolicy;
  totalJobs: number; // Total jobs per year
}

export default function TrafficSankey({ routerPolicy, totalJobs }: TrafficSankeyProps) {
  const flows = useMemo(() => {
    const jobTypeWeights = { realtime: 0.3, interactive: 0.4, batch: 0.2, cold: 0.1 };
    const flows: Array<{ from: string; to: string; value: number; color: string }> = [];

    JOB_TYPES.forEach(jobType => {
      const jobCount = totalJobs * (jobTypeWeights[jobType.id as keyof typeof jobTypeWeights] || 0);
      const policyRow = routerPolicy.jobs[jobType.id];

      DESTS.forEach(dest => {
        const flowValue = jobCount * (policyRow[dest.id] || 0);
        if (flowValue > 0) {
          flows.push({
            from: jobType.label,
            to: dest.label,
            value: flowValue,
            color: dest.id === 'orbit' ? '#00d4ff' : dest.id === 'groundEdge' ? '#10b981' : '#f59e0b',
          });
        }
      });
    });

    return flows;
  }, [routerPolicy, totalJobs]);

  const maxFlow = Math.max(...flows.map(f => f.value), 1);

  return (
    <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700">
      <div className="text-xs text-slate-400 mb-3">Traffic Flow (Jobs/Year)</div>
      <div className="space-y-2">
        {flows.map((flow, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="w-20 text-[10px] text-slate-300">{flow.from}</div>
            <div className="flex-1 relative h-4 bg-slate-800 rounded overflow-hidden">
              <div
                className="h-full rounded transition-all"
                style={{
                  width: `${(flow.value / maxFlow) * 100}%`,
                  backgroundColor: flow.color,
                  opacity: 0.7,
                }}
              />
            </div>
            <div className="w-24 text-[10px] text-slate-300">{flow.to}</div>
            <div className="w-16 text-[10px] text-slate-400 text-right">
              {flow.value.toFixed(0)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


