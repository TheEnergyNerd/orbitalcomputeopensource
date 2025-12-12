"use client";

import ConstraintsRiskView from "../components/constraints/ConstraintsRiskView";
import DebugExportPanel from "../components/DebugExportPanel";

export default function DataPage() {
  return (
    <div>
      <ConstraintsRiskView />
      <DebugExportPanel />
    </div>
  );
}

