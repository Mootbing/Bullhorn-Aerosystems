'use client';

import { useState, useEffect, useCallback } from 'react';
import { EntityType, getEntityTypePluralName } from '@/types/entities';
import { getEntityConfig, getActiveEntityTypes } from '@/lib/entityRegistry';
import { useRadarStore } from '@/store/gameStore';

interface ModeBarProps {
  onModeChange?: (mode: EntityType | 'all') => void;
}

export function ModeBar({ onModeChange }: ModeBarProps) {
  const [activeMode, setActiveMode] = useState<EntityType | 'all'>('all');
  const aircraft = useRadarStore((s) => s.aircraft);
  const airports = useRadarStore((s) => s.airports);
  
  // Available modes (all + active entity types)
  const modes: (EntityType | 'all')[] = ['all', ...getActiveEntityTypes()];
  
  // Get counts for each type
  const getCounts = useCallback(() => {
    return {
      all: aircraft.length + airports.length,
      aircraft: aircraft.length,
      airport: airports.length,
      missile: 0,
      radar: 0,
      sam_site: 0,
      ship: 0,
      draw_shape: 0,
    };
  }, [aircraft.length, airports.length]);
  
  const counts = getCounts();
  
  // Cycle through modes with Tab key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept Tab if user is in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.key === 'Tab') {
        e.preventDefault();
        setActiveMode((current) => {
          const currentIdx = modes.indexOf(current);
          const nextIdx = e.shiftKey 
            ? (currentIdx - 1 + modes.length) % modes.length 
            : (currentIdx + 1) % modes.length;
          const nextMode = modes[nextIdx];
          onModeChange?.(nextMode);
          return nextMode;
        });
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modes, onModeChange]);
  
  // Get display info for a mode
  const getModeInfo = (mode: EntityType | 'all') => {
    if (mode === 'all') {
      return { 
        name: 'ALL', 
        icon: '◉', 
        color: '#ffffff',
        count: counts.all,
      };
    }
    const config = getEntityConfig(mode);
    return { 
      name: config.pluralName.toUpperCase(), 
      icon: config.icon, 
      color: config.color,
      count: counts[mode] || 0,
    };
  };
  
  return (
    <div className="flex items-center gap-1 bg-black/90 border border-[#1a1a1a] px-2 py-1">
      {/* Mode label */}
      <span className="text-[8px] text-[#444] mr-2">MODE</span>
      
      {/* Mode buttons */}
      {modes.map((mode) => {
        const { name, icon, color, count } = getModeInfo(mode);
        const isActive = activeMode === mode;
        
        return (
          <button
            key={mode}
            onClick={() => {
              setActiveMode(mode);
              onModeChange?.(mode);
            }}
            className={`flex items-center gap-1.5 px-2 py-1 text-[9px] transition-all ${
              isActive 
                ? 'bg-[#111] border border-[#333]' 
                : 'border border-transparent hover:border-[#222] hover:bg-[#0a0a0a]'
            }`}
          >
            <span style={{ color: isActive ? color : '#555' }}>{icon}</span>
            <span className={isActive ? 'text-white' : 'text-[#555]'}>{name}</span>
            <span 
              className={`text-[8px] font-mono ${isActive ? 'text-[#00ff88]' : 'text-[#333]'}`}
            >
              {count}
            </span>
          </button>
        );
      })}
      
      {/* Tab hint */}
      <span className="text-[8px] text-[#333] ml-2">[TAB]</span>
    </div>
  );
}

