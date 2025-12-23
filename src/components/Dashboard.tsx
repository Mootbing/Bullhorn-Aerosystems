'use client';

import { useRadarStore } from '@/store/gameStore';
import { useEffect, useCallback, useState } from 'react';
import { EntityInfoPanel } from './entities/EntityInfoPanel';
import { SearchBar } from './SearchBar';
import { ModeBar } from './ModeBar';
import { useGlobalInput } from '@/hooks/useInputManager';
import { InputAction } from '@/lib/inputManager';

export function Dashboard() {
  const gameState = useRadarStore((state) => state.gameState);
  const selectEntity = useRadarStore((state) => state.selectEntity);
  const locationReady = useRadarStore((state) => state.locationReady);
  const toasts = useRadarStore((state) => state.toasts);
  
  // Delay animation start until after loading screen fades
  const [animateIn, setAnimateIn] = useState(false);
  
  useEffect(() => {
    if (locationReady && !animateIn) {
      // Wait for loading screen fade (700ms + 200ms delay)
      const timer = setTimeout(() => {
        setAnimateIn(true);
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [locationReady, animateIn]);

  const handleClosePanel = useCallback(() => {
    selectEntity(null);
  }, [selectEntity]);

  // Handle input actions from centralized input manager
  const handleGlobalAction = useCallback((action: InputAction) => {
    switch (action) {
      case 'deselect':
        handleClosePanel();
        break;
      case 'select_hovered':
        if (gameState.hoveredEntity) {
          selectEntity(gameState.hoveredEntity);
        }
        break;
    }
  }, [handleClosePanel, gameState.hoveredEntity, selectEntity]);
  
  useGlobalInput(handleGlobalAction);

  return (
    <div className="absolute inset-0 pointer-events-none font-mono">
      {/* Entity Info Panel - Bottom Left */}
      <div className="absolute bottom-14 left-4 pointer-events-auto">
        <EntityInfoPanel onClose={handleClosePanel} />
      </div>
      
      {/* Bottom Bar */}
      <div className="absolute bottom-0 left-0 right-0 p-3 pointer-events-auto">
        <div className="flex items-stretch gap-3">
          {/* Left: Mode Bar */}
          <div 
            className={`shrink-0 ${animateIn ? 'bottom-bar-item animate-in' : 'bottom-bar-item'}`} 
            style={{ '--item-index': 0 } as React.CSSProperties}
          >
            <ModeBar />
          </div>
          
          {/* Center: Search Bar - spans all available space */}
          <div 
            className={`flex-1 min-w-0 ${animateIn ? 'bottom-bar-item animate-in' : 'bottom-bar-item'}`}
            style={{ '--item-index': 1 } as React.CSSProperties}
          >
            <SearchBar />
          </div>
      
          {/* Right: Hints & Version */}
          <div 
            className={`shrink-0 flex flex-col justify-center text-right bg-black/30 backdrop-blur-md border border-[#333] px-3 ${animateIn ? 'bottom-bar-item animate-in' : 'bottom-bar-item'}`}
            style={{ '--item-index': 2 } as React.CSSProperties}
          >
            <div className="text-[8px] text-[#555]">WASD: move | ⇧+W/S: zoom | Q/E: tilt | TAB: filter | SPACE: search</div>
            <div className="text-[8px] text-[#555]">Bullhorn Aerosystems (commercial - v1.0.2)</div>
          </div>
        </div>
      </div>
      
      {/* Toast notifications - Bottom Right, stacked from bottom */}
      {/* New toasts appear at bottom, old ones rise up and fade out at top */}
      <div className="absolute bottom-20 right-4 pointer-events-none flex flex-col gap-2">
        {toasts.map((toast, index) => {
          // Calculate opacity: index 0 = oldest (top) = faded, higher index = newer (bottom) = full
          // Distance from bottom: 0 = at bottom (newest), higher = further up (older)
          const distanceFromBottom = toasts.length - 1 - index;
          const baseOpacity = Math.max(0.25, 1 - distanceFromBottom * 0.12);
          
          return (
            <div 
              key={toast.id}
              className={`transition-all duration-300 ${
                toast.exiting 
                  ? 'opacity-0 -translate-y-2 scale-95' 
                  : 'translate-y-0 scale-100'
              }`}
              style={{
                opacity: toast.exiting ? 0 : baseOpacity,
                transitionDelay: toast.exiting ? '0ms' : `${index * 30}ms`,
              }}
            >
              <div 
                className="backdrop-blur-sm border px-4 py-2 text-xs tracking-widest whitespace-nowrap"
                style={{
                  backgroundColor: `rgba(0, 0, 0, ${0.7 + distanceFromBottom * 0.03})`,
                  borderColor: `rgba(51, 51, 51, ${baseOpacity})`,
                  color: `rgba(255, 255, 255, ${baseOpacity})`,
                }}
              >
                {toast.message}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Bottom bar animation styles */}
      <style jsx>{`
        .bottom-bar-item {
          opacity: 0;
          transform: translateY(24px) scale(0.95);
        }
        
        .bottom-bar-item.animate-in {
          animation: popUpFadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          animation-delay: calc(var(--item-index) * 0.12s);
        }
        
        @keyframes popUpFadeIn {
          0% {
            opacity: 0;
            transform: translateY(24px) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
