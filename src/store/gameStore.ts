import { create } from 'zustand';

interface Position {
  latitude: number;
  longitude: number;
  altitude: number; // barometric altitude in feet
  heading: number; // true track in degrees
  speed: number; // ground speed in knots
  verticalRate?: number; // ft/min
  geoAltitude?: number; // GPS altitude in feet
}

interface Aircraft {
  id: string; // ICAO24 hex
  callsign: string;
  type: string;
  position: Position;
  timestamp: number;
  isPlayerControlled?: boolean;
  originCountry?: string;
  onGround?: boolean;
  squawk?: string | null;
  spi?: boolean; // special position indicator
  positionSource?: number; // 0=ADS-B, 1=ASTERIX, 2=MLAT
  lastContact?: number; // Unix timestamp
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
}

export type { Aircraft, Position };

export const useAirspaceStore = create<Store>((set) => ({
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
}));
