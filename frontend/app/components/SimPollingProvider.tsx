"use client";

import { useSimPolling } from "../hooks/useSimPolling";

export function SimPollingProvider({ children }: { children: React.ReactNode }) {
  useSimPolling();
  return <>{children}</>;
}

