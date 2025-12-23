'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useRadarStore, ViewportBounds, Aircraft } from '@/store/gameStore';

function generateMockData(bounds: ViewportBounds | null, count: number = 50) {
  const countries = ['United States', 'China', 'Germany', 'United Kingdom', 'France', 'Japan', 'Australia', 'Canada', 'Brazil', 'India'];
  const aircraft = [];
  
  // Generate aircraft within bounds (or globally if no bounds)
  const latMin = bounds?.minLat ?? -70;
  const latMax = bounds?.maxLat ?? 70;
  const lonMin = bounds?.minLon ?? -180;
  const lonMax = bounds?.maxLon ?? 180;
  
  for (let i = 0; i < count; i++) {
    const verticalRate = (Math.random() - 0.5) * 2000;
    aircraft.push({
      id: `mock_${i}_${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`,
      callsign: `${['UAL', 'DAL', 'AAL', 'SWA', 'JBU', 'ASA', 'BAW', 'AFR', 'DLH', 'CCA'][Math.floor(Math.random() * 10)]}${Math.floor(Math.random() * 9999)}`,
      type: ['B737', 'A320', 'B777', 'A350', 'B380', 'E190'][Math.floor(Math.random() * 6)],
      position: {
        latitude: latMin + Math.random() * (latMax - latMin),
        longitude: lonMin + Math.random() * (lonMax - lonMin),
        altitude: 25000 + Math.random() * 20000,
        heading: Math.random() * 360,
        speed: 400 + Math.random() * 200,
        verticalRate: verticalRate,
        geoAltitude: 25000 + Math.random() * 20000,
      },
      timestamp: Date.now(),
      originCountry: countries[Math.floor(Math.random() * countries.length)],
      onGround: false,
      squawk: Math.floor(Math.random() * 7777).toString().padStart(4, '0'),
      positionSource: 0,
      lastContact: Date.now() / 1000,
    });
  }
  return aircraft;
}

// Debug supersonic aircraft - always visible for testing prediction
function createSupersonicDebugAircraft() {
  return {
    id: 'debug_supersonic_sr71',
    callsign: 'SR71DBG',
    type: 'SR-71',
    position: {
      latitude: 40.7128, // New York
      longitude: -74.006,
      altitude: 85000, // 85,000 ft - SR-71 cruise altitude
      heading: 45, // Northeast
      speed: 1900, // ~Mach 3
      verticalRate: 0,
      geoAltitude: 85000,
    },
    timestamp: Date.now(),
    originCountry: 'United States',
    onGround: false,
    squawk: '7777',
    positionSource: 0,
    lastContact: Date.now() / 1000,
  };
}

// Normalize longitude to -180 to 180 range
function normalizeLon(lon: number): number {
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}

// Check if a point is within bounds (handles wraparound for longitude)
function isInBounds(lat: number, lon: number, bounds: ViewportBounds): boolean {
  if (lat < bounds.minLat || lat > bounds.maxLat) return false;
  
  // Handle longitude wraparound
  const normalizedLon = normalizeLon(lon);
  const minLon = normalizeLon(bounds.minLon);
  const maxLon = normalizeLon(bounds.maxLon);
  
  if (minLon <= maxLon) {
    return normalizedLon >= minLon && normalizedLon <= maxLon;
  } else {
    // Wraps around the date line
    return normalizedLon >= minLon || normalizedLon <= maxLon;
  }
}

// Parse OpenSky state vector into Aircraft object
function parseStateVector(s: any[]): Aircraft | null {
  if (s[5] == null || s[6] == null) return null;
  
  return {
    id: s[0],
    callsign: (s[1] || '').trim() || 'N/A',
    type: 'UNKNOWN',
    position: {
      longitude: s[5],
      latitude: s[6],
      altitude: (s[7] || 0) * 3.28084, // m to ft
      heading: s[10] || 0,
      speed: (s[9] || 0) * 1.94384, // m/s to kts
      verticalRate: (s[11] || 0) * 196.850, // m/s to ft/min
      geoAltitude: (s[13] || 0) * 3.28084,
    },
    timestamp: Date.now(),
    originCountry: s[2] || 'Unknown',
    onGround: s[8] || false,
    squawk: s[14] || null,
    spi: s[15] || false,
    positionSource: s[16] || 0,
    lastContact: s[4] || null,
  };
}

