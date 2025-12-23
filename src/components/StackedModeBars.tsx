'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRadarStore } from '@/store/gameStore';
import { UI, COLORS } from '@/config/constants';
import { TEXT, BG, BORDER } from '@/config/styles';
import { SelectorMenu, MenuSection } from './SelectorMenu';

// Type for which bar is active
type ActiveBar = 'filter' | 'ai';
type FilterMode = 'all' | 'aircraft' | 'airport';
type AITool = 'agent' | 'plan' | 'ask';

interface StackedModeBarsProps {
  isSearchFocused: boolean;
  animateIn: boolean;
}

// Mode colors - from centralized config
const FILTER_COLORS = {
  all: COLORS.MODE_ALL,
  aircraft: COLORS.MODE_AIRCRAFT,
  airport: COLORS.MODE_AIRPORT,
};

const AI_COLORS = {
  agent: { active: '#ff4444', inactive: '#442222', highlighted: '#ff6666' },  // Red
  plan: { active: '#ffaa00', inactive: '#443300', highlighted: '#ffcc33' },   // Yellow
  ask: { active: '#00cc66', inactive: '#224422', highlighted: '#33ff88' },    // Green
};

// Icons for filter modes
const PlaneIcon = ({ active, highlighted }: { active: boolean; highlighted?: boolean }) => {
  const colors = FILTER_COLORS.aircraft;
  const color = highlighted ? colors.highlighted : active ? colors.active : colors.inactive;
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
    </svg>
  );
};

const RunwayIcon = ({ active, highlighted }: { active: boolean; highlighted?: boolean }) => {
  const colors = FILTER_COLORS.airport;
  const color = highlighted ? colors.highlighted : active ? colors.active : colors.inactive;
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <rect x="4" y="6" width="16" height="12" rx="1" />
      <line x1="12" y1="8" x2="12" y2="10" strokeLinecap="round" />
      <line x1="12" y1="12" x2="12" y2="14" strokeLinecap="round" />
      <line x1="12" y1="16" x2="12" y2="16" strokeLinecap="round" />
    </svg>
  );
};

const AllIcon = ({ active, highlighted }: { active: boolean; highlighted?: boolean }) => {
  const colors = FILTER_COLORS.all;
  const color = highlighted ? colors.highlighted : active ? colors.active : colors.inactive;
  return <div className="w-2.5 h-2.5" style={{ backgroundColor: color }} />;
};

// Icons for AI tools
const AgentIcon = ({ active, highlighted }: { active: boolean; highlighted?: boolean }) => {
  const colors = AI_COLORS.agent;
  const color = highlighted ? colors.highlighted : active ? colors.active : colors.inactive;
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <circle cx="9" cy="14" r="2" />
      <circle cx="15" cy="14" r="2" />
      <path d="M12 2v4" />
      <path d="M8 6h8" />
    </svg>
  );
};

const PlanIcon = ({ active, highlighted }: { active: boolean; highlighted?: boolean }) => {
  const colors = AI_COLORS.plan;
  const color = highlighted ? colors.highlighted : active ? colors.active : colors.inactive;
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
};

const AskIcon = ({ active, highlighted }: { active: boolean; highlighted?: boolean }) => {
  const colors = AI_COLORS.ask;
  const color = highlighted ? colors.highlighted : active ? colors.active : colors.inactive;
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M9 9a3 3 0 1 1 3.5 2.9c-.8.4-1.5 1.1-1.5 2.1" />
      <circle cx="12" cy="17" r="0.5" fill={color} />
    </svg>
  );
};

// Icon factory functions for menu
const createFilterIcon = (mode: FilterMode) => (active: boolean, highlighted: boolean) => {
  switch (mode) {
    case 'aircraft': return <PlaneIcon active={active} highlighted={highlighted} />;
    case 'airport': return <RunwayIcon active={active} highlighted={highlighted} />;
    case 'all': return <AllIcon active={active} highlighted={highlighted} />;
  }
};

