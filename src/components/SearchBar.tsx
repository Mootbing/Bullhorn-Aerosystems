'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRadarStore, Aircraft, Airport } from '@/store/gameStore';
import { EntityType } from '@/types/entities';
import { getEntityConfig } from '@/lib/entityRegistry';
import { UI } from '@/config/constants';

interface ParsedSearch {
  entityType: 'all' | EntityType;
  filters: {
    field: string;
    operator: 'equals' | 'contains' | 'gt' | 'lt' | 'between';
    value: string | number | [number, number];
  }[];
  freeText: string[];
}

interface SearchResult {
  type: EntityType;
  id: string;
  displayName: string;
  subtitle: string;
  data: Aircraft | Airport;
}

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
        return min > max ? (value >= min || value <= max) : (value >= min && value <= max);
      }
      return false;
    default:
      return false;
  }
}

function getFieldValue(entity: any, field: string): any {
  if (field === 'altitude') return entity.position?.altitude;
  if (field === 'speed') return entity.position?.speed;
  if (field === 'heading') return entity.position?.heading;
  return entity[field];
}

function matchesFilters(entity: any, filters: ParsedSearch['filters']): boolean {
  return filters.every(f => matchesFilter(getFieldValue(entity, f.field), f));
}

function matchesFreeText(text: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const lower = text.toLowerCase();
  return terms.some(t => lower.includes(t.toLowerCase()));
}

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const aircraft = useRadarStore((s) => s.aircraft);
  const airports = useRadarStore((s) => s.airports);
  const activeMode = useRadarStore((s) => s.gameState.activeMode);
  const selectEntity = useRadarStore((s) => s.selectEntity);
  const hoverEntity = useRadarStore((s) => s.hoverEntity);
  const setFocusLocation = useRadarStore((s) => s.setFocusLocation);
  const restoreCamera = useRadarStore((s) => s.restoreCamera);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
    
    setIsSearching(true);
    
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const parsed: ParsedSearch = await res.json();
      const searchResults: SearchResult[] = [];
      
      // Filter by both NLP-detected type AND active mode
      const shouldSearchAircraft = (activeMode === 'all' || activeMode === 'aircraft') &&
        (parsed.entityType === 'all' || parsed.entityType === 'aircraft');
      const shouldSearchAirports = (activeMode === 'all' || activeMode === 'airport') &&
        (parsed.entityType === 'all' || parsed.entityType === 'airport');
      
      if (shouldSearchAircraft) {
        aircraft.filter(ac => {
          if (parsed.filters.length > 0 && !matchesFilters(ac, parsed.filters)) return false;
          if (parsed.freeText.length > 0) {
            const s = [ac.callsign, ac.id, ac.originCountry, ac.type, ac.squawk].filter(Boolean).join(' ');
            if (!matchesFreeText(s, parsed.freeText)) return false;
          }
          return true;
        }).forEach(ac => {
          searchResults.push({
            type: 'aircraft',
            id: ac.id,
            displayName: ac.callsign || ac.id,
            subtitle: `${ac.originCountry || 'Unknown'} • ${Math.round(ac.position.altitude).toLocaleString()} ft`,
            data: ac,
          });
        });
      }
      
      if (shouldSearchAirports) {
        airports.filter(ap => {
          if (parsed.filters.length > 0 && !matchesFilters(ap, parsed.filters)) return false;
          if (parsed.freeText.length > 0) {
            const s = [ap.icao, ap.iata, ap.name, ap.city, ap.country].filter(Boolean).join(' ');
            if (!matchesFreeText(s, parsed.freeText)) return false;
          }
          return true;
        }).forEach(ap => {
          searchResults.push({
            type: 'airport',
            id: ap.icao,
            displayName: ap.iata || ap.icao,
            subtitle: `${ap.name} • ${ap.city || ap.country}`,
            data: ap,
          });
        });
      }
      
      setResults(searchResults.slice(0, UI.SEARCH_MAX_RESULTS));
      setShowResults(true);
      setSelectedIndex(0);
    } catch {
      // Fallback - respect activeMode
      const terms = q.toLowerCase().split(/\s+/);
      const searchResults: SearchResult[] = [];
      
      if (activeMode === 'all' || activeMode === 'aircraft') {
        aircraft.forEach(ac => {
          const s = [ac.callsign, ac.id, ac.originCountry].filter(Boolean).join(' ');
          if (matchesFreeText(s, terms)) {
            searchResults.push({ type: 'aircraft', id: ac.id, displayName: ac.callsign || ac.id, subtitle: ac.originCountry || 'Unknown', data: ac });
          }
        });
      }
      
      if (activeMode === 'all' || activeMode === 'airport') {
        airports.forEach(ap => {
          const s = [ap.icao, ap.iata, ap.name, ap.city, ap.country].filter(Boolean).join(' ');
          if (matchesFreeText(s, terms)) {
            searchResults.push({ type: 'airport', id: ap.icao, displayName: ap.iata || ap.icao, subtitle: ap.name || ap.city, data: ap });
          }
        });
      }
      
      setResults(searchResults.slice(0, UI.SEARCH_MAX_RESULTS));
      setShowResults(true);
      setSelectedIndex(0);
    } finally {
      setIsSearching(false);
    }
  }, [aircraft, airports, activeMode]);
  
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(e.target.value), UI.SEARCH_DEBOUNCE);
  }, [performSearch]);
  
  // Re-search when mode changes
  useEffect(() => {
    if (query.trim()) {
      performSearch(query);
    }
  }, [activeMode]); // eslint-disable-line react-hooks/exhaustive-deps
  
  const handleSelect = useCallback((r: SearchResult) => {
    // For aircraft: selectEntity triggers chase/follow view animation in CameraController
    // For airports: set focus location to pan camera
    if (r.type === 'aircraft') {
      selectEntity({ type: r.type, id: r.id });
    } else if (r.type === 'airport') {
      const ap = r.data as Airport;
      setFocusLocation({ lat: ap.lat, lon: ap.lon });
      selectEntity({ type: r.type, id: r.id });
    } else {
      selectEntity({ type: r.type, id: r.id });
    }
    setShowResults(false);
    setQuery('');
  }, [selectEntity, setFocusLocation]);
  
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  
  useEffect(() => {
    if (results.length > 0 && showResults) {
      const r = results[selectedIndex];
      if (r) {
        hoverEntity({ type: r.type, id: r.id });
        
        // Focus camera on the entity location
        if (r.type === 'aircraft') {
          const ac = r.data as Aircraft;
          setFocusLocation({ lat: ac.position.latitude, lon: ac.position.longitude, alt: ac.position.altitude });
        } else if (r.type === 'airport') {
          const ap = r.data as Airport;
          setFocusLocation({ lat: ap.lat, lon: ap.lon });
        }
      }
    }
  }, [selectedIndex, results, showResults, hoverEntity, setFocusLocation]);
  
  useEffect(() => {
    if (!showResults) {
      hoverEntity(null);
      restoreCamera();
    }
  }, [showResults, hoverEntity, restoreCamera]);
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown' && showResults) {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp' && showResults) {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowResults(false);
      setQuery('');
      inputRef.current?.blur();
    }
  }, [results, selectedIndex, showResults, handleSelect]);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Results dropdown - expands upward */}
      {showResults && results.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-black/95 border border-[#1a1a1a] max-h-[300px] overflow-y-auto custom-scrollbar">
          {results.map((r, i) => (
            <div
              key={`${r.type}-${r.id}`}
              onClick={() => handleSelect(r)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`px-3 py-2 cursor-pointer text-[10px] border-b border-[#0a0a0a] last:border-0 ${
                i === selectedIndex ? 'bg-[#00ff88]/10' : 'hover:bg-[#111]'
              }`}
            >
              <div className="flex items-center gap-2">
                <span style={{ color: getEntityConfig(r.type).color }}>{getEntityConfig(r.type).icon}</span>
                <span className="text-white">{r.displayName}</span>
                <span className="text-[#555] font-mono">{r.id.toUpperCase()}</span>
              </div>
              <div className="text-[#444] mt-0.5 pl-5">{r.subtitle}</div>
            </div>
          ))}
        </div>
      )}
      
      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => query && setShowResults(true)}
        placeholder="search [/]"
        className="w-full bg-black/30 backdrop-blur-md border border-[#333] px-3 py-1.5 text-[10px] text-white placeholder-[#555] focus:border-[#00ff88]/50 focus:outline-none"
      />
      
      {isSearching && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-[#00ff88]">...</div>
      )}
    </div>
  );
}
