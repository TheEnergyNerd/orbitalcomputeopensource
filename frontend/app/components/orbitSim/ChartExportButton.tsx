"use client";

import React from "react";
import JSZip from "jszip";

interface ChartExportButtonProps {
  chartId: string;
  chartTitle: string;
}

/**
 * Chart Export Button - Exports chart as PNG and adds to ZIP
 */
export default function ChartExportButton({ chartId, chartTitle }: ChartExportButtonProps) {
  const handleExport = async () => {
    try {
      const chartElement = document.querySelector(`[data-chart="${chartId}"]`);
      if (!chartElement) {
        console.error(`Chart element not found: ${chartId}`);
        return;
      }

      const svgElement = chartElement.querySelector("svg");
      if (!svgElement) {
        console.error(`SVG element not found in chart: ${chartId}`);
        return;
      }

      // Clone SVG to avoid modifying original
      const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;
      
      // Set explicit dimensions
      const width = svgElement.clientWidth || 800;
      const height = svgElement.clientHeight || 600;
      clonedSvg.setAttribute("width", width.toString());
      clonedSvg.setAttribute("height", height.toString());

      // Convert SVG to blob
      const svgData = new XMLSerializer().serializeToString(clonedSvg);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(svgBlob);

      // Create image from SVG
      const img = new Image();
      img.onload = () => {
        // Create canvas
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        
        if (!ctx) {
          console.error("Failed to get canvas context");
          URL.revokeObjectURL(svgUrl);
          return;
        }

        // Draw white background
        ctx.fillStyle = "#0f172a"; // slate-950
        ctx.fillRect(0, 0, width, height);

        // Draw image
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to PNG
        canvas.toBlob((blob) => {
          if (!blob) {
            console.error("Failed to create PNG blob");
            URL.revokeObjectURL(svgUrl);
            return;
          }

          // Download PNG
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${chartTitle.replace(/\s+/g, "_")}_${Date.now()}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          URL.revokeObjectURL(svgUrl);
        }, "image/png");
      };

      img.onerror = () => {
        console.error("Failed to load SVG image");
        URL.revokeObjectURL(svgUrl);
      };

      img.src = svgUrl;
    } catch (error) {
      console.error("Error exporting chart:", error);
    }
  };

  return (
    <button
      onClick={handleExport}
      className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded transition"
      title={`Export ${chartTitle} as PNG`}
    >
      📥 PNG
    </button>
  );
}

/**
 * Export All Charts as ZIP
 */
export function ExportAllChartsButton() {
  const handleExportAll = async () => {
    try {
      const zip = new JSZip();
      const chartElements = document.querySelectorAll("[data-chart]");
      
      if (chartElements.length === 0) {
        alert("No charts found to export");
        return;
      }

      let exportedCount = 0;

      for (const chartElement of Array.from(chartElements)) {
        const chartId = chartElement.getAttribute("data-chart");
        if (!chartId) continue;

        const svgElement = chartElement.querySelector("svg");
        if (!svgElement) continue;

        try {
          const width = svgElement.clientWidth || 800;
          const height = svgElement.clientHeight || 600;
          const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;
          clonedSvg.setAttribute("width", width.toString());
          clonedSvg.setAttribute("height", height.toString());

          const svgData = new XMLSerializer().serializeToString(clonedSvg);
          const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
          const svgUrl = URL.createObjectURL(svgBlob);

          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext("2d");
              
              if (!ctx) {
                reject(new Error("Failed to get canvas context"));
                return;
              }

              ctx.fillStyle = "#0f172a";
              ctx.fillRect(0, 0, width, height);
              ctx.drawImage(img, 0, 0, width, height);

              canvas.toBlob((blob) => {
                if (!blob) {
                  reject(new Error("Failed to create PNG blob"));
                  return;
                }

                blob.arrayBuffer().then((buffer) => {
                  zip.file(`${chartId.replace(/-/g, "_")}.png`, buffer);
                  URL.revokeObjectURL(svgUrl);
                  exportedCount++;
                  resolve();
                });
              }, "image/png");
            };

            img.onerror = () => {
              URL.revokeObjectURL(svgUrl);
              reject(new Error("Failed to load SVG image"));
            };

            img.src = svgUrl;
          });
        } catch (error) {
          console.error(`Error exporting chart ${chartId}:`, error);
        }
      }

      if (exportedCount === 0) {
        alert("No charts could be exported");
        return;
      }

      // Generate ZIP
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orbital_compute_charts_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert(`Exported ${exportedCount} charts as ZIP`);
    } catch (error) {
      console.error("Error exporting all charts:", error);
      alert("Error exporting charts. Check console for details.");
    }
  };

  return (
    <button
      onClick={handleExportAll}
      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition shadow-lg relative z-50 pointer-events-auto"
      title="Export all charts as PNG ZIP"
      style={{ zIndex: 9999 }}
    >
      📦 Export All Charts (ZIP)
    </button>
  );
}

