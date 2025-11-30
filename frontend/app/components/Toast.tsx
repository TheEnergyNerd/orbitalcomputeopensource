"use client";

import { useEffect, useState } from "react";
import { getToasts, subscribe } from "../lib/utils/toast";

export default function Toast() {
  const [toasts, setToasts] = useState(getToasts());

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      setToasts(getToasts());
    });
    return unsubscribe;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-lg shadow-lg border text-sm font-semibold min-w-[300px] max-w-md ${
            toast.type === 'error'
              ? 'bg-red-900/90 border-red-500 text-red-100'
              : toast.type === 'warning'
              ? 'bg-orange-900/90 border-orange-500 text-orange-100'
              : 'bg-blue-900/90 border-blue-500 text-blue-100'
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

