import { create } from 'zustand';

interface Position {
  latitude: number;
  longitude: number;
  altitude: number;
  heading: number;
  speed: number;
  verticalRate?: number;
  geoAltitude?: number;
}

interface Aircraft {
  id: string;
  callsign: string;
  type: string;
  position: Position;
  timestamp: number;
  isPlayerControlled?: boolean;
  originCountry?: string;
  onGround?: boolean;
  squawk?: string | null;
  spi?: boolean;
  positionSource?: number;
  lastContact?: number;
}

interface TrackWaypoint {
  time: number;
  latitude: number;
  longitude: number;
  altitude: number;
  heading: number;
}

interface FlightTrack {
  icao24: string;
  callsign: string;
  startTime: number;
  endTime: number;
  waypoints: TrackWaypoint[];
  fetchedAt: number;
  isLoading?: boolean;
  error?: string;
}

interface GameState {
  isPlaying: boolean;
  isPaused: boolean;
  selectedAircraft: string | null;
  hoveredAircraft: string | null;
  hoveredAirport: string | null;
  controlledAircraft: Set<string>;
  score: number;
  landedAircraft: string[];
  crashedAircraft: string[];
}

interface ViewportBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  centerLat: number;
  centerLon: number;
  zoomLevel: number; // 0-1, where 1 is fully zoomed out
}

interface Airport {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  elevation: number;
  type: 'large_airport' | 'medium_airport' | 'small_airport' | 'heliport' | 'seaplane_base' | 'closed';
  scheduled_service: boolean;
}

interface Store {
  aircraft: Aircraft[];
  setAircraft: (a: Aircraft[]) => void;
  removeAircraft: (ids: string[]) => void;
  gameState: GameState;
  startGame: (t: number) => void;
  endGame: () => void;
  selectAircraft: (id: string | null) => void;
  hoverAircraft: (id: string | null) => void;
  hoverAirport: (icao: string | null) => void;
  takeControlOfAircraft: (id: string) => void;
  isPolling: boolean;
  setPolling: (p: boolean) => void;
  flightTracks: Map<string, FlightTrack>;
  fetchFlightTrack: (icao24: string) => Promise<void>;
  clearFlightTrack: (icao24: string) => void;
  viewportBounds: ViewportBounds | null;
  setViewportBounds: (bounds: ViewportBounds) => void;
  locationReady: boolean;
  setLocationReady: (ready: boolean) => void;
  airports: Airport[];
  airportsLoading: boolean;
  airportsError: string | null;
  fetchAirports: () => Promise<void>;
}

export type { Aircraft, Position, TrackWaypoint, FlightTrack, ViewportBounds, Airport };

