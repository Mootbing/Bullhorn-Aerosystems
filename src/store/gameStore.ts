import { create } from 'zustand';

interface Position { latitude: number; longitude: number; altitude: number; heading: number; speed: number; }
interface Aircraft { id: string; callsign: string; type: string; position: Position; timestamp: number; isPlayerControlled?: boolean; }
interface GameState { isPlaying: boolean; isPaused: boolean; selectedAircraft: string | null; controlledAircraft: Set<string>; score: number; landedAircraft: string[]; crashedAircraft: string[]; }

interface Store {
  aircraft: Aircraft[];
  setAircraft: (a: Aircraft[]) => void;
  gameState: GameState;
  startGame: (t: number) => void;
  endGame: () => void;
  selectAircraft: (id: string | null) => void;
  takeControlOfAircraft: (id: string) => void;
  isPolling: boolean;
  setPolling: (p: boolean) => void;
}

export const useAirspaceStore = create<Store>((set) => ({
  aircraft: [],
  setAircraft: (aircraft) => set({ aircraft }),
  gameState: { isPlaying: false, isPaused: false, selectedAircraft: null, controlledAircraft: new Set(), score: 0, landedAircraft: [], crashedAircraft: [] },
  startGame: () => set((s) => ({ gameState: { ...s.gameState, isPlaying: true, score: 0 } })),
  endGame: () => set((s) => ({ gameState: { ...s.gameState, isPlaying: false } })),
  selectAircraft: (id) => set((s) => ({ gameState: { ...s.gameState, selectedAircraft: id } })),
  takeControlOfAircraft: (id) => set((s) => {
    const c = new Set(s.gameState.controlledAircraft); c.add(id);
    return { gameState: { ...s.gameState, controlledAircraft: c }, aircraft: s.aircraft.map((a) => a.id === id ? { ...a, isPlayerControlled: true } : a) };
  }),
  isPolling: true,
  setPolling: (isPolling) => set({ isPolling }),
}));
