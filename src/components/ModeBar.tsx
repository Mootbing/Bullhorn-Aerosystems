'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { EntityType } from '@/types/entities';
import { useRadarStore } from '@/store/gameStore';
import { UI } from '@/config/constants';

interface ModeBarProps {
  onModeChange?: (mode: EntityType | 'all') => void;
}

// SVG Icons
const PlaneIcon = ({ active, highlighted }: { active: boolean; highlighted?: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={highlighted ? '#ffff00' : active ? '#00ff88' : '#555'} strokeWidth="2">
    <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
  </svg>
);

const RunwayIcon = ({ active, highlighted }: { active: boolean; highlighted?: boolean }) => (
  <span className={`text-sm font-bold ${highlighted ? 'text-yellow-400' : active ? 'text-[#00ff88]' : 'text-[#555]'}`}>═</span>
);

const MissileIcon = ({ active, highlighted }: { active: boolean; highlighted?: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={highlighted ? '#ffff00' : active ? '#00ff88' : '#555'} strokeWidth="2">
    <path d="M4 20L12 12M12 12L20 4M12 12L8 8M12 12L16 16"/>
    <circle cx="20" cy="4" r="2"/>
  </svg>
);

const AllIcon = ({ active, highlighted }: { active: boolean; highlighted?: boolean }) => (
  <div className={`w-2.5 h-2.5 rounded-full ${highlighted ? 'bg-yellow-400' : active ? 'bg-[#00ff88]' : 'bg-[#555]'}`} />
);

const HOLD_THRESHOLD = UI.TAB_HOLD_THRESHOLD;

export function ModeBar({ onModeChange }: ModeBarProps) {
  const activeMode = useRadarStore((s) => s.gameState.activeMode);
  const setActiveMode = useRadarStore((s) => s.setActiveMode);
  const aircraft = useRadarStore((s) => s.aircraft);
  const airports = useRadarStore((s) => s.airports);
  
  const modes = useMemo<('all' | 'aircraft' | 'airport' | 'missile')[]>(() => ['all', 'aircraft', 'airport'], []);
  
  const [menuOpen, setMenuOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const tabPressTime = useRef<number | null>(null);
  const holdTimeout = useRef<NodeJS.Timeout | null>(null);
  const mousePressTime = useRef<number | null>(null);
  const mouseHoldTimeout = useRef<NodeJS.Timeout | null>(null);
  
  const counts: Record<string, number> = {
    all: aircraft.length + airports.length,
    aircraft: aircraft.length,
    airport: airports.length,
    missile: 0,
  };
  
  const selectMode = useCallback((mode: 'all' | 'aircraft' | 'airport' | 'missile') => {
    setActiveMode(mode);
    onModeChange?.(mode);
  }, [setActiveMode, onModeChange]);
  
  // Long-click handling for mode bar
  const handleMouseDown = useCallback(() => {
    mousePressTime.current = Date.now();
    
    // Set timeout for long hold
    mouseHoldTimeout.current = setTimeout(() => {
      const current = useRadarStore.getState().gameState.activeMode;
      setHighlightedIndex(modes.indexOf(current));
      setMenuOpen(true);
    }, HOLD_THRESHOLD);
  }, [modes]);
  
  const handleMouseUp = useCallback(() => {
    // Clear hold timeout
    if (mouseHoldTimeout.current) {
      clearTimeout(mouseHoldTimeout.current);
      mouseHoldTimeout.current = null;
    }
    
    // If menu is open, keep it open (user can click to select)
    // Quick clicks on individual mode buttons are handled separately
    mousePressTime.current = null;
  }, []);
  
  const handleMouseLeave = useCallback(() => {
    // Cancel hold if mouse leaves before threshold
    if (mouseHoldTimeout.current) {
      clearTimeout(mouseHoldTimeout.current);
      mouseHoldTimeout.current = null;
    }
    mousePressTime.current = null;
  }, []);
  
  // Tab key handling: single click to cycle, long hold for menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        
        // Ignore key repeat events (when holding Tab)
        if (e.repeat) return;
        
        // Start tracking hold time (only on initial press)
        if (tabPressTime.current === null) {
          tabPressTime.current = Date.now();
          
          // Set timeout for long hold
          holdTimeout.current = setTimeout(() => {
            const current = useRadarStore.getState().gameState.activeMode;
            setHighlightedIndex(modes.indexOf(current));
            setMenuOpen(true);
          }, HOLD_THRESHOLD);
        }
      }
      
      // Arrow keys for menu navigation - absorb events so map doesn't receive them
      if (menuOpen) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          setHighlightedIndex((prev) => (prev - 1 + modes.length) % modes.length);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          setHighlightedIndex((prev) => (prev + 1) % modes.length);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const selectedMode = modes[highlightedIndex];
          selectMode(selectedMode);
          setMenuOpen(false);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen(false);
        }
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        
        // Clear hold timeout
        if (holdTimeout.current) {
          clearTimeout(holdTimeout.current);
          holdTimeout.current = null;
        }
        
        // If menu is open, confirm selection on release
        if (menuOpen) {
          const selectedMode = modes[highlightedIndex];
          selectMode(selectedMode);
          setMenuOpen(false);
          tabPressTime.current = null;
          return;
        }
        
        // Check if it was a quick tap (not a hold)
        if (tabPressTime.current !== null) {
          const holdDuration = Date.now() - tabPressTime.current;
          tabPressTime.current = null;
          
          if (holdDuration < HOLD_THRESHOLD) {
            // Quick tap - cycle to next mode
            const current = useRadarStore.getState().gameState.activeMode;
            const currentIdx = modes.indexOf(current);
            const nextIdx = (currentIdx + 1) % modes.length;
            selectMode(modes[nextIdx]);
          }
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      if (holdTimeout.current) clearTimeout(holdTimeout.current);
      if (mouseHoldTimeout.current) clearTimeout(mouseHoldTimeout.current);
    };
  }, [modes, menuOpen, highlightedIndex, selectMode]);
  
  // Click outside to close menu
  useEffect(() => {
    if (!menuOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.mode-bar-container')) {
        setMenuOpen(false);
      }
    };
    
    // Delay adding listener to avoid immediate close
    const timeout = setTimeout(() => {
      window.addEventListener('click', handleClickOutside);
    }, 10);
    
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('click', handleClickOutside);
    };
  }, [menuOpen]);
  
  const getIcon = (mode: EntityType | 'all', active: boolean, highlighted?: boolean) => {
    switch (mode) {
      case 'aircraft': return <PlaneIcon active={active} highlighted={highlighted} />;
      case 'airport': return <RunwayIcon active={active} highlighted={highlighted} />;
      case 'missile': return <MissileIcon active={active} highlighted={highlighted} />;
      case 'all': return <AllIcon active={active} highlighted={highlighted} />;
      default: return <AllIcon active={active} highlighted={highlighted} />;
    }
  };
  
  const getLabel = (mode: EntityType | 'all') => {
    switch (mode) {
      case 'aircraft': return 'AIRCRAFT';
      case 'airport': return 'AIRPORTS';
      case 'missile': return 'MISSILES';
      case 'all': return 'ALL';
      default: return mode.toUpperCase();
    }
  };
  
  return (
    <div className="mode-bar-container relative flex items-center gap-1 text-[10px]">
      {/* Menu popup - animates up from bottom */}
      <div 
        className={`absolute bottom-full left-0 mb-2 bg-black/95 border border-[#333] overflow-hidden transition-all duration-200 ease-out ${
          menuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
        }`}
        style={{ minWidth: '140px' }}
      >
        <div className="px-2 py-1 border-b border-[#333] text-[#666]">
          SELECT MODE <span className="text-[#444]">↑↓</span>
        </div>
        {modes.map((mode, idx) => {
          const isActive = activeMode === mode;
          const isHighlighted = highlightedIndex === idx;
          const count = counts[mode] || 0;
          
          return (
            <div
              key={mode}
              className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all duration-100 ${
                isHighlighted ? 'bg-[#222] border-l-2 border-yellow-400' : 'border-l-2 border-transparent'
              } ${isActive ? 'text-[#00ff88]' : 'text-white'}`}
              onClick={() => {
                selectMode(mode);
                setMenuOpen(false);
              }}
              onMouseEnter={() => setHighlightedIndex(idx)}
            >
              {getIcon(mode, isActive, isHighlighted)}
              <span className={isHighlighted ? 'text-yellow-400' : ''}>{getLabel(mode)}</span>
              <span className={`ml-auto ${isHighlighted ? 'text-yellow-400' : 'text-[#666]'}`}>{count}</span>
            </div>
          );
        })}
        <div className="px-2 py-1 border-t border-[#333] text-[#444] text-center">
          click to select
        </div>
      </div>
      
      {/* TAB label on left */}
      <span className="text-[#444]">[TAB]</span>
      
      {/* Current mode indicator */}
      <div 
        className={`flex items-center gap-1 bg-black/80 border px-2 py-1 transition-all duration-200 cursor-pointer select-none ${
          menuOpen ? 'border-yellow-400/50' : 'border-[#222]'
        }`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {modes.map((mode) => {
          const isActive = activeMode === mode;
          const count = counts[mode] || 0;
          
          return (
            <button
              key={mode}
              onClick={() => selectMode(mode)}
              className={`flex items-center gap-1.5 px-1.5 py-0.5 transition-all ${
                isActive ? 'bg-[#111]' : 'hover:bg-[#0a0a0a]'
              }`}
            >
              {getIcon(mode, isActive)}
              {isActive && (
                <>
                  <span className="text-[#00ff88]">{count}</span>
                  <span className="text-white">{getLabel(mode)}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