const createAIIcon = (tool: AITool) => (active: boolean, highlighted: boolean) => {
  switch (tool) {
    case 'agent': return <AgentIcon active={active} highlighted={highlighted} />;
    case 'plan': return <PlanIcon active={active} highlighted={highlighted} />;
    case 'ask': return <AskIcon active={active} highlighted={highlighted} />;
  }
};

const HOLD_THRESHOLD = UI.TAB_HOLD_THRESHOLD;

export function StackedModeBars({ isSearchFocused, animateIn }: StackedModeBarsProps) {
  // Which bar is in front (filter or AI)
  const [activeBar, setActiveBar] = useState<ActiveBar>('filter');
  
  // Filter mode from store
  const filterMode = useRadarStore((s) => s.gameState.activeMode) as FilterMode;
  const setFilterMode = useRadarStore((s) => s.setActiveMode);
  const aircraft = useRadarStore((s) => s.aircraft);
  const airports = useRadarStore((s) => s.airports);
  
  // AI tool local state
  const [aiTool, setAiTool] = useState<AITool>('agent');
  
  // Menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const shiftTabPressTime = useRef<number | null>(null);
  const shiftTabHoldTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Animated highlight for active bar
  const filterContainerRef = useRef<HTMLDivElement>(null);
  const aiContainerRef = useRef<HTMLDivElement>(null);
  const filterButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const aiButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [filterHighlightStyle, setFilterHighlightStyle] = useState({ left: 0, width: 0 });
  const [aiHighlightStyle, setAiHighlightStyle] = useState({ left: 0, width: 0 });
  
  const filterModes: FilterMode[] = useMemo(() => ['all', 'aircraft', 'airport'], []);
  const aiTools: AITool[] = useMemo(() => ['agent', 'plan', 'ask'], []);
  
  // Entity counts
  const counts = useMemo(() => ({
    all: aircraft.length + airports.length,
    aircraft: aircraft.length,
    airport: airports.length,
  }), [aircraft.length, airports.length]);
  
  // Build menu sections for SelectorMenu
  const menuSections: MenuSection[] = useMemo(() => [
    {
      id: 'filter',
      label: 'FILTER',
      items: filterModes.map(mode => ({
        id: mode,
        label: mode === 'all' ? 'ALL' : mode === 'aircraft' ? 'AIRCRAFT' : 'AIRPORTS',
        icon: createFilterIcon(mode),
        colors: FILTER_COLORS[mode],
        count: counts[mode],
      })),
    },
    {
      id: 'ai',
      label: 'AI TOOLS',
      items: aiTools.map(tool => ({
        id: tool,
        label: tool === 'agent' ? 'AGENT' : tool === 'plan' ? 'PLAN' : 'ASK',
        icon: createAIIcon(tool),
        colors: AI_COLORS[tool],
      })),
    },
  ], [filterModes, aiTools, counts]);
  
  // Get current active ID based on active bar
  const activeId = activeBar === 'filter' ? filterMode : aiTool;
  
  // Handle menu selection
  const handleMenuSelect = useCallback((itemId: string, sectionId: string) => {
    if (sectionId === 'filter') {
      setActiveBar('filter');
      setFilterMode(itemId as FilterMode);
    } else {
      setActiveBar('ai');
      setAiTool(itemId as AITool);
    }
    setMenuOpen(false);
  }, [setFilterMode]);
  
  // Update filter highlight position
  useEffect(() => {
    const activeIndex = filterModes.indexOf(filterMode);
    const button = filterButtonRefs.current[activeIndex];
    const container = filterContainerRef.current;
    
    if (button && container) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      setFilterHighlightStyle({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      });
    }
  }, [filterMode, filterModes, counts]);
  
  // Update AI highlight position
  useEffect(() => {
    const activeIndex = aiTools.indexOf(aiTool);
    const button = aiButtonRefs.current[activeIndex];
    const container = aiContainerRef.current;
    
    if (button && container) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      setAiHighlightStyle({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      });
    }
  }, [aiTool, aiTools]);
  
  // Handle Shift+Tab for cycling AI tools and opening menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift+Tab handling - only cycles AI tools
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        
        if (!menuOpen) {
          shiftTabPressTime.current = Date.now();
          
          // Set timeout for hold to open menu
          shiftTabHoldTimeout.current = setTimeout(() => {
            // Menu highlights AI tools starting after filter modes
            setHighlightedIndex(filterModes.length + aiTools.indexOf(aiTool));
            setMenuOpen(true);
          }, HOLD_THRESHOLD);
        }
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      // Shift+Tab release - if quick press, cycle through AI tools only
      if (e.key === 'Tab') {
        if (shiftTabHoldTimeout.current) {
          clearTimeout(shiftTabHoldTimeout.current);
          shiftTabHoldTimeout.current = null;
        }
        
        if (shiftTabPressTime.current && !menuOpen) {
          const duration = Date.now() - shiftTabPressTime.current;
          if (duration < HOLD_THRESHOLD) {
            // Quick press - cycle through AI tools only
            const currentIdx = aiTools.indexOf(aiTool);
            const nextIdx = (currentIdx + 1) % aiTools.length;
            setActiveBar('ai');
            setAiTool(aiTools[nextIdx]);
          }
        }
        shiftTabPressTime.current = null;
      }
      
      // Shift release when menu is open - close and select
      if (e.key === 'Shift' && menuOpen) {
        const idx = highlightedIndex;
        if (idx < filterModes.length) {
          setActiveBar('filter');
          setFilterMode(filterModes[idx]);
        } else {
          setActiveBar('ai');
          setAiTool(aiTools[idx - filterModes.length]);
        }
        setMenuOpen(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (shiftTabHoldTimeout.current) {
        clearTimeout(shiftTabHoldTimeout.current);
      }
    };
  }, [menuOpen, filterModes, aiTools, aiTool, highlightedIndex, setFilterMode]);
  
  // Regular Tab handling for filter bar only
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        
        // Cycle filter modes only
        const currentIdx = filterModes.indexOf(filterMode);
        const nextIdx = (currentIdx + 1) % filterModes.length;
        setActiveBar('filter');
        setFilterMode(filterModes[nextIdx]);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filterMode, filterModes, setFilterMode]);
  
  // Helper functions for rendering
  const getFilterIcon = (mode: FilterMode, active: boolean, highlighted?: boolean) => {
    switch (mode) {
      case 'aircraft': return <PlaneIcon active={active} highlighted={highlighted} />;
      case 'airport': return <RunwayIcon active={active} highlighted={highlighted} />;
      case 'all': return <AllIcon active={active} highlighted={highlighted} />;
    }
  };
  
  const getAIIcon = (tool: AITool, active: boolean, highlighted?: boolean) => {
    switch (tool) {
      case 'agent': return <AgentIcon active={active} highlighted={highlighted} />;
      case 'plan': return <PlanIcon active={active} highlighted={highlighted} />;
      case 'ask': return <AskIcon active={active} highlighted={highlighted} />;
    }
  };
  
  const getFilterLabel = (mode: FilterMode) => {
    switch (mode) {
      case 'aircraft': return 'AIRCRAFT';
      case 'airport': return 'AIRPORTS';
      case 'all': return 'ALL';
    }
  };
  
  const getAILabel = (tool: AITool) => {
    switch (tool) {
      case 'agent': return 'AGENT';
      case 'plan': return 'PLAN';
      case 'ask': return 'ASK';
    }
  };
  
  // Stacked mode when search is focused
  const isStacked = isSearchFocused;
  
  // Calculate bar styles
  const getFilterBarStyle = () => {
    if (isStacked) {
      return {
        transform: 'translateY(0)',
        zIndex: 1,
        opacity: 1,
      };
    }
    return {
      transform: activeBar === 'filter' ? 'translateY(0)' : 'translateY(6px) translateX(-6px) scale(0.95)',
      zIndex: activeBar === 'filter' ? 2 : 1,
      opacity: activeBar === 'filter' ? 1 : 0.1,
    };
  };
  
  const getAIBarStyle = () => {
    if (isStacked) {
      return {
        transform: 'translateY(-100%) translateY(-8px)',
        zIndex: 2,
        opacity: 1,
      };
    }
    return {
      transform: activeBar === 'ai' ? 'translateY(0)' : 'translateY(-6px) translateX(6px) scale(0.95)',
      zIndex: activeBar === 'ai' ? 2 : 1,
      opacity: activeBar === 'ai' ? 1 : 0.1,
    };
  };

  return (
    <div 
      className={`stacked-bars-container relative shrink-0 ${animateIn ? 'bottom-bar-item animate-in' : 'bottom-bar-item'}`}
      style={{ '--item-index': 0 } as React.CSSProperties}
    >
      {/* Unified Menu using SelectorMenu component */}
      <SelectorMenu
        sections={menuSections}
        activeId={activeId}
        highlightedIndex={highlightedIndex}
        setHighlightedIndex={setHighlightedIndex}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSelect={handleMenuSelect}
        footer="release ⇧ to select"
      />
      
      {/* Filter Bar */}
      <div 
        className="transition-all duration-300 ease-out"
        style={getFilterBarStyle()}
      >
        <div 
          ref={filterContainerRef}
          className={`relative flex items-center gap-1 ${BG.GLASS_BLUR} border px-2 py-2 transition-all duration-200 cursor-pointer select-none ${TEXT.BASE} ${
            menuOpen ? BORDER.ACCENT_BLUE : BORDER.DEFAULT
          }`}
        >
          {/* Animated highlight background */}
          <div 
            className={`absolute top-1 bottom-1 ${BG.ELEVATED} rounded-sm transition-all duration-300 ease-out pointer-events-none`}
            style={{
              left: filterHighlightStyle.left,
              width: filterHighlightStyle.width,
              opacity: filterHighlightStyle.width > 0 ? 1 : 0,
            }}
          />
          
          {/* Tab hint */}
          <span className={`${TEXT.DIMMED} ${TEXT.BASE} mr-1 relative z-10`}>[TAB]</span>
          
          {filterModes.map((mode, index) => {
            const isActive = filterMode === mode;
            const count = counts[mode] || 0;
            const colors = FILTER_COLORS[mode];
            
            return (
              <button
                key={mode}
                ref={(el) => { filterButtonRefs.current[index] = el; }}
                onClick={() => {
                  setActiveBar('filter');
                  setFilterMode(mode);
                }}
                className="relative z-10 flex items-center gap-1.5 px-1.5 py-0.5 transition-colors"
              >
                {getFilterIcon(mode, isActive)}
                {isActive && (
                  <>
                    <span style={{ color: colors.active }}>{count}</span>
                    <span style={{ color: colors.active }}>{getFilterLabel(mode)}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
      
      {/* AI Tools Bar */}
      <div 
        className="absolute left-0 bottom-0 transition-all duration-300 ease-out"
        style={getAIBarStyle()}
      >
        <div 
          ref={aiContainerRef}
          className={`relative flex items-center gap-1 ${BG.GLASS_BLUR} border px-2 py-2 transition-all duration-200 cursor-pointer select-none ${TEXT.BASE} ${BORDER.DEFAULT}`}
        >
          {/* Animated highlight background */}
          <div 
            className={`absolute top-1 bottom-1 ${BG.ELEVATED} rounded-sm transition-all duration-300 ease-out pointer-events-none`}
            style={{
              left: aiHighlightStyle.left,
              width: aiHighlightStyle.width,
              opacity: aiHighlightStyle.width > 0 ? 1 : 0,
            }}
          />
          
          {/* Shift+Tab hint */}
          <span className={`${TEXT.DIMMED} ${TEXT.BASE} mr-1 relative z-10`}>[⇧+TAB]</span>
          
          {aiTools.map((tool, index) => {
            const isActive = aiTool === tool;
            const colors = AI_COLORS[tool];
            
            return (
              <button
                key={tool}
                ref={(el) => { aiButtonRefs.current[index] = el; }}
                onClick={() => {
                  setActiveBar('ai');
                  setAiTool(tool);
                }}
                className="relative z-10 flex items-center gap-1.5 px-1.5 py-0.5 transition-colors"
              >
                {getAIIcon(tool, isActive)}
                {isActive && (
                  <span style={{ color: colors.active }}>{getAILabel(tool)}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