export function DataPoller() {
  const isPolling = useRadarStore((state) => state.isPolling);
  const setAircraft = useRadarStore((state) => state.setAircraft);
  const aircraft = useRadarStore((state) => state.aircraft);
  const viewportBounds = useRadarStore((state) => state.viewportBounds);
  const locationReady = useRadarStore((state) => state.locationReady);
  
  const hasInitialized = useRef(false);
  const lastFetchBounds = useRef<string>('');
  const fetchController = useRef<AbortController | null>(null);
  const lastFetchTime = useRef(0);
  const consecutiveErrors = useRef(0);
  
  // Keep cache in sync with store (for when aircraft are deloaded)
  const cachedAircraft = useRef<Map<string, Aircraft>>(new Map());
  useEffect(() => {
    // Sync cache with current store state
    const currentIds = new Set(aircraft.map(a => a.id));
    cachedAircraft.current.forEach((_, id) => {
      if (!currentIds.has(id)) {
        cachedAircraft.current.delete(id);
      }
    });
    // Update cache with current aircraft data
    aircraft.forEach(ac => {
      cachedAircraft.current.set(ac.id, ac);
    });
  }, [aircraft]);
  
  const fetchData = useCallback(async (bounds: ViewportBounds | null) => {
    // Don't fetch until location and viewport are ready
    if (!isPolling || !bounds) return;
    
    // Cancel any in-flight request
    if (fetchController.current) {
      fetchController.current.abort();
    }
    fetchController.current = new AbortController();
    
    try {
      // Build URL with bounding box - always required now
      const lamin = Math.max(-90, bounds.minLat);
      const lamax = Math.min(90, bounds.maxLat);
      const lomin = normalizeLon(bounds.minLon);
      const lomax = normalizeLon(bounds.maxLon);
      
      // Use our internal API route which handles auth and rate limiting
      const url = `/api/aircraft?lamin=${lamin.toFixed(2)}&lamax=${lamax.toFixed(2)}&lomin=${lomin.toFixed(2)}&lomax=${lomax.toFixed(2)}`;
      
      console.log('[DataPoller] Fetching via API route...');
      
      const res = await fetch(url, {
        signal: fetchController.current.signal,
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 429) {
          const retryAfter = errorData.retryAfter || 10;
          console.warn(`[DataPoller] Rate limited. Retry in ${retryAfter}s`);
          consecutiveErrors.current++;
          throw new Error(`Rate limited - retry in ${retryAfter}s`);
        }
        throw new Error(errorData.message || `API error: ${res.status}`);
      }
      
      const data = await res.json();
      consecutiveErrors.current = 0; // Reset on success
      lastFetchTime.current = Date.now();
      
      console.log('[DataPoller] Received', data.states?.length || 0, 'aircraft');
      
      if (data.states && data.states.length > 0) {
        const newAircraft = new Map<string, Aircraft>();
        
        // Parse all aircraft from API
        for (const state of data.states) {
          const ac = parseStateVector(state);
          if (ac) {
            newAircraft.set(ac.id, ac);
          }
        }
        
        // Merge with cached aircraft for smooth transitions
        // Keep selected aircraft even if out of bounds
        const mergedAircraft = new Map<string, Aircraft>();
        
        // Add new aircraft
        newAircraft.forEach((ac, id) => {
          mergedAircraft.set(id, ac);
        });
        
        // Get the CURRENT selected aircraft from store (not stale closure value)
        // This fixes the bug where selecting an aircraft during a fetch would lose it
        const currentSelectedEntity = useRadarStore.getState().gameState.selectedEntity;
        const currentSelectedAircraft = currentSelectedEntity?.type === 'aircraft' ? currentSelectedEntity.id : null;
        
        // Keep selected aircraft from cache if not in new data
        if (currentSelectedAircraft && cachedAircraft.current.has(currentSelectedAircraft) && !newAircraft.has(currentSelectedAircraft)) {
          mergedAircraft.set(currentSelectedAircraft, cachedAircraft.current.get(currentSelectedAircraft)!);
        }
        
        // Update cache
        cachedAircraft.current = mergedAircraft;
        
        // Convert to array for store, add debug supersonic aircraft
        const aircraftArray = Array.from(mergedAircraft.values());
        
        // Always add supersonic debug aircraft
        const debugAircraft = createSupersonicDebugAircraft();
        const existingDebugIdx = aircraftArray.findIndex(a => a.id === debugAircraft.id);
        if (existingDebugIdx === -1) {
          aircraftArray.push(debugAircraft);
        }
        
        if (aircraftArray.length > 0) {
          setAircraft(aircraftArray);
          return;
        }
      }
      throw new Error('No data');
    } catch (e: any) {
      if (e.name === 'AbortError') return; // Ignore aborted requests
      
      console.warn('[DataPoller] API failed:', e.message);
      // Only use mock data if we have absolutely no data yet
      // Once we have any data (real or mock), don't replace it on API failure
      if (aircraft.length === 0) {
        console.log('[DataPoller] No data available, using mock data as fallback');
        const mockData = generateMockData(bounds);
        mockData.push(createSupersonicDebugAircraft());
        setAircraft(mockData);
      } else {
        console.log('[DataPoller] Keeping existing', aircraft.length, 'aircraft');
      }
    }
  }, [isPolling, setAircraft, aircraft.length]);
  
  // Initial fetch - only when location is ready and we have viewport bounds
  useEffect(() => {
    if (!hasInitialized.current && locationReady && viewportBounds) {
      hasInitialized.current = true;
      fetchData(viewportBounds);
    }
  }, [fetchData, viewportBounds, locationReady]);
  
  // Fetch when viewport changes significantly
  useEffect(() => {
    if (!viewportBounds || !isPolling || !locationReady) return;
    
    // Create a key for current bounds (rounded to reduce fetches)
    const boundsKey = `${Math.round(viewportBounds.centerLat / 5) * 5},${Math.round(viewportBounds.centerLon / 5) * 5},${viewportBounds.zoomLevel.toFixed(1)}`;
    
    if (boundsKey !== lastFetchBounds.current) {
      lastFetchBounds.current = boundsKey;
      // Debounce viewport changes
      const timeout = setTimeout(() => {
        fetchData(viewportBounds);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [viewportBounds, isPolling, fetchData, locationReady]);
  
  // Regular polling interval - only when location is ready
  // Use longer intervals to stay well under rate limits
  useEffect(() => {
    if (!isPolling || !locationReady || !viewportBounds) return;
    
    // Increase interval based on consecutive errors (exponential backoff)
    const baseInterval = 15000; // 15 seconds base
    const backoffMultiplier = Math.min(Math.pow(2, consecutiveErrors.current), 8); // Max 8x = 2 minutes
    const interval = baseInterval * backoffMultiplier;
    
    console.log(`[DataPoller] Polling every ${interval / 1000}s (errors: ${consecutiveErrors.current})`);
    
    const timer = setInterval(() => fetchData(viewportBounds), interval);
    return () => clearInterval(timer);
  }, [isPolling, fetchData, viewportBounds, locationReady]);
  
  return null;
}
