'use client';

import { useAirspaceStore, Aircraft } from '@/store/gameStore';
import { useState, useEffect, useRef } from 'react';
import { ScrollingText } from './ScrollingText';

function formatAltitude(ft: number | undefined): string {
  if (ft === undefined || ft === null) return 'N/A';
  return Math.round(ft).toLocaleString() + ' ft';
}

function formatSpeed(kts: number | undefined): string {
  if (kts === undefined || kts === null) return 'N/A';
  return Math.round(kts) + ' kts';
}

function formatVerticalRate(ftMin: number | undefined): string {
  if (ftMin === undefined || ftMin === null) return 'N/A';
  const val = Math.round(ftMin);
  if (val > 0) return '+' + val + ' ft/min';
  return val + ' ft/min';
}

function formatHeading(deg: number | undefined): string {
  if (deg === undefined || deg === null) return 'N/A';
  return Math.round(deg) + '°';
}

function formatCoord(val: number | undefined, isLat: boolean): string {
  if (val === undefined || val === null) return 'N/A';
  const abs = Math.abs(val).toFixed(5);
  if (isLat) return abs + (val >= 0 ? '° N' : '° S');
  return abs + (val >= 0 ? '° E' : '° W');
}

function formatLastContact(unix: number | undefined): string {
  if (!unix) return 'N/A';
  const diff = Math.floor(Date.now() / 1000 - unix);
  if (diff < 60) return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  return Math.floor(diff / 3600) + 'h ago';
}

function getPositionSource(src: number | undefined): string {
  if (src === 0) return 'ADS-B';
  if (src === 1) return 'ASTERIX';
  if (src === 2) return 'MLAT';
  return 'UNKNOWN';
}

function DataRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-[#555]">{label}</span>
      <ScrollingText 
        text={value} 
        className={accent ? 'text-[#00ff88]' : 'text-white'} 
      />
    </div>
  );
}

