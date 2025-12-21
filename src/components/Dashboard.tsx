'use client';

import { useRadarStore, Aircraft } from '@/store/gameStore';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ScrollingText } from './ScrollingText';
import { SearchBar } from './SearchBar';

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

function DataRow({ label, value, accent, glowColor = 'blue' }: { label: string; value: string; accent?: boolean; glowColor?: 'blue' | 'yellow' | 'green' }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-[#555]">{label}</span>
      <ScrollingText 
        text={value} 
        className={accent ? 'text-[#00ff88]' : 'text-white'}
        glowColor={glowColor}
      />
    </div>
  );
}

interface RouteInfo {
  departure: { airport: string; time: string | null; city?: string };
  arrival: { airport: string; time: string | null; city?: string };
  airline?: string;
  status: 'found' | 'estimated' | 'unknown';
}

function FlightTicket({ callsign, icao24 }: { callsign: string; icao24: string }) {
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef<string | null>(null);
  
  useEffect(() => {
    // Only fetch once per callsign
    if (fetchedRef.current === callsign || !callsign) return;
    fetchedRef.current = callsign;
    
    setLoading(true);
    fetch('/api/flight-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callsign, icao24 }),
    })
      .then(res => res.json())
      .then(data => {
        setRoute(data);
        setLoading(false);
      })
      .catch(() => {
        setRoute(null);
        setLoading(false);
      });
  }, [callsign, icao24]);
  
  const currentTime = new Date().toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
  
  return (
    <div className="bg-gradient-to-r from-[#0a0a0a] to-[#111] border border-[#222] rounded-sm overflow-hidden">
      {/* Ticket header */}
      <div className="bg-[#1a1a1a] px-3 py-1 flex items-center justify-between border-b border-[#222]">
        <span className="text-[9px] text-[#666] tracking-wider">BOARDING PASS</span>
        <span className="text-[9px] text-[#444]">{route?.airline || callsign.substring(0, 3)}</span>
      </div>
      
      {/* Route display */}
      <div className="p-3">
        <div className="flex items-center justify-between">
          {/* Departure */}
          <div className="text-center">
            <div className="text-xl font-bold text-white tracking-wider">
              {loading ? '...' : (route?.departure?.airport || '---')}
            </div>
            {route?.departure?.city && (
              <div className="text-[8px] text-[#555] mt-0.5 max-w-[60px] truncate">
                {route.departure.city}
              </div>
            )}
          </div>
          
          {/* Arrow and flight info */}
          <div className="flex-1 px-3">
            <div className="flex items-center justify-center">
              <div className="h-[1px] flex-1 bg-gradient-to-r from-[#333] to-[#00ff88]/30" />
              <div className="px-2">
                <svg className="w-4 h-4 text-[#00ff88]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
                </svg>
              </div>
              <div className="h-[1px] flex-1 bg-gradient-to-r from-[#00ff88]/30 to-[#333]" />
            </div>
            <div className="text-center mt-1">
              <span className="text-[8px] text-[#444]">
                {route?.status === 'found' ? 'CONFIRMED' : route?.status === 'estimated' ? 'ESTIMATED' : 'EN ROUTE'}
              </span>
            </div>
          </div>
          
          {/* Arrival */}
          <div className="text-center">
            <div className="text-xl font-bold text-white tracking-wider">
              {loading ? '...' : (route?.arrival?.airport || '---')}
            </div>
            {route?.arrival?.city && (
              <div className="text-[8px] text-[#555] mt-0.5 max-w-[60px] truncate">
                {route.arrival.city}
              </div>
            )}
          </div>
        </div>
        
        {/* Time row */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-dashed border-[#222]">
          <div className="text-center">
            <div className="text-[8px] text-[#555]">DEP</div>
            <div className="text-[10px] text-[#888] font-mono">--:--</div>
          </div>
          <div className="text-center">
            <div className="text-[8px] text-[#00ff88]">NOW</div>
            <div className="text-[10px] text-[#00ff88] font-mono">{currentTime}</div>
          </div>
          <div className="text-center">
            <div className="text-[8px] text-[#555]">ARR</div>
            <div className="text-[10px] text-[#888] font-mono">--:--</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackInfoPanel({ aircraft, isHovering, isSelected, onClose }: { aircraft: Aircraft | undefined; isHovering: boolean; isSelected: boolean; onClose: () => void }) {
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

  const glowColor = 'yellow' as const;

  return (
    <div 
      className={'bg-black/90 border min-w-[280px] transition-all duration-300 ease-out overflow-hidden ' + 
        (isHovering ? 'border-[#ffaa00]/50' : 'border-[#1a1a1a]')}
    >
      <div 
        className={'border-b px-3 py-2 text-[10px] transition-colors duration-300 flex justify-between items-center ' + 
          (isHovering ? 'border-[#ffaa00]/50 text-[#ffaa00]' : 'border-[#1a1a1a] text-[#666]')}
      >
        <span>TRACK_INFO {isHovering && <span className="text-[#888]">(HOVER)</span>}</span>
        {isSelected && (
          <button 
            onClick={onClose}
            className="text-[#ff4444] hover:text-[#ff6666] hover:bg-[#ff4444]/10 px-1.5 transition-colors"
          >
            [UNFOLLOW]
          </button>
        )}
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
                    <ScrollingText text={aircraft.callsign} glowColor={glowColor} />
                  </div>
                  <div className="text-[#666] text-[9px]">
                    <ScrollingText text={aircraft.originCountry || 'Unknown Origin'} glowColor={glowColor} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[#00ff88] font-mono">
                    <ScrollingText text={aircraft.id.toUpperCase()} glowColor="green" />
                  </div>
                  <div className="text-[#444] text-[9px]">ICAO24</div>
                </div>
              </div>
              
              {/* Flight Ticket - Route Display */}
              <FlightTicket callsign={aircraft.callsign} icao24={aircraft.id} />
              
              {/* Status Row */}
              <div className="flex items-center gap-2">
                <div className={'w-1.5 h-1.5 rounded-full ' + (aircraft.onGround ? 'bg-[#666]' : 'bg-[#00ff88]')} />
                <ScrollingText 
                  text={aircraft.onGround ? 'ON_GROUND' : 'AIRBORNE'} 
                  className="text-[#888]"
                  glowColor={glowColor}
                />
                {aircraft.squawk && (
                  <>
                    <span className="text-[#333]">|</span>
                    <span className="text-[#888]">SQK: <ScrollingText text={aircraft.squawk} className="text-[#ffaa00]" glowColor={glowColor} /></span>
                  </>
                )}
                {aircraft.spi && <span className="text-[#ff4444] animate-pulse">SPI</span>}
              </div>
              
              {/* Position Section */}
              <div className="border-t border-[#1a1a1a] pt-2">
                <div className="text-[#444] text-[9px] tracking-wider mb-1">POSITION</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  <DataRow label="LAT" value={formatCoord(aircraft.position.latitude, true)} glowColor={glowColor} />
                  <DataRow label="LON" value={formatCoord(aircraft.position.longitude, false)} glowColor={glowColor} />
                </div>
              </div>
              
              {/* Altitude Section */}
              <div className="border-t border-[#1a1a1a] pt-2">
                <div className="text-[#444] text-[9px] tracking-wider mb-1">ALTITUDE </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  <DataRow label="BARO" value={formatAltitude(aircraft.position.altitude)} glowColor={glowColor} />
                  <DataRow label="GPS" value={formatAltitude(aircraft.position.geoAltitude)} glowColor={glowColor} />
                  <DataRow 
                    label="V/S" 
                    value={formatVerticalRate(aircraft.position.verticalRate)}
                    glowColor={glowColor}
                  />
                </div>
              </div>
              
              {/* Speed & Heading Section */}
              <div className="border-t border-[#1a1a1a] pt-2">
                <div className="text-[#444] text-[9px] tracking-wider mb-1">VELOCITY</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  <DataRow label="GND SPD" value={formatSpeed(aircraft.position.speed)} glowColor={glowColor} />
                  <DataRow label="TRACK" value={formatHeading(aircraft.position.heading)} glowColor={glowColor} />
                </div>
              </div>
              
              {/* Data Source */}
              <div className="border-t border-[#1a1a1a] pt-2 flex justify-between text-[9px]">
                <span className="text-[#444]">SRC: <ScrollingText text={getPositionSource(aircraft.positionSource)} className="text-[#666]" glowColor={glowColor} /></span>
                <span className="text-[#444]">LAST: <ScrollingText text={formatLastContact(aircraft.lastContact)} className="text-[#666]" glowColor={glowColor} /></span>
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
  const aircraft = useRadarStore((state) => state.aircraft);
  const gameState = useRadarStore((state) => state.gameState);
  const isPolling = useRadarStore((state) => state.isPolling);
  const selectAircraft = useRadarStore((state) => state.selectAircraft);

  // Show hovered aircraft, fall back to selected
  const displayAircraftId = gameState.hoveredAircraft || gameState.selectedAircraft;
  const displayAircraft = aircraft.find((a) => a.id === displayAircraftId);
  const isHovering = gameState.hoveredAircraft !== null;

  const handleClosePanel = useCallback(() => {
    selectAircraft(null);
  }, [selectAircraft]);

  // ESC key to unfollow
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClosePanel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClosePanel]);

  return (
    <div className="absolute inset-0 pointer-events-none font-mono">
      <div className="absolute top-0 left-0 right-0 p-4 border-b border-[#1a1a1a] bg-black/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="pointer-events-auto">
            <span className="text-[#666] text-[10px] tracking-[0.2em]">SYSTEM</span>
            <h1 className="text-sm font-medium text-white">
              COWLANTIR<span className="text-[#333]">//</span><span className="text-[#00ff88]">RADAR</span><span className="text-[#333]">//</span><span className="text-[#666]">v0.1.0</span>
            </h1>
          </div>
          <div className="pointer-events-auto">
            <div className="flex items-center gap-3 px-3 py-1.5 border border-[#1a1a1a] bg-black/50 backdrop-blur-sm">
              <div className={'w-1.5 h-1.5 ' + (isPolling ? 'bg-[#00ff88]' : 'bg-[#ff4444]')} />
              <span className="text-[10px] tracking-[0.15em] text-[#666]">
                {isPolling ? 'UPLINK_ACTIVE' : 'UPLINK_PAUSED'}
              </span>
              <span className="text-[10px] text-[#00ff88]">{aircraft.length}</span>
              <span className="text-[10px] tracking-[0.15em] text-[#00ff88]">ONLINE</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-4 left-4 pointer-events-auto">
        <SearchBar />
      </div>
      
      <div className="absolute bottom-4 right-4 pointer-events-auto">
        <TrackInfoPanel aircraft={displayAircraft} isHovering={isHovering} isSelected={gameState.selectedAircraft !== null} onClose={handleClosePanel} />
      </div>
    </div>
  );
}
