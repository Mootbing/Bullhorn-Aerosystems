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

interface Store {
  aircraft: Aircraft[];
  setAircraft: (a: Aircraft[]) => void;
  gameState: GameState;
  startGame: (t: number) => void;
  endGame: () => void;
  selectAircraft: (id: string | null) => void;
  hoverAircraft: (id: string | null) => void;
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
}

export type { Aircraft, Position, TrackWaypoint, FlightTrack, ViewportBounds };

export const useRadarStore = create<Store>((set, get) => ({
  aircraft: [],
  setAircraft: (aircraft) => set({ aircraft }),
  gameState: {
    isPlaying: false,
    isPaused: false,
    selectedAircraft: null,
    hoveredAircraft: null,
    controlledAircraft: new Set(),
    score: 0,
    landedAircraft: [],
    crashedAircraft: [],
  },
  startGame: () => set((s) => ({ gameState: { ...s.gameState, isPlaying: true, score: 0 } })),
  endGame: () => set((s) => ({ gameState: { ...s.gameState, isPlaying: false } })),
  selectAircraft: (id) => set((s) => ({ gameState: { ...s.gameState, selectedAircraft: id } })),
  hoverAircraft: (id) => set((s) => ({ gameState: { ...s.gameState, hoveredAircraft: id } })),
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
    const { flightTracks } = get();
    
    const existing = flightTracks.get(icao24);
    if (existing && !existing.error && Date.now() - existing.fetchedAt < 60000) {
      return;
    }
    
    if (existing?.isLoading) {
      return;
    }
    
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
}));