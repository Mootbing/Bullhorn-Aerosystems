'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRadarStore, Aircraft } from '@/store/gameStore';

interface ParsedSearch {
  filters: {
    field: string;
    operator: 'equals' | 'contains' | 'gt' | 'lt' | 'between';
    value: string | number | [number, number];
  }[];
  freeText: string[];
  fallback?: boolean;
  error?: boolean;
}

function matchesFilter(aircraft: Aircraft, filter: ParsedSearch['filters'][0]): boolean {
  const { field, operator, value } = filter;
  
  let fieldValue: any;
  switch (field) {
    case 'callsign':
      fieldValue = aircraft.callsign;
      break;
    case 'id':
      fieldValue = aircraft.id;
      break;
    case 'originCountry':
      fieldValue = aircraft.originCountry;
      break;
    case 'altitude':
      fieldValue = aircraft.position.altitude;
      break;
    case 'speed':
      fieldValue = aircraft.position.speed;
      break;
    case 'heading':
      fieldValue = aircraft.position.heading;
      break;
    case 'latitude':
      fieldValue = aircraft.position.latitude;
      break;
    case 'longitude':
      fieldValue = aircraft.position.longitude;
      break;
    case 'onGround':
      fieldValue = aircraft.onGround;
      break;
    case 'squawk':
      fieldValue = aircraft.squawk;
      break;
    default:
      return false;
  }
  
  if (fieldValue === undefined || fieldValue === null) return false;
  
  switch (operator) {
    case 'equals':
      return String(fieldValue).toLowerCase() === String(value).toLowerCase();
    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
    case 'gt':
      return typeof fieldValue === 'number' && fieldValue > Number(value);
    case 'lt':
      return typeof fieldValue === 'number' && fieldValue < Number(value);
    case 'between':
      if (Array.isArray(value) && typeof fieldValue === 'number') {
        const [min, max] = value;
        // Handle wrap-around for heading (e.g., north: 315-45 spans across 0)
        if (field === 'heading' && min > max) {
          return fieldValue >= min || fieldValue <= max;
        }
        return fieldValue >= min && fieldValue <= max;
      }
      return false;
    default:
      return false;
  }
}

function matchesFreeText(aircraft: Aircraft, terms: string[]): boolean {
  if (terms.length === 0) return true;
  
  const searchableText = [
    aircraft.callsign,
    aircraft.id,
    aircraft.originCountry,
    aircraft.type,
    aircraft.squawk,
  ].filter(Boolean).join(' ').toLowerCase();
  
  return terms.some(term => searchableText.includes(term.toLowerCase()));
}

// Check if a specific field is matched by any filter
function isFieldMatched(field: string, filters: ParsedSearch['filters']): boolean {
  return filters.some(f => f.field === field);
}

// Check if a text value matches any free text term
function textMatchesFreeText(text: string | undefined | null, terms: string[]): boolean {
  if (!text || terms.length === 0) return false;
  return terms.some(term => text.toLowerCase().includes(term.toLowerCase()));
}

