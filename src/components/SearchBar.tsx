'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRadarStore, Aircraft, Airport } from '@/store/gameStore';
import { EntityType, getEntityTypeName } from '@/types/entities';
import { getEntityConfig } from '@/lib/entityRegistry';

// ============================================================================
// TYPES
// ============================================================================

interface ParsedSearch {
  entityType: 'all' | EntityType;
  filters: {
    field: string;
    operator: 'equals' | 'contains' | 'gt' | 'lt' | 'between';
    value: string | number | [number, number];
  }[];
  freeText: string[];
  fallback?: boolean;
  error?: boolean;
}

interface SearchResult {
  type: EntityType;
  id: string;
  displayName: string;
  subtitle: string;
  data: Aircraft | Airport;
}

// ============================================================================
// FILTER MATCHING
// ============================================================================

function matchesFilter(value: any, filter: ParsedSearch['filters'][0]): boolean {
  if (value === undefined || value === null) return false;
  
  const { operator, value: filterValue } = filter;
  
  switch (operator) {
    case 'equals':
      return String(value).toLowerCase() === String(filterValue).toLowerCase();
    case 'contains':
      return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
    case 'gt':
      return typeof value === 'number' && value > Number(filterValue);
    case 'lt':
      return typeof value === 'number' && value < Number(filterValue);
    case 'between':
      if (Array.isArray(filterValue) && typeof value === 'number') {
        const [min, max] = filterValue;
        if (min > max) {
          return value >= min || value <= max;
        }
        return value >= min && value <= max;
      }
      return false;
    default:
      return false;
  }
}

function getFieldValue(entity: any, field: string): any {
  // Handle nested fields and common mappings
  if (field === 'altitude') return entity.position?.altitude;
  if (field === 'speed') return entity.position?.speed;
  if (field === 'heading') return entity.position?.heading;
  if (field === 'latitude') return entity.position?.latitude;
  if (field === 'longitude') return entity.position?.longitude;
  
  return entity[field];
}

function matchesFilters(entity: any, filters: ParsedSearch['filters']): boolean {
  return filters.every(filter => {
    const value = getFieldValue(entity, filter.field);
    return matchesFilter(value, filter);
  });
}

function matchesFreeText(searchableText: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const lower = searchableText.toLowerCase();
  return terms.some(term => lower.includes(term.toLowerCase()));
}

