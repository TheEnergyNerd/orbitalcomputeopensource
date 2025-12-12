"use client";

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { ScenarioSeriesPoint } from "../../lib/orbitSim/selectors/scenarios";

interface MultiScenarioChartProps {
  title: string;
  data: ScenarioSeriesPoint[];
  metric: string;
  currentYear?: number;
}

/**
 * Multi-Scenario Comparison Chart
 * Shows baseline (solid), bear (dashed), bull (bright) lines
 */
export default function MultiScenarioChart({ 
  title, 
  data, 
  metric,
  currentYear 
}: MultiScenarioChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Responsive dimensions - use container height
    const container = svgRef.current.parentElement;
    const containerWidth = container?.clientWidth || 600;
    const containerHeight = container?.clientHeight || 350;
    const isMobile = containerWidth < 640;
    // Make width responsive on desktop - use more of the available space
    // CRITICAL FIX: Use full container width minus padding, not 90% which causes cutoff
    const width = isMobile 
      ? Math.min(containerWidth - 32, 600)
      : Math.max(600, containerWidth - 32); // Use full width minus padding on desktop
    const height = containerHeight || (isMobile ? 300 : 600); // Match container height (600px on desktop for more space)
    const margin = isMobile 
      ? { top: 20, right: 30, bottom: 100, left: 50 } // Increased bottom margin for mobile to prevent cutoff
      : { top: 25, right: 80, bottom: 180, left: 80 }; // CRITICAL: Increased bottom to 180px for desktop to prevent x-axis cutoff
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Set up scales
    const allValues = data.flatMap(d => [d.BASELINE, d.ORBITAL_BEAR, d.ORBITAL_BULL]);
    const maxValue = d3.max(allValues) ?? 1;
    const minValue = d3.min(allValues) ?? 0;

    const xScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.year) as [number, number])
      .range([0, innerWidth])
      .nice();

    const yScale = d3.scaleLinear()
      .domain([Math.max(0, minValue > 0 ? minValue * 0.9 : 0), maxValue * 1.1])
      .range([innerHeight, 0])
      .nice();

    // Create main group
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => `${d}`);
    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d => {
        if (metric.includes("$")) {
          return `$${Number(d).toFixed(0)}`;
        } else if (metric.includes("%")) {
          return `${(Number(d) * 100).toFixed(0)}%`;
        } else if (metric.includes("tCO₂")) {
          return `${(Number(d) / 1000).toFixed(0)}k`;
        }
        return `${Number(d).toFixed(1)}`;
      });

    const xAxisGroup = g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis);
    
    xAxisGroup.selectAll("text")
      .style("font-size", isMobile ? "7px" : "9px")
      .style("fill", "#94a3b8");
    
    xAxisGroup.selectAll("line, path")
      .style("stroke", "#475569");

    const yAxisGroup = g.append("g")
      .call(yAxis);
    
    yAxisGroup.selectAll("text")
      .style("font-size", isMobile ? "9px" : "11px")
      .style("fill", "#94a3b8");
    
    yAxisGroup.selectAll("line, path")
      .style("stroke", "#475569");

    // Axis labels
    // CRITICAL FIX: Reduce padding between x-axis and label on desktop (was 145px, now 25px)
    const xAxisLabelOffset = isMobile ? margin.bottom - 5 : 25; // 25px on desktop, 5px on mobile
    g.append("text")
      .attr("transform", `translate(${innerWidth / 2},${innerHeight + xAxisLabelOffset})`)
      .style("text-anchor", "middle")
      .style("font-size", isMobile ? "10px" : "12px")
      .style("fill", "#94a3b8")
      .text("Year");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -(margin.left - 15))
      .attr("x", -innerHeight / 2)
      .style("text-anchor", "middle")
      .style("font-size", isMobile ? "10px" : "12px")
      .style("fill", "#94a3b8")
      .text(metric);

    // Baseline line (solid, emerald)
    const baselineLine = d3.line<ScenarioSeriesPoint>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.BASELINE))
      .curve(d3.curveMonotoneX);

    // Bear line (dashed, orange)
    const bearLine = d3.line<ScenarioSeriesPoint>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.ORBITAL_BEAR))
      .curve(d3.curveMonotoneX);

    // Bull line (bright, cyan)
    const bullLine = d3.line<ScenarioSeriesPoint>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.ORBITAL_BULL))
      .curve(d3.curveMonotoneX);

    // Draw lines with transitions - fix D3 enter/update pattern
    let baselinePath = g.select<SVGPathElement>("path.baseline-line");
    if (baselinePath.empty()) {
      baselinePath = g.append("path")
        .attr("class", "baseline-line")
        .attr("fill", "none")
        .attr("stroke", "#10b981")
        .attr("stroke-width", 2.5);
    }
    baselinePath
      .datum(data)
      .transition()
      .duration(400)
      .ease(d3.easeQuadOut)
      .attr("d", baselineLine);

    let bearPath = g.select<SVGPathElement>("path.bear-line");
    if (bearPath.empty()) {
      bearPath = g.append("path")
        .attr("class", "bear-line")
        .attr("fill", "none")
        .attr("stroke", "#f97316")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5");
    }
    bearPath
      .datum(data)
      .transition()
      .duration(400)
      .ease(d3.easeQuadOut)
      .attr("d", bearLine);

    let bullPath = g.select<SVGPathElement>("path.bull-line");
    if (bullPath.empty()) {
      bullPath = g.append("path")
        .attr("class", "bull-line")
        .attr("fill", "none")
        .attr("stroke", "#06b6d4")
        .attr("stroke-width", 2.5);
    }
    bullPath
      .datum(data)
      .transition()
      .duration(400)
      .ease(d3.easeQuadOut)
      .attr("d", bullLine);

    // Add current year indicator with transition
    const yearLine = g.select<SVGLineElement>("line.year-indicator");
    if (currentYear) {
      const x = xScale(currentYear);
      yearLine.enter()
        .append("line")
        .attr("class", "year-indicator")
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4,4")
        .attr("opacity", 0.5)
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .merge(yearLine)
        .transition()
        .duration(300)
        .ease(d3.easeQuadOut)
        .attr("x1", x)
        .attr("x2", x);
    } else {
      yearLine.remove();
    }

    // Add hover interaction
    const overlay = g.append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .on("mousemove", function(event) {
        const [mouseX] = d3.pointer(event);
        const year = Math.round(xScale.invert(mouseX));
        const point = data.find(d => Math.abs(d.year - year) < 2) || data[data.length - 1];
        
        if (tooltipRef.current && point) {
          tooltipRef.current.style.display = "block";
          tooltipRef.current.style.left = `${event.clientX + 10}px`;
          tooltipRef.current.style.top = `${event.clientY - 10}px`;
          
          const formatValue = (val: number) => {
            if (metric.includes("$")) {
              return `$${val.toFixed(0)}`;
            } else if (metric.includes("%")) {
              return `${(val * 100).toFixed(1)}%`;
            } else if (metric.includes("tCO₂")) {
              return `${(val / 1000).toFixed(1)}k tCO₂`;
            }
            return val.toFixed(1);
          };
          
          tooltipRef.current.innerHTML = `
            <div><strong>${point.year}</strong></div>
            <div style="color: #10b981">Baseline: ${formatValue(point.BASELINE)}</div>
            <div style="color: #f97316">Bear: ${formatValue(point.ORBITAL_BEAR)}</div>
            <div style="color: #06b6d4">Bull: ${formatValue(point.ORBITAL_BULL)}</div>
          `;
        }
      })
      .on("mouseout", () => {
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "none";
        }
      });

    // Add legend
    const legend = g.append("g")
      .attr("transform", `translate(${innerWidth - 120}, 20)`);

    const legendData = [
      { label: "Baseline", color: "#10b981", dash: "" },
      { label: "Bear", color: "#f97316", dash: "5,5" },
      { label: "Bull", color: "#06b6d4", dash: "" },
    ];

    legendData.forEach((item, i) => {
      const y = i * 20;
      legend.append("line")
        .attr("x1", 0)
        .attr("x2", 12)
        .attr("y1", y + 6)
        .attr("y2", y + 6)
        .attr("stroke", item.color)
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", item.dash);

      legend.append("text")
        .attr("x", 16)
        .attr("y", y + 10)
        .style("font-size", "11px")
        .style("fill", "#94a3b8")
        .text(item.label);
    });

  }, [data, metric, currentYear]);

  // Calculate responsive dimensions for viewBox (use same logic as useEffect)
  // CRITICAL FIX: Use larger dimensions for desktop to prevent cutoff
  const containerWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth - 64, 1200) : 600;
  const isMobile = containerWidth < 640;
  const chartWidth = containerWidth;
  const chartHeight = isMobile ? 300 : 500; // Match container height (500px on desktop)

  return (
    <div className="relative w-full h-full">
      <svg 
        ref={svgRef} 
        className="w-full h-full"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio="xMidYMid meet"
      />
      <div
        ref={tooltipRef}
        className="absolute bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white pointer-events-none z-50"
        style={{ display: "none" }}
      />
    </div>
  );
}

