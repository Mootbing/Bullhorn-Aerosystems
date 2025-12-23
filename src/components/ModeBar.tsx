'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { EntityType } from '@/types/entities';
import { useRadarStore } from '@/store/gameStore';
import { UI } from '@/config/constants';
import { useUIInput } from '@/hooks/useInputManager';
import { InputAction } from '@/lib/inputManager';

interface ModeBarProps {
  onModeChange?: (mode: EntityType | 'all') => void;
}

// Mode colors - highlighted uses lighter shade
const MODE_COLORS = {
  all: { active: '#66aaff', inactive: '#335577', highlighted: '#88ccff' },      // Blue
  aircraft: { active: '#00ff88', inactive: '#005533', highlighted: '#66ffaa' }, // Green
  airport: { active: '#ffffff', inactive: '#555555', highlighted: '#cccccc' },  // White
  missile: { active: '#ff4444', inactive: '#552222', highlighted: '#ff6666' },  // Red
};

// SVG Icons with mode-specific colors
const PlaneIcon = ({ active, highlighted }: { active: boolean; highlighted?: boolean }) => {
  const colors = MODE_COLORS.aircraft;
  const color = highlighted ? colors.highlighted : active ? colors.active : colors.inactive;
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
    </svg>
  );
};

const RunwayIcon = ({ active, highlighted }: { active: boolean; highlighted?: boolean }) => {
  const colors = MODE_COLORS.airport;
  const color = highlighted ? colors.highlighted : active ? colors.active : colors.inactive;
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      {/* Runway rectangle with center line */}
      <rect x="4" y="6" width="16" height="12" rx="1" />
      <line x1="12" y1="8" x2="12" y2="10" strokeLinecap="round" />
      <line x1="12" y1="12" x2="12" y2="14" strokeLinecap="round" />
      <line x1="12" y1="16" x2="12" y2="16" strokeLinecap="round" />
    </svg>
  );
};

const MissileIcon = ({ active, highlighted }: { active: boolean; highlighted?: boolean }) => {
  const colors = MODE_COLORS.missile;
  const color = highlighted ? colors.highlighted : active ? colors.active : colors.inactive;
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M4 20L12 12M12 12L20 4M12 12L8 8M12 12L16 16"/>
      <circle cx="20" cy="4" r="2"/>
    </svg>
  );
};

const AllIcon = ({ active, highlighted }: { active: boolean; highlighted?: boolean }) => {
  const colors = MODE_COLORS.all;
  const color = highlighted ? colors.highlighted : active ? colors.active : colors.inactive;
  return <div className="w-2.5 h-2.5" style={{ backgroundColor: color }} />;
};

const HOLD_THRESHOLD = UI.TAB_HOLD_THRESHOLD;

