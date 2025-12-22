'use client';

import { useRadarStore, Aircraft, Airport } from '@/store/gameStore';
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

function TrackInfoPanel({ 
  aircraft, 
  isHovering, 
  isSelected, 
  isHoveringDifferentPlane,
  onSwitch 
}: { 
  aircraft: Aircraft | undefined; 
  isHovering: boolean; 
  isSelected: boolean; 
  isHoveringDifferentPlane: boolean;
  onSwitch: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const prevAircraftRef = useRef<Aircraft | undefined>(undefined);
  
  useEffect(() => {
    if (contentRef.current && aircraft) {
      setHeight(contentRef.current.scrollHeight);
    }
  }, [aircraft, isHovering]);

  // Track previous aircraft for comparison
  useEffect(() => {
    prevAircraftRef.current = aircraft;
  }, [aircraft]);

  // Use yellow glow when hovering a different plane while one is tracked
  const glowColor = isHoveringDifferentPlane ? 'yellow' as const : 'green' as const;
  const hasContent = aircraft !== undefined;

  return (
    <div 
      className={'bg-black/90 min-w-[280px] transition-all duration-300 ease-out border-[#1a1a1a] ' + 
        (hasContent ? 'border ' : 'border-0 ') +
        (isHovering ? 'border-dashed' : 'border-solid')}
      style={{ 
        maxHeight: hasContent ? '600px' : '0px',
        opacity: hasContent ? 1 : 0,
        overflow: 'hidden',
      }}
    >
      {hasContent && (
        <>
          <div 
            className={'border-b border-[#1a1a1a] px-3 py-2 text-[10px] text-[#666] transition-colors duration-300 flex justify-between items-center ' + 
              (isHovering ? 'border-dashed' : 'border-solid')}
          >
            <span>TRACK_INFO</span>
            <div className="flex items-center gap-2">
              {/* Hovering a plane (not tracking anything) - yellow ENTER to track */}
              {isHovering && !isSelected && (
                <span className="text-[#ffaa00]">[ENTER]</span>
              )}
              {/* Tracking a plane and hovering a different one - yellow ENTER to switch */}
              {isSelected && isHoveringDifferentPlane && (
                <button 
                  onClick={onSwitch}
                  className="text-[#ffaa00] hover:text-[#ffcc00] hover:bg-[#ffaa00]/10 px-1.5 transition-colors"
                >
                  [ENTER]
                </button>
              )}
              {/* Tracking a plane (not hovering another) - show ESC to cancel */}
              {isSelected && !isHoveringDifferentPlane && (
                <button 
                  onClick={onSwitch}
                  className="text-[#ff4444] hover:text-[#ff6666] hover:bg-[#ff4444]/10 px-1.5 transition-colors"
                >
                  [ESC]
                </button>
              )}
            </div>
          </div>
          <div 
            className="transition-[height] duration-300 ease-out"
            style={{ height: height || 'auto' }}
          >
            <div ref={contentRef} className="p-3 text-[10px]">
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
          </div>
        </div>
        </>
      )}
    </div>
  );
}

function AirportInfoPanel({ airport }: { airport: Airport | undefined }) {
  const hasContent = airport !== undefined;
  
  return (
    <div 
      className={'bg-black/90 min-w-[280px] transition-all duration-300 ease-out border border-dashed border-[#1a1a1a]'}
      style={{ 
        maxHeight: hasContent ? '300px' : '0px',
        opacity: hasContent ? 1 : 0,
        overflow: 'hidden',
      }}
    >
      {hasContent && (
        <>
          <div className="border-b border-dashed border-[#1a1a1a] px-3 py-2 text-[10px] text-[#666] flex justify-between items-center">
            <span>AIRPORT_INFO</span>
          </div>
          <div className="p-3 text-[10px]">
            <div className="space-y-2">
              {/* Header - ICAO & IATA */}
              <div className="flex items-baseline justify-between border-b border-[#1a1a1a] pb-2">
                <div>
                  <div className="text-white font-medium text-sm">
                    <ScrollingText text={airport.iata || airport.icao} glowColor="green" />
                  </div>
                  <div className="text-[#666] text-[9px]">
                    <ScrollingText text={airport.name} glowColor="green" />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[#00ff88] font-mono">
                    <ScrollingText text={airport.icao} glowColor="green" />
                  </div>
                  <div className="text-[#444] text-[9px]">ICAO</div>
                </div>
              </div>
              
              {/* Location */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <DataRow label="CITY" value={airport.city || 'N/A'} glowColor="green" />
                <DataRow label="COUNTRY" value={airport.country || 'N/A'} glowColor="green" />
                <DataRow label="ELEV" value={airport.elevation ? `${Math.round(airport.elevation)} ft` : 'N/A'} glowColor="green" />
                <DataRow label="TYPE" value={airport.type.replace('_', ' ').toUpperCase()} glowColor="green" />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Dashboard() {
  const aircraft = useRadarStore((state) => state.aircraft);
  const airports = useRadarStore((state) => state.airports);
  const gameState = useRadarStore((state) => state.gameState);
  const isPolling = useRadarStore((state) => state.isPolling);
  const selectAircraft = useRadarStore((state) => state.selectAircraft);

  // Show hovered aircraft, fall back to selected
  const displayAircraftId = gameState.hoveredAircraft || gameState.selectedAircraft;
  const displayAircraft = aircraft.find((a) => a.id === displayAircraftId);
  const isHoveringAircraft = gameState.hoveredAircraft !== null;
  
  // Show hovered airport
  const displayAirport = gameState.hoveredAirport 
    ? airports.find((a) => a.icao === gameState.hoveredAirport) 
    : undefined;
  const isHoveringAirport = gameState.hoveredAirport !== null;
  
  // Detect when hovering a different plane while one is tracked
  const isHoveringDifferentPlane = gameState.selectedAircraft !== null && 
    gameState.hoveredAircraft !== null && 
    gameState.hoveredAircraft !== gameState.selectedAircraft;

  const handleClosePanel = useCallback(() => {
    selectAircraft(null);
  }, [selectAircraft]);
  
  // Handle switching to hovered plane or closing
  const handleSwitchOrClose = useCallback(() => {
    if (isHoveringDifferentPlane && gameState.hoveredAircraft) {
      // Switch to the hovered plane
      selectAircraft(gameState.hoveredAircraft);
    } else {
      // Just close/untrack
      selectAircraft(null);
    }
  }, [isHoveringDifferentPlane, gameState.hoveredAircraft, selectAircraft]);

  // Keyboard shortcuts: ESC to unfollow, ENTER to track/switch hovered plane
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.key === 'Escape') {
        handleClosePanel();
      } else if (e.key === 'Enter' && gameState.hoveredAircraft) {
        // Track or switch to the hovered plane when Enter is pressed
        selectAircraft(gameState.hoveredAircraft);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClosePanel, gameState.hoveredAircraft, selectAircraft]);

  return (
    <div className="absolute inset-0 pointer-events-none font-mono">
      <div className="absolute top-0 left-0 right-0 p-4 border-b border-[#1a1a1a] bg-black/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="pointer-events-auto">
            <h1 className="text-sm font-medium text-white">
              COWLANTIR RADAR SYSTEMS<span className="text-[#333]">//</span><span className="text-[#666]">v0.0.1</span>
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
        {/* Show airport info when hovering airport, otherwise show aircraft info */}
        {isHoveringAirport ? (
          <AirportInfoPanel airport={displayAirport} />
        ) : (
          <TrackInfoPanel 
            aircraft={displayAircraft} 
            isHovering={isHoveringAircraft} 
            isSelected={gameState.selectedAircraft !== null} 
            isHoveringDifferentPlane={isHoveringDifferentPlane}
            onSwitch={handleSwitchOrClose} 
          />
        )}
      </div>
      
      <div className="absolute bottom-4 right-4 pointer-events-auto">
        <SearchBar />
      </div>
    </div>
  );
}
