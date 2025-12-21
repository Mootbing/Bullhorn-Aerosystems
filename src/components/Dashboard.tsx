'use client';

import { useAirspaceStore } from '@/store/gameStore';

export function Dashboard() {
  const aircraft = useAirspaceStore((state) => state.aircraft);
  const gameState = useAirspaceStore((state) => state.gameState);
  const isPolling = useAirspaceStore((state) => state.isPolling);
  const startGame = useAirspaceStore((state) => state.startGame);
  const endGame = useAirspaceStore((state) => state.endGame);
  const selectedAircraft = aircraft.find((a) => a.id === gameState.selectedAircraft);

  return (
    <div className="absolute inset-0 pointer-events-none font-mono">
      <div className="absolute top-0 left-0 right-0 p-4 border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between">
          <div className="pointer-events-auto">
            <span className="text-[#666] text-[10px] tracking-[0.2em]">SYSTEM</span>
            <h1 className="text-sm font-medium text-white">AIRSPACE<span className="text-[#333]">//</span><span className="text-[#666]">v0.1.0</span></h1>
          </div>
          <div className="flex items-center gap-4 pointer-events-auto">
            <div className="flex items-center gap-2 px-3 py-1.5 border border-[#1a1a1a]">
              <div className={"w-1.5 h-1.5 " + (isPolling ? "bg-[#00ff88]" : "bg-[#ff4444]")} />
              <span className="text-[10px] tracking-[0.15em] text-[#666]">{isPolling ? "LINK_ACTIVE" : "LINK_PAUSED"}</span>
            </div>
            <div className="px-3 py-1.5 border border-[#1a1a1a]">
              <span className="text-[10px] text-[#666]">TRACKS: <span className="text-[#00d4ff]">{aircraft.length}</span></span>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-4 left-4 pointer-events-auto">
        <div className="bg-black/90 border border-[#1a1a1a] min-w-[260px]">
          <div className="border-b border-[#1a1a1a] px-3 py-2 text-[10px] text-[#666]">GAME_CONTROL</div>
          <div className="p-3">
            {!gameState.isPlaying ? (
              <button onClick={() => startGame(Date.now())} className="w-full px-3 py-2 border border-[#00ff88]/30 text-[#00ff88] text-[11px] hover:bg-[#00ff88]/10">[INIT_GAME_MODE]</button>
            ) : (
              <div className="space-y-2">
                <div className="text-[11px]"><span className="text-[#666]">SCORE: </span><span className="text-white">{gameState.score}</span></div>
                <button onClick={endGame} className="w-full px-3 py-2 border border-[#ff4444]/30 text-[#ff4444] text-[10px]">[TERMINATE]</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="absolute bottom-4 right-4 pointer-events-auto">
        <div className="bg-black/90 border border-[#1a1a1a] min-w-[260px]">
          <div className="border-b border-[#1a1a1a] px-3 py-2 text-[10px] text-[#666]">TRACK_INFO</div>
          <div className="p-3 text-[11px]">
            {selectedAircraft ? (
              <div className="space-y-2">
                <div className="text-white font-medium">{selectedAircraft.callsign}</div>
                <div className="text-[#888]">ALT: {Math.round(selectedAircraft.position.altitude)} ft</div>
              </div>
            ) : (<p className="text-[#444]">// SELECT_TRACK</p>)}
          </div>
        </div>
      </div>
    </div>
  );
}