export function ModeBar({ onModeChange }: ModeBarProps) {
  const activeMode = useRadarStore((s) => s.gameState.activeMode);
  const setActiveMode = useRadarStore((s) => s.setActiveMode);
  const aircraft = useRadarStore((s) => s.aircraft);
  const airports = useRadarStore((s) => s.airports);
  
  const modes = useMemo<('all' | 'aircraft' | 'airport' | 'missile')[]>(() => ['all', 'aircraft', 'airport'], []);
  
  const [menuOpen, setMenuOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const mousePressTime = useRef<number | null>(null);
  const mouseHoldTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Animated highlight state
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [highlightStyle, setHighlightStyle] = useState({ left: 0, width: 0 });
  
  // Memoize counts to prevent infinite re-render loop
  const counts = useMemo<Record<string, number>>(() => ({
    all: aircraft.length + airports.length,
    aircraft: aircraft.length,
    airport: airports.length,
    missile: 0,
  }), [aircraft.length, airports.length]);
  
  const selectMode = useCallback((mode: 'all' | 'aircraft' | 'airport' | 'missile') => {
    setActiveMode(mode);
    onModeChange?.(mode);
  }, [setActiveMode, onModeChange]);
  
  // Update highlight position when active mode changes
  useEffect(() => {
    const activeIndex = modes.indexOf(activeMode);
    const button = buttonRefs.current[activeIndex];
    const container = containerRef.current;
    
    if (button && container) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      
      setHighlightStyle({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      });
    }
  }, [activeMode, modes, counts]); // counts dependency ensures recalc when numbers change
  
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
  
  // Handle input actions from centralized input manager
  const handleUIAction = useCallback((action: InputAction) => {
    switch (action) {
      case 'filter_cycle':
        // Cycle to next mode
        const current = useRadarStore.getState().gameState.activeMode;
        const currentIdx = modes.indexOf(current);
        const nextIdx = (currentIdx + 1) % modes.length;
        selectMode(modes[nextIdx]);
        break;
      case 'filter_menu_open':
        const currentMode = useRadarStore.getState().gameState.activeMode;
        setHighlightedIndex(modes.indexOf(currentMode));
        setMenuOpen(true);
        break;
      case 'filter_menu_close':
        if (menuOpen) {
          const selectedMode = modes[highlightedIndex];
          selectMode(selectedMode);
          setMenuOpen(false);
        }
        break;
    }
  }, [modes, selectMode, menuOpen, highlightedIndex]);
  
  useUIInput(handleUIAction);
  
  // Arrow key navigation when menu is open (still needs local handling for menu-specific navigation)
  useEffect(() => {
    if (!menuOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'w' || e.key === 'W' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        e.stopPropagation();
        setHighlightedIndex((prev) => (prev - 1 + modes.length) % modes.length);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 's' || e.key === 'S' || e.key === 'd' || e.key === 'D') {
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
    };
    
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [menuOpen, modes, highlightedIndex, selectMode]);
  
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
          const colors = MODE_COLORS[mode];
          const textColor = isHighlighted ? colors.highlighted : isActive ? colors.active : '#888';
          
          return (
            <div
              key={mode}
              className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all duration-100 ${
                isHighlighted ? 'bg-[#222] border-l-2' : 'border-l-2 border-transparent'
              }`}
              style={{ borderLeftColor: isHighlighted ? colors.highlighted : 'transparent' }}
              onClick={() => {
                selectMode(mode);
                setMenuOpen(false);
              }}
              onMouseEnter={() => setHighlightedIndex(idx)}
            >
              {getIcon(mode, isActive, isHighlighted)}
              <span style={{ color: textColor }}>{getLabel(mode)}</span>
              <span className="ml-auto" style={{ color: isHighlighted ? colors.highlighted : '#666' }}>{count}</span>
            </div>
          );
        })}
        <div className="px-2 py-1 border-t border-[#333] text-[#444] text-center">
          click to select
        </div>
      </div>
      
      {/* Current mode indicator */}
      <div 
        ref={containerRef}
        className={`relative flex items-center gap-1 bg-black/30 backdrop-blur-md border h-full px-2 py-2 transition-all duration-200 cursor-pointer select-none ${
          menuOpen ? 'border-[#66aaff]/50' : 'border-[#333]'
        }`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Animated highlight background */}
        <div 
          className="absolute top-1 bottom-1 bg-[#111] rounded-sm transition-all duration-300 ease-out pointer-events-none"
          style={{
            left: highlightStyle.left,
            width: highlightStyle.width,
            opacity: highlightStyle.width > 0 ? 1 : 0,
          }}
        />
        
        {/* Tab hint inside the box */}
        <span className="text-[#444] text-[10px] mr-1 relative z-10">[TAB]</span>
        
        {modes.map((mode, index) => {
          const isActive = activeMode === mode;
          const count = counts[mode] || 0;
          const colors = MODE_COLORS[mode];
          
          return (
            <button
              key={mode}
              ref={(el) => { buttonRefs.current[index] = el; }}
              onClick={() => selectMode(mode)}
              className="relative z-10 flex items-center gap-1.5 px-1.5 py-0.5 transition-colors"
            >
              {getIcon(mode, isActive)}
              {isActive && (
                <>
                  <span style={{ color: colors.active }}>{count}</span>
                  <span style={{ color: colors.active }}>{getLabel(mode)}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
