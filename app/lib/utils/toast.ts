/**
 * Simple toast notification system
 */

let toastId = 0;
const toasts: Array<{ id: number; message: string; type: 'error' | 'warning' | 'info' }> = [];
let listeners: Array<() => void> = [];

export function showToast(message: string, type: 'error' | 'warning' | 'info' = 'error') {
  const id = toastId++;
  toasts.push({ id, message, type });
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    const index = toasts.findIndex(t => t.id === id);
    if (index >= 0) {
      toasts.splice(index, 1);
      notifyListeners();
    }
  }, 3000);
  
  notifyListeners();
}

export function getToasts() {
  return [...toasts];
}

export function subscribe(callback: () => void) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter(l => l !== callback);
  };
}

function notifyListeners() {
  listeners.forEach(l => l());
}

