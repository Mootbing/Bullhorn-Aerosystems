'use client';

import { useRadarStore } from '@/store/gameStore';
import { useEffect, useCallback } from 'react';
import { EntityInfoPanel } from './entities/EntityInfoPanel';
import { SearchBar } from './SearchBar';
import { ModeBar } from './ModeBar';

export function Dashboard() {
  const aircraft = useRadarStore((state) => state.aircraft);
  const gameState = useRadarStore((state) => state.gameState);
  const isPolling = useRadarStore((state) => state.isPolling);
  const selectEntity = useRadarStore((state) => state.selectEntity);
  const hoverEntity = useRadarStore((state) => state.hoverEntity);

  const handleClosePanel = useCallback(() => {
    selectEntity(null);
  }, [selectEntity]);

  // Keyboard shortcuts: ESC to unfollow, ENTER to track/switch hovered entity
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.key === 'Escape') {
        handleClosePanel();
      } else if (e.key === 'Enter' && gameState.hoveredEntity) {
        // Track or switch to the hovered entity when Enter is pressed
        selectEntity(gameState.hoveredEntity);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClosePanel, gameState.hoveredEntity, selectEntity]);

  return (
    <div className="absolute inset-0 pointer-events-none font-mono">
      {/* Header Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 border-b border-[#1a1a1a] bg-black/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="pointer-events-auto">
            <h1 className="text-sm font-medium text-white">
              COWLANTIR RADAR SYSTEMS<span className="text-[#333]">//</span><span className="text-[#666]">v0.0.1</span>
            </h1>
          </div>
          <div className="pointer-events-auto">
            <div className="flex items-center gap-3 px-3 py-1.5 border border-[#1a1a1a] bg-black/50 backdrop-blur-sm">
              <div className={'w-1.5 h-1.5 ' + (isPolling ? 'bg-[#00ff88]' : 'bg-[#ff4444]')} />
              <span className="text-[10px] tracking-[0.15em] text-[#666]">
                {isPolling ? 'UPLINK_ACTIVE' : 'UPLINK_PAUSED'}
              </span>
              <span className="text-[10px] text-[#00ff88]">{aircraft.length}</span>
              <span className="text-[10px] tracking-[0.15em] text-[#00ff88]">ONLINE</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Mode Bar - Bottom Center */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto">
        <ModeBar />
      </div>
      
      {/* Entity Info Panel - Bottom Left */}
      <div className="absolute bottom-4 left-4 pointer-events-auto">
        <EntityInfoPanel onClose={handleClosePanel} />
      </div>
      
      {/* Search Bar - Bottom Right */}
      <div className="absolute bottom-4 right-4 pointer-events-auto">
        <SearchBar />
      </div>
    </div>
  );
}