// Animated highlight component with left-to-right sweep
function MatchHighlight({ matched, children, label }: { matched: boolean; children: React.ReactNode; label?: string }) {
  return (
    <span className="flex items-center gap-1">
      {label && <span className="text-[#666]">{label}</span>}
      <span className={matched ? 'match-highlight text-[#00ff88] font-medium' : 'text-[#444]'}>
        {children}
      </span>
    </span>
  );
}

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<Aircraft[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeFilters, setActiveFilters] = useState<ParsedSearch['filters']>([]);
  const [activeFreeText, setActiveFreeText] = useState<string[]>([]);
  
  const aircraft = useRadarStore((state) => state.aircraft);
  const selectAircraft = useRadarStore((state) => state.selectAircraft);
  const hoverAircraft = useRadarStore((state) => state.hoverAircraft);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
    
    setIsSearching(true);
    
    try {
      // Try NLP search first
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          aircraftFields: ['callsign', 'id', 'originCountry', 'altitude', 'speed', 'heading', 'latitude', 'longitude', 'onGround', 'squawk'],
        }),
      });
      
      const parsed: ParsedSearch = await response.json();
      
      // Store filters for highlighting
      setActiveFilters(parsed.filters || []);
      setActiveFreeText(parsed.freeText || []);
      
      // Filter aircraft based on parsed query
      let filtered = aircraft;
      
      // Apply structured filters
      if (parsed.filters && parsed.filters.length > 0) {
        filtered = filtered.filter(ac => 
          parsed.filters.every(filter => matchesFilter(ac, filter))
        );
      }
      
      // Apply free text search
      if (parsed.freeText && parsed.freeText.length > 0) {
        filtered = filtered.filter(ac => matchesFreeText(ac, parsed.freeText));
      }
      
      // If no results from NLP, fall back to simple text search
      if (filtered.length === 0 && aircraft.length > 0) {
        const terms = searchQuery.toLowerCase().split(/\s+/);
        filtered = aircraft.filter(ac => matchesFreeText(ac, terms));
        // Update free text for highlighting in fallback mode
        setActiveFreeText(terms);
        setActiveFilters([]);
      }
      
      // Update results with total count
      setTotalMatches(filtered.length);
      setResults(filtered.slice(0, 50));
      setShowResults(true);
      setSelectedIndex(0);
      
    } catch (error) {
      console.error('Search error:', error);
      // Fallback to simple search
      const terms = searchQuery.toLowerCase().split(/\s+/);
      const filtered = aircraft.filter(ac => matchesFreeText(ac, terms));
      setActiveFilters([]);
      setActiveFreeText(terms);
      setTotalMatches(filtered.length);
      setResults(filtered.slice(0, 50));
      setShowResults(true);
      setSelectedIndex(0);
    } finally {
      setIsSearching(false);
    }
  }, [aircraft]);
  
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setQuery(value);
    
    // Debounce search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  }, [performSearch]);
  
  const handleResultClick = useCallback((ac: Aircraft) => {
    selectAircraft(ac.id);
    setShowResults(false);
    setQuery('');
  }, [selectAircraft]);
  
  // Close results when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);
  
  // "/" key to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if already typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  const [totalMatches, setTotalMatches] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  
  // Scroll selected item into view and show preview in TrackInfo
  useEffect(() => {
    if (resultsRef.current && results.length > 0) {
      const selectedEl = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      // Preview selected result in TrackInfo panel
      const selectedAircraft = results[selectedIndex];
      if (selectedAircraft && showResults) {
        hoverAircraft(selectedAircraft.id);
      }
    }
  }, [selectedIndex, results, showResults, hoverAircraft]);
  
  // Clear hover when results close
  useEffect(() => {
    if (!showResults) {
      hoverAircraft(null);
    }
  }, [showResults, hoverAircraft]);
  
  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Allow Enter to submit, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (results.length > 0 && selectedIndex >= 0) {
        const selected = results[selectedIndex];
        if (selected) {
          selectAircraft(selected.id);
          setShowResults(false);
          setQuery('');
        }
      }
    } else if (e.key === 'ArrowDown' && showResults) {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp' && showResults) {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Escape') {
      setShowResults(false);
    }
  }, [results, selectedIndex, selectAircraft, showResults]);

  return (
    <div className="relative min-w-[280px] w-[280px]">
      {/* Results panel - expands upward */}
      <div 
        className={`absolute bottom-full left-0 right-0 mb-1 transition-all duration-200 ease-out origin-bottom ${
          showResults && (results.length > 0 || (query && !isSearching)) 
            ? 'opacity-100 scale-y-100' 
            : 'opacity-0 scale-y-0 pointer-events-none'
        }`}
      >
        <div className="bg-black/95 border border-[#1a1a1a] backdrop-blur-sm">
          {/* Results header */}
          {results.length > 0 && (
            <div className="px-3 py-1.5 border-b border-[#1a1a1a] flex items-center justify-between">
              <span className="text-[9px] text-[#666]">
                {totalMatches > results.length 
                  ? `Showing ${results.length} of ${totalMatches} matches`
                  : `${results.length} match${results.length !== 1 ? 'es' : ''}`
                }
              </span>
              <span className="text-[8px] text-[#444]">↑↓ · Enter</span>
            </div>
          )}
          
          {/* Scrollable results list */}
          {results.length > 0 && (
            <div 
              ref={resultsRef}
              className="max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-[#333] scrollbar-track-transparent"
            >
              {results.map((ac, index) => {
                // Determine which fields are matched for highlighting
                const callsignMatched = isFieldMatched('callsign', activeFilters) || textMatchesFreeText(ac.callsign, activeFreeText);
                const idMatched = isFieldMatched('id', activeFilters) || textMatchesFreeText(ac.id, activeFreeText);
                const countryMatched = isFieldMatched('originCountry', activeFilters) || textMatchesFreeText(ac.originCountry, activeFreeText);
                const altitudeMatched = isFieldMatched('altitude', activeFilters);
                const speedMatched = isFieldMatched('speed', activeFilters);
                // "track" in aviation is the same as heading
                const headingMatched = isFieldMatched('heading', activeFilters) || isFieldMatched('track', activeFilters);
                const latLonMatched = isFieldMatched('latitude', activeFilters) || isFieldMatched('longitude', activeFilters);
                
                return (
                  <div
                    key={ac.id}
                    data-index={index}
                    onClick={() => handleResultClick(ac)}
                    className={`px-3 py-2 cursor-pointer border-b border-[#0a0a0a] last:border-0 transition-colors ${
                      index === selectedIndex 
                        ? 'bg-[#00ff88]/10 border-l-2 border-l-[#00ff88]' 
                        : 'hover:bg-[#111] border-l-2 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-medium ${callsignMatched ? 'match-highlight text-[#00ff88]' : 'text-white'}`}>
                          {ac.callsign || '—'}
                        </span>
                        <span className={`text-[9px] font-mono ${idMatched ? 'match-highlight text-[#00ff88]' : 'text-[#888]'}`}>
                          {ac.id.toUpperCase()}
                        </span>
                      </div>
                      <span className={`text-[9px] ${countryMatched ? 'match-highlight text-[#00ff88]' : 'text-[#555]'}`}>
                        {ac.originCountry}
                      </span>
                    </div>
                    <div className="text-[9px] mt-0.5 flex items-center gap-3">
                      <MatchHighlight matched={altitudeMatched} label="ALT">
                        {Math.round(ac.position.altitude).toLocaleString()} ft
                      </MatchHighlight>
                      <MatchHighlight matched={speedMatched} label="SPD">
                        {Math.round(ac.position.speed)} kts
                      </MatchHighlight>
                      <MatchHighlight matched={headingMatched} label="HDG">
                        {Math.round(ac.position.heading)}°
                      </MatchHighlight>
                      {latLonMatched && (
                        <span className="flex items-center gap-1">
                          <span className="text-[#666]">POS</span>
                          <span className="match-highlight text-[#00ff88]">✓</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* No results message */}
          {results.length === 0 && query && !isSearching && (
            <div className="p-4 text-center">
              <p className="text-[#444] text-[10px]">No aircraft found matching</p>
              <p className="text-[#666] text-[11px] font-mono mt-1">"{query}"</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Search input box */}
      <div className="bg-black/90 border border-[#1a1a1a]">
        <div className="border-b border-[#1a1a1a] px-3 py-2 text-[10px] text-[#666] flex items-center justify-between">
          <span>SEARCH_AIRCRAFT <span className="text-[#444]">[/]</span></span>
          {isSearching && <span className="text-[#00ff88] animate-pulse">PROCESSING...</span>}
        </div>
        <div className="p-3">
          <div className="relative">
            <textarea
              ref={inputRef}
              value={query}
              onChange={handleInputChange}
              onKeyDown={handleTextareaKeyDown}
              onFocus={() => query && setShowResults(true)}
              placeholder="Show me all United flights above 35,000 ft heading west"
              rows={3}
              className="w-full bg-black border border-[#333] px-3 py-2 text-[11px] text-white placeholder-[#444] focus:border-[#00ff88]/50 focus:outline-none font-mono resize-none overflow-hidden"
            />
            <div className="absolute right-2 bottom-2 text-[8px] text-[#333] flex items-center gap-1">
              <span className="text-[#444]">⏎</span> search
            </div>
          </div>
        </div>
        
        <div className="border-t border-[#1a1a1a] px-3 py-1.5 text-[8px] text-[#333]">
          NLP powered · Shift+Enter for newline
        </div>
      </div>
    </div>
  );
}

