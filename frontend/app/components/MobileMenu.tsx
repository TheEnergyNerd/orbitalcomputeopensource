"use client";

import { useState, useEffect } from "react";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function MobileMenu({ isOpen, onClose, children }: MobileMenuProps) {
  const [showHint, setShowHint] = useState(false);

  // Show hint message when menu first opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setShowHint(true);
        // Auto-hide hint after 5 seconds
        const hideTimer = setTimeout(() => {
          setShowHint(false);
        }, 5000);
        return () => clearTimeout(hideTimer);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setShowHint(false);
    }
  }, [isOpen]);

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[199]"
          onClick={onClose}
          onTouchStart={onClose}
          style={{ zIndex: 199 }}
        />
      )}

      {/* Menu */}
      <div
        className={`fixed left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-slate-950 border-r border-slate-800 z-[200] transform transition-transform duration-300 ease-in-out overflow-y-auto pointer-events-auto ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        data-tutorial-mobile-menu
        style={{ zIndex: 200 }}
      >
        <div className="p-4 pointer-events-auto">
          {/* Header with close button and hint */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-white mb-1">Menu</h2>
              {showHint && (
                <p className="text-xs text-gray-400">
                  Access strategy and tools here. Tap the menu icon (☰) in the top-left to reopen this menu anytime.
                </p>
              )}
            </div>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[MobileMenu] Close button clicked');
                onClose();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="p-2 hover:bg-slate-800 rounded-lg transition ml-2 pointer-events-auto z-[102] relative"
              aria-label="Close menu"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Menu content */}
          <div className="space-y-4 pointer-events-auto">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}

