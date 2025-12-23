'use client';

import { useRadarStore } from '@/store/gameStore';
import { useEffect, useCallback, useState } from 'react';
import { EntityInfoPanel } from './entities/EntityInfoPanel';
import { SearchBar } from './SearchBar';
import { ModeBar } from './ModeBar';

export function Dashboard() {
  const gameState = useRadarStore((state) => state.gameState);
  const selectEntity = useRadarStore((state) => state.selectEntity);
  const locationReady = useRadarStore((state) => state.locationReady);
  
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

  // Keyboard shortcuts (Escape to close, Enter to select hovered)
  // Arrow keys are handled by CameraController for freecam
  // Shift + Arrow keys are handled by CameraController for entity snapping
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.key === 'Escape') {
        handleClosePanel();
      } else if (e.key === 'Enter' && gameState.hoveredEntity) {
        selectEntity(gameState.hoveredEntity);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClosePanel, gameState.hoveredEntity, selectEntity]);

  return (
    <div className="absolute inset-0 pointer-events-none font-mono">
      {/* Entity Info Panel - Bottom Left */}
      <div className="absolute bottom-14 left-4 pointer-events-auto">
        <EntityInfoPanel onClose={handleClosePanel} />
      </div>
      
      {/* Bottom Bar */}
      <div className="absolute bottom-0 left-0 right-0 p-3 pointer-events-auto">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Mode Bar */}
          <div 
            className={animateIn ? 'bottom-bar-item animate-in' : 'bottom-bar-item'} 
            style={{ '--item-index': 0 } as React.CSSProperties}
          >
            <ModeBar />
          </div>
          
          {/* Center: Search Bar */}
          <div 
            className={`flex-1 max-w-md ${animateIn ? 'bottom-bar-item animate-in' : 'bottom-bar-item'}`}
            style={{ '--item-index': 1 } as React.CSSProperties}
          >
            <SearchBar />
          </div>
      
          {/* Right: Hints & Version */}
          <div 
            className={`text-right ${animateIn ? 'bottom-bar-item animate-in' : 'bottom-bar-item'}`}
            style={{ '--item-index': 2 } as React.CSSProperties}
          >
            <div className="text-[8px] text-[#444]">arrows: pan | shift+↑↓: zoom | shift+←→: snap</div>
            <div className="text-[8px] text-[#444]">bullhorn aerosystems (commercial) v1.2</div>
          </div>
        </div>
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