// ============================================================================
// SEARCH BAR COMPONENT
// ============================================================================

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [searchEntityType, setSearchEntityType] = useState<'all' | EntityType>('all');
  
  const aircraft = useRadarStore((state) => state.aircraft);
  const airports = useRadarStore((state) => state.airports);
  const selectEntity = useRadarStore((state) => state.selectEntity);
  const hoverEntity = useRadarStore((state) => state.hoverEntity);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  
  // Perform search across all entity types
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
        body: JSON.stringify({ query: searchQuery }),
      });
      
      const parsed: ParsedSearch = await response.json();
      setSearchEntityType(parsed.entityType);
      
      const searchResults: SearchResult[] = [];
      
      // Search aircraft
      if (parsed.entityType === 'all' || parsed.entityType === 'aircraft') {
        const config = getEntityConfig('aircraft');
        
        const matchedAircraft = aircraft.filter(ac => {
          if (parsed.filters.length > 0 && !matchesFilters(ac, parsed.filters)) {
            return false;
          }
          if (parsed.freeText.length > 0) {
            const searchable = [ac.callsign, ac.id, ac.originCountry, ac.type, ac.squawk]
              .filter(Boolean).join(' ');
            if (!matchesFreeText(searchable, parsed.freeText)) {
              return false;
            }
          }
          return true;
        });
        
        matchedAircraft.forEach(ac => {
          searchResults.push({
            type: 'aircraft',
            id: ac.id,
            displayName: ac.callsign || ac.id,
            subtitle: `${ac.originCountry || 'Unknown'} • ${Math.round(ac.position.altitude).toLocaleString()} ft`,
            data: ac,
          });
        });
      }
      
      // Search airports
      if (parsed.entityType === 'all' || parsed.entityType === 'airport') {
        const matchedAirports = airports.filter(ap => {
          if (parsed.filters.length > 0 && !matchesFilters(ap, parsed.filters)) {
            return false;
          }
          if (parsed.freeText.length > 0) {
            const searchable = [ap.icao, ap.iata, ap.name, ap.city, ap.country]
              .filter(Boolean).join(' ');
            if (!matchesFreeText(searchable, parsed.freeText)) {
              return false;
            }
          }
          return true;
        });
        
        matchedAirports.forEach(ap => {
          searchResults.push({
            type: 'airport',
            id: ap.icao,
            displayName: ap.iata || ap.icao,
            subtitle: `${ap.name} • ${ap.city || ap.country}`,
            data: ap,
          });
        });
      }
      
      // Sort results: prioritize exact matches
      searchResults.sort((a, b) => {
        const aExact = a.displayName.toLowerCase() === searchQuery.toLowerCase();
        const bExact = b.displayName.toLowerCase() === searchQuery.toLowerCase();
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return 0;
      });
      
      setTotalMatches(searchResults.length);
      setResults(searchResults.slice(0, 50));
      setShowResults(true);
      setSelectedIndex(0);
      
    } catch (error) {
      console.error('Search error:', error);
      // Fallback to simple search
      const terms = searchQuery.toLowerCase().split(/\s+/);
      const searchResults: SearchResult[] = [];
      
      aircraft.forEach(ac => {
        const searchable = [ac.callsign, ac.id, ac.originCountry].filter(Boolean).join(' ');
        if (matchesFreeText(searchable, terms)) {
          searchResults.push({
            type: 'aircraft',
            id: ac.id,
            displayName: ac.callsign || ac.id,
            subtitle: ac.originCountry || 'Unknown',
            data: ac,
          });
        }
      });
      
      airports.forEach(ap => {
        const searchable = [ap.icao, ap.iata, ap.name, ap.city, ap.country].filter(Boolean).join(' ');
        if (matchesFreeText(searchable, terms)) {
          searchResults.push({
            type: 'airport',
            id: ap.icao,
            displayName: ap.iata || ap.icao,
            subtitle: ap.name || ap.city,
            data: ap,
          });
        }
      });
      
      setTotalMatches(searchResults.length);
      setResults(searchResults.slice(0, 50));
      setShowResults(true);
      setSelectedIndex(0);
    } finally {
      setIsSearching(false);
    }
  }, [aircraft, airports]);
  
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setQuery(value);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  }, [performSearch]);
  
  const handleResultClick = useCallback((result: SearchResult) => {
    selectEntity({ type: result.type, id: result.id });
    setShowResults(false);
    setQuery('');
  }, [selectEntity]);
  
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
  
  // Scroll selected item into view and preview
  useEffect(() => {
    if (resultsRef.current && results.length > 0) {
      const selectedEl = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      const selectedResult = results[selectedIndex];
      if (selectedResult && showResults) {
        hoverEntity({ type: selectedResult.type, id: selectedResult.id });
      }
    }
  }, [selectedIndex, results, showResults, hoverEntity]);
  
  // Clear hover when results close
  useEffect(() => {
    if (!showResults) {
      hoverEntity(null);
    }
  }, [showResults, hoverEntity]);
  
  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (results.length > 0 && selectedIndex >= 0) {
        const selected = results[selectedIndex];
        if (selected) {
          selectEntity({ type: selected.type, id: selected.id });
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
  }, [results, selectedIndex, selectEntity, showResults]);
  
  // Get entity type icon
  const getTypeIcon = (type: EntityType): string => {
    return getEntityConfig(type).icon;
  };
  
  // Get entity type color
  const getTypeColor = (type: EntityType): string => {
    return getEntityConfig(type).color;
  };

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
                  ? `Showing ${results.length} of ${totalMatches}`
                  : `${results.length} result${results.length !== 1 ? 's' : ''}`
                }
                {searchEntityType !== 'all' && (
                  <span className="ml-1 text-[#00ff88]">
                    [{searchEntityType.toUpperCase()}]
                  </span>
                )}
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
              {results.map((result, index) => (
                <div
                  key={`${result.type}-${result.id}`}
                  data-index={index}
                  onClick={() => handleResultClick(result)}
                  className={`px-3 py-2 cursor-pointer border-b border-[#0a0a0a] last:border-0 transition-colors ${
                    index === selectedIndex 
                      ? 'bg-[#00ff88]/10 border-l-2 border-l-[#00ff88]' 
                      : 'hover:bg-[#111] border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span 
                        className="text-[10px]"
                        style={{ color: getTypeColor(result.type) }}
                      >
                        {getTypeIcon(result.type)}
                      </span>
                      <span className="text-[11px] font-medium text-white">
                        {result.displayName}
                      </span>
                      <span className="text-[9px] font-mono text-[#666]">
                        {result.type === 'aircraft' ? result.id.toUpperCase() : result.id}
                      </span>
                    </div>
                  </div>
                  <div className="text-[9px] text-[#555] mt-0.5 pl-5">
                    {result.subtitle}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* No results message */}
          {results.length === 0 && query && !isSearching && (
            <div className="p-4 text-center">
              <p className="text-[#444] text-[10px]">No results found for</p>
              <p className="text-[#666] text-[11px] font-mono mt-1">"{query}"</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Search input box */}
      <div className="bg-black/90 border border-[#1a1a1a]">
        <div className="border-b border-[#1a1a1a] px-3 py-2 text-[10px] text-[#666] flex items-center justify-between">
          <span>SEARCH <span className="text-[#444]">[/]</span></span>
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
              placeholder="Search aircraft, airports, missiles..."
              rows={2}
              className="w-full bg-black border border-[#333] px-3 py-2 text-[11px] text-white placeholder-[#444] focus:border-[#00ff88]/50 focus:outline-none font-mono resize-none overflow-hidden"
            />
            <div className="absolute right-2 bottom-2 text-[8px] text-[#333] flex items-center gap-1">
              <span className="text-[#444]">⏎</span> search
            </div>
          </div>
        </div>
        
        <div className="border-t border-[#1a1a1a] px-3 py-1.5 text-[8px] text-[#333]">
          NLP powered · Try "airports in Germany" or "flights above 35k ft"
        </div>
      </div>
    </div>
  );
}
