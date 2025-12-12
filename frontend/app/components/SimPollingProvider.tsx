"use client";

import { ReactNode, useEffect } from "react";
import { useSimPolling } from "../hooks/useSimPolling";

export function SimPollingProvider({ children }: { children: ReactNode }) {
  useSimPolling();

  // Suppress CORS console errors when backend isn't available
  // NOTE: Browser-level network errors (shown in red in console) cannot be fully suppressed
  // from JavaScript, but we can suppress JavaScript console.error/warn calls about them
  useEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;
    
    // Override console.error to filter CORS errors
    console.error = (...args: any[]) => {
      const message = args.join(' ');
      // Suppress CORS-related errors
      if (
        message.includes('Cross-Origin Request Blocked') ||
        message.includes('CORS request did not succeed') ||
        message.includes('localhost:8000') ||
        message.includes('Failed to fetch') ||
        message.includes('NetworkError')
      ) {
        return; // Silently ignore
      }
      originalError.apply(console, args);
    };
    
    // Override console.warn to filter CORS warnings
    console.warn = (...args: any[]) => {
      const message = args.join(' ');
      // Suppress CORS-related warnings
      if (
        message.includes('Cross-Origin Request Blocked') ||
        message.includes('CORS request did not succeed') ||
        message.includes('localhost:8000') ||
        message.includes('Failed to fetch') ||
        message.includes('NetworkError')
      ) {
        return; // Silently ignore
      }
      originalWarn.apply(console, args);
    };
    
    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  return <>{children}</>;
}

