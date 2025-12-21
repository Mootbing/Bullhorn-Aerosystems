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
  const selectedAircraft = useRadarStore((state) => state.gameState.selectedAircraft);
  const locationReady = useRadarStore((state) => state.locationReady);
  
  const hasInitialized = useRef(false);
  const lastFetchBounds = useRef<string>('');
  const cachedAircraft = useRef<Map<string, Aircraft>>(new Map());
  const fetchController = useRef<AbortController | null>(null);
  
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
      
      const url = `https://opensky-network.org/api/states/all?lamin=${lamin.toFixed(2)}&lamax=${lamax.toFixed(2)}&lomin=${lomin.toFixed(2)}&lomax=${lomax.toFixed(2)}`;
      
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: fetchController.current.signal,
      });
      
      if (!res.ok) throw new Error('API error');
      const text = await res.text();
      if (!text || !text.startsWith('{')) throw new Error('Invalid JSON');
      const data = JSON.parse(text);
      
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
        
        // Keep selected aircraft from cache if not in new data
        if (selectedAircraft && cachedAircraft.current.has(selectedAircraft) && !newAircraft.has(selectedAircraft)) {
          mergedAircraft.set(selectedAircraft, cachedAircraft.current.get(selectedAircraft)!);
        }
        
        // Update cache
        cachedAircraft.current = mergedAircraft;
        
        // Convert to array for store
        const aircraftArray = Array.from(mergedAircraft.values());
        
        if (aircraftArray.length > 0) {
          setAircraft(aircraftArray);
          return;
        }
      }
      throw new Error('No data');
    } catch (e: any) {
      if (e.name === 'AbortError') return; // Ignore aborted requests
      
      console.log('Using mock data:', e.message);
      if (aircraft.length === 0) {
        setAircraft(generateMockData(bounds));
      }
    }
  }, [isPolling, setAircraft, aircraft.length, selectedAircraft]);
  
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
  useEffect(() => {
    if (!isPolling || !locationReady || !viewportBounds) return;
    const interval = setInterval(() => fetchData(viewportBounds), 15000);
    return () => clearInterval(interval);
  }, [isPolling, fetchData, viewportBounds, locationReady]);
  
  return null;
}