function TrackInfoPanel({ aircraft, isHovering }: { aircraft: Aircraft | undefined; isHovering: boolean }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const prevAircraftRef = useRef<Aircraft | undefined>(undefined);
  
  useEffect(() => {
    if (contentRef.current) {
      setHeight(contentRef.current.scrollHeight);
    }
  }, [aircraft, isHovering]);

  // Track previous aircraft for comparison
  useEffect(() => {
    prevAircraftRef.current = aircraft;
  }, [aircraft]);

  return (
    <div 
      className={'bg-black/90 border min-w-[280px] transition-all duration-300 ease-out overflow-hidden ' + 
        (isHovering ? 'border-[#ffaa00]/50' : 'border-[#1a1a1a]')}
    >
      <div 
        className={'border-b px-3 py-2 text-[10px] transition-colors duration-300 ' + 
          (isHovering ? 'border-[#ffaa00]/50 text-[#ffaa00]' : 'border-[#1a1a1a] text-[#666]')}
      >
        TRACK_INFO {isHovering && <span className="text-[#888]">(HOVER)</span>}
      </div>
      <div 
        className="transition-[height] duration-300 ease-out"
        style={{ height: aircraft ? height : 28 }}
      >
        <div ref={contentRef} className="p-3 text-[10px]">
          {aircraft ? (
            <div className="space-y-3">
              {/* Header - Callsign & ICAO */}
              <div className="flex items-baseline justify-between border-b border-[#1a1a1a] pb-2">
                <div>
                  <div className="text-white font-medium text-sm">
                    <ScrollingText text={aircraft.callsign} />
                  </div>
                  <div className="text-[#666] text-[9px]">
                    <ScrollingText text={aircraft.originCountry || 'Unknown Origin'} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[#00ff88] font-mono">
                    <ScrollingText text={aircraft.id.toUpperCase()} />
                  </div>
                  <div className="text-[#444] text-[9px]">ICAO24</div>
                </div>
              </div>
              
              {/* Status Row */}
              <div className="flex items-center gap-2">
                <div className={'w-1.5 h-1.5 rounded-full ' + (aircraft.onGround ? 'bg-[#666]' : 'bg-[#00ff88]')} />
                <ScrollingText 
                  text={aircraft.onGround ? 'ON_GROUND' : 'AIRBORNE'} 
                  className="text-[#888]" 
                />
                {aircraft.squawk && (
                  <>
                    <span className="text-[#333]">|</span>
                    <span className="text-[#888]">SQK: <ScrollingText text={aircraft.squawk} className="text-[#ffaa00]" /></span>
                  </>
                )}
                {aircraft.spi && <span className="text-[#ff4444] animate-pulse">SPI</span>}
              </div>
              
              {/* Position Section */}
              <div className="border-t border-[#1a1a1a] pt-2">
                <div className="text-[#444] text-[9px] tracking-wider mb-1">POSITION</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  <DataRow label="LAT" value={formatCoord(aircraft.position.latitude, true)} />
                  <DataRow label="LON" value={formatCoord(aircraft.position.longitude, false)} />
                </div>
              </div>
              
              {/* Altitude Section */}
              <div className="border-t border-[#1a1a1a] pt-2">
                <div className="text-[#444] text-[9px] tracking-wider mb-1">ALTITUDE </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  <DataRow label="BARO" value={formatAltitude(aircraft.position.altitude)} />
                  <DataRow label="GPS" value={formatAltitude(aircraft.position.geoAltitude)} />
                  <DataRow 
                    label="V/S" 
                    value={formatVerticalRate(aircraft.position.verticalRate)} 
                  />
                </div>
              </div>
              
              {/* Speed & Heading Section */}
              <div className="border-t border-[#1a1a1a] pt-2">
                <div className="text-[#444] text-[9px] tracking-wider mb-1">VELOCITY</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  <DataRow label="GND SPD" value={formatSpeed(aircraft.position.speed)} />
                  <DataRow label="TRACK" value={formatHeading(aircraft.position.heading)} />
                </div>
              </div>
              
              {/* Data Source */}
              <div className="border-t border-[#1a1a1a] pt-2 flex justify-between text-[9px]">
                <span className="text-[#444]">SRC: <ScrollingText text={getPositionSource(aircraft.positionSource)} className="text-[#666]" /></span>
                <span className="text-[#444]">LAST: <ScrollingText text={formatLastContact(aircraft.lastContact)} className="text-[#666]" /></span>
              </div>
            </div>
          ) : (
            <p className="text-[#444]">// HOVER_OR_SELECT_TRACK</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const aircraft = useAirspaceStore((state) => state.aircraft);
  const gameState = useAirspaceStore((state) => state.gameState);
  const isPolling = useAirspaceStore((state) => state.isPolling);
  const startGame = useAirspaceStore((state) => state.startGame);
  const endGame = useAirspaceStore((state) => state.endGame);

  // Show hovered aircraft, fall back to selected
  const displayAircraftId = gameState.hoveredAircraft || gameState.selectedAircraft;
  const displayAircraft = aircraft.find((a) => a.id === displayAircraftId);
  const isHovering = gameState.hoveredAircraft !== null;

  return (
    <div className="absolute inset-0 pointer-events-none font-mono">
      <div className="absolute top-0 left-0 right-0 p-4 border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between">
          <div className="pointer-events-auto">
            <span className="text-[#666] text-[10px] tracking-[0.2em]">SYSTEM</span>
            <h1 className="text-sm font-medium text-white">
              AIRSPACE<span className="text-[#333]">//</span><span className="text-[#666]">v0.1.0</span>
            </h1>
          </div>
          <div className="flex items-center gap-4 pointer-events-auto">
            <div className="flex items-center gap-2 px-3 py-1.5 border border-[#1a1a1a]">
              <div className={'w-1.5 h-1.5 ' + (isPolling ? 'bg-[#00ff88]' : 'bg-[#ff4444]')} />
              <span className="text-[10px] tracking-[0.15em] text-[#666]">
                {isPolling ? 'LINK_ACTIVE' : 'LINK_PAUSED'}
              </span>
            </div>
            <div className="px-3 py-1.5 border border-[#1a1a1a]">
              <span className="text-[10px] text-[#666]">
                TRACKS: <ScrollingText text={String(aircraft.length)} className="text-[#00ff88]" />
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-4 left-4 pointer-events-auto">
        <div className="bg-black/90 border border-[#1a1a1a] min-w-[260px]">
          <div className="border-b border-[#1a1a1a] px-3 py-2 text-[10px] text-[#666]">GAME_CONTROL</div>
          <div className="p-3">
            {!gameState.isPlaying ? (
              <button
                onClick={() => startGame(Date.now())}
                className="w-full px-3 py-2 border border-[#00ff88]/30 text-[#00ff88] text-[11px] hover:bg-[#00ff88]/10"
              >
                [INIT_GAME_MODE]
              </button>
            ) : (
              <div className="space-y-2">
                <div className="text-[11px]">
                  <span className="text-[#666]">SCORE: </span>
                  <ScrollingText text={String(gameState.score)} className="text-white" />
                </div>
                <button
                  onClick={endGame}
                  className="w-full px-3 py-2 border border-[#ff4444]/30 text-[#ff4444] text-[10px]"
                >
                  [TERMINATE]
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-4 right-4 pointer-events-auto">
        <TrackInfoPanel aircraft={displayAircraft} isHovering={isHovering} />
      </div>
    </div>
  );
}