export const useRadarStore = create<Store>((set, get) => ({
  aircraft: [],
  setAircraft: (aircraft) => set({ aircraft }),
  removeAircraft: (ids) => set((state) => ({
    aircraft: state.aircraft.filter((a) => !ids.includes(a.id)),
  })),
  gameState: {
    isPlaying: false,
    isPaused: false,
    selectedAircraft: null,
    hoveredAircraft: null,
    hoveredAirport: null,
    controlledAircraft: new Set(),
    score: 0,
    landedAircraft: [],
    crashedAircraft: [],
  },
  startGame: () => set((s) => ({ gameState: { ...s.gameState, isPlaying: true, score: 0 } })),
  endGame: () => set((s) => ({ gameState: { ...s.gameState, isPlaying: false } })),
  selectAircraft: (id) => set((s) => ({ gameState: { ...s.gameState, selectedAircraft: id } })),
  hoverAircraft: (id) => set((s) => ({ gameState: { ...s.gameState, hoveredAircraft: id, hoveredAirport: null } })),
  hoverAirport: (icao) => set((s) => ({ gameState: { ...s.gameState, hoveredAirport: icao, hoveredAircraft: null } })),
  takeControlOfAircraft: (id) =>
    set((s) => {
      const c = new Set(s.gameState.controlledAircraft);
      c.add(id);
      return {
        gameState: { ...s.gameState, controlledAircraft: c },
        aircraft: s.aircraft.map((a) => (a.id === id ? { ...a, isPlayerControlled: true } : a)),
      };
    }),
  isPolling: true,
  setPolling: (isPolling) => set({ isPolling }),
  flightTracks: new Map(),
  fetchFlightTrack: async (icao24: string) => {
    const { flightTracks, aircraft } = get();
    
    const existing = flightTracks.get(icao24);
    if (existing && !existing.error && Date.now() - existing.fetchedAt < 60000) {
      return;
    }
    
    if (existing?.isLoading) {
      return;
    }
    
    // Check if this is a mock aircraft (ID starts with "mock_")
    const isMockAircraft = icao24.startsWith('mock_');
    
    const newTracks = new Map(flightTracks);
    newTracks.set(icao24, {
      icao24,
      callsign: '',
      startTime: 0,
      endTime: 0,
      waypoints: [],
      fetchedAt: Date.now(),
      isLoading: true,
    });
    set({ flightTracks: newTracks });
    
    // Generate mock flight path for mock aircraft
    if (isMockAircraft) {
      const mockAircraft = aircraft.find(a => a.id === icao24);
      if (mockAircraft) {
        const waypoints: TrackWaypoint[] = [];
        const { latitude, longitude, altitude, heading, speed } = mockAircraft.position;
        
        // Generate past waypoints (going backwards in time)
        // Create 20 waypoints over the last 30 minutes
        const now = Date.now();
        const waypointCount = 20;
        const totalMinutes = 30;
        
        for (let i = waypointCount; i >= 0; i--) {
          const minutesAgo = (i / waypointCount) * totalMinutes;
          const time = now - minutesAgo * 60 * 1000;
          
          // Calculate position going backwards from current position
          // Speed is in knots, approximate degrees per minute
          const speedDegPerMin = (speed / 60) / 60;
          const distance = speedDegPerMin * minutesAgo;
          
          // Reverse heading to go backwards
          const reverseHeadingRad = ((heading + 180) % 360) * (Math.PI / 180);
          
          // Add some slight randomness to make the path look more natural
          const jitter = (Math.random() - 0.5) * 0.02;
          const pastLat = latitude + distance * Math.cos(reverseHeadingRad) + jitter;
          const pastLon = longitude + distance * Math.sin(reverseHeadingRad) + jitter;
          
          // Slight altitude variation
          const altVariation = (Math.random() - 0.5) * 2000;
          const pastAlt = Math.max(5000, altitude + altVariation * (minutesAgo / totalMinutes));
          
          waypoints.push({
            time: Math.floor(time / 1000),
            latitude: Math.max(-90, Math.min(90, pastLat)),
            longitude: ((pastLon + 180) % 360) - 180,
            altitude: pastAlt,
            heading: heading + (Math.random() - 0.5) * 5, // Slight heading variation
          });
        }
        
        const updatedTracks = new Map(get().flightTracks);
        updatedTracks.set(icao24, {
          icao24,
          callsign: mockAircraft.callsign,
          startTime: Math.floor((now - totalMinutes * 60 * 1000) / 1000),
          endTime: Math.floor(now / 1000),
          waypoints,
          fetchedAt: Date.now(),
          isLoading: false,
        });
        set({ flightTracks: updatedTracks });
        return;
      }
    }
    
    try {
      const res = await fetch(`https://opensky-network.org/api/tracks/all?icao24=${icao24}&time=0`, {
        headers: { 'Accept': 'application/json' },
      });
      
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (!data.path || data.path.length === 0) {
        throw new Error('No track data available');
      }
      
      const waypoints: TrackWaypoint[] = data.path
        .filter((p: number[]) => p[1] != null && p[2] != null)
        .map((p: number[]) => ({
          time: p[0],
          latitude: p[1],
          longitude: p[2],
          altitude: (p[3] || 0) * 3.28084,
          heading: p[4] || 0,
        }));
      
      const updatedTracks = new Map(get().flightTracks);
      updatedTracks.set(icao24, {
        icao24: data.icao24 || icao24,
        callsign: data.callsign || '',
        startTime: data.startTime || 0,
        endTime: data.endTime || 0,
        waypoints,
        fetchedAt: Date.now(),
        isLoading: false,
      });
      set({ flightTracks: updatedTracks });
      
    } catch (error) {
      console.log('Failed to fetch flight track:', error);
      const updatedTracks = new Map(get().flightTracks);
      updatedTracks.set(icao24, {
        icao24,
        callsign: '',
        startTime: 0,
        endTime: 0,
        waypoints: [],
        fetchedAt: Date.now(),
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      set({ flightTracks: updatedTracks });
    }
  },
  clearFlightTrack: (icao24: string) => {
    const newTracks = new Map(get().flightTracks);
    newTracks.delete(icao24);
    set({ flightTracks: newTracks });
  },
  viewportBounds: null,
  setViewportBounds: (bounds) => set({ viewportBounds: bounds }),
  locationReady: false,
  setLocationReady: (ready) => set({ locationReady: ready }),
  airports: [],
  airportsLoading: false,
  airportsError: null,
  fetchAirports: async () => {
    const { airports, airportsLoading } = get();
    
    // Don't refetch if already loaded or loading
    if (airports.length > 0 || airportsLoading) {
      return;
    }
    
    set({ airportsLoading: true, airportsError: null });
    
    try {
      const res = await fetch('/api/airports');
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      
      const data = await res.json();
      console.log(`[Airports] Loaded ${data.airports.length} airports`);
      
      set({ 
        airports: data.airports, 
        airportsLoading: false 
      });
    } catch (error) {
      console.error('[Airports] Failed to fetch:', error);
      set({ 
        airportsLoading: false, 
        airportsError: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  },
}));