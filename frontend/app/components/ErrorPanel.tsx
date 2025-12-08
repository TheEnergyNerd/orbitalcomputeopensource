"use client";

import { useEffect, useState } from "react";
import { useSimStore } from "../store/simStore";

export default function ErrorPanel() {
  const error = useSimStore((s) => s.error);
  const [errorLog, setErrorLog] = useState<any[]>([]);
  const [lastError, setLastError] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Try to load errors from localStorage
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const log = localStorage.getItem('orbitalCompute_errorLog');
        const last = localStorage.getItem('orbitalCompute_lastError');
        if (log) {
          setErrorLog(JSON.parse(log));
        }
        if (last) {
          setLastError(JSON.parse(last));
        }
      }
    } catch (e) {
      console.warn("[ErrorPanel] Could not load errors from localStorage:", e);
    }
  }, [error]);

  // Don't show backend-related errors - app works without backend
  if (!error) return null;
  
  // Filter out expected backend errors
  const backendErrors = [
    'Invalid state structure',
    'Backend not available',
    'Network Error',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'timeout',
    'ECONNABORTED',
  ];
  
  if (backendErrors.some(err => error.toLowerCase().includes(err.toLowerCase()))) {
    return null; // Don't show backend errors
  }

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] max-w-2xl w-full mx-4">
      <div className="panel-glass rounded-xl p-4 shadow-2xl border-2 border-red-500/50 bg-red-900/20">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-red-400">⚠️ Error Detected</h3>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs font-semibold"
          >
            {showDetails ? "Hide" : "Show"} Details
          </button>
        </div>
        <div className="text-sm text-gray-200 mb-2">{error}</div>
        
        {showDetails && (
          <div className="mt-3 pt-3 border-t border-red-500/30">
            <div className="text-xs text-gray-300 mb-2">
              <strong>To debug Error 5 (timeout):</strong>
            </div>
            <div className="bg-gray-900/50 rounded p-2 mb-2 font-mono text-xs text-gray-300">
              <div className="mb-1">Run in browser console:</div>
              <div className="text-accent-blue">localStorage.getItem('orbitalCompute_errorLog')</div>
              <div className="text-gray-500 mt-1">or</div>
              <div className="text-accent-blue">localStorage.getItem('orbitalCompute_lastError')</div>
            </div>
            
            {lastError && (
              <div className="mt-2 p-2 bg-gray-900/50 rounded text-xs">
                <div className="text-gray-400 mb-1">Last Error Details:</div>
                <pre className="text-gray-300 overflow-auto max-h-40">
                  {JSON.stringify(lastError, null, 2)}
                </pre>
              </div>
            )}
            
            {errorLog.length > 0 && (
              <div className="mt-2 text-xs text-gray-400">
                {errorLog.length} error(s) logged. Check localStorage for full log.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

