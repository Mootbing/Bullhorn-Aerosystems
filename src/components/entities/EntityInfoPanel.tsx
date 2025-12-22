'use client';

import { useRef, useState, useEffect } from 'react';
import { useRadarStore, Aircraft, Airport } from '@/store/gameStore';
import { EntityRef, getEntityTypeName } from '@/types/entities';
import { ScrollingText } from '../ScrollingText';

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

export function DataRow({ 
  label, 
  value, 
  glowColor = 'green' 
}: { 
  label: string; 
  value: string; 
  glowColor?: 'blue' | 'yellow' | 'green';
}) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-[#555]">{label}</span>
      <ScrollingText 
        text={value} 
        className="text-white"
        glowColor={glowColor}
      />
    </div>
  );
}

// ============================================================================
// AIRCRAFT INFO CONTENT
// ============================================================================

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

function AircraftInfoContent({ 
  aircraft, 
  glowColor 
}: { 
  aircraft: Aircraft; 
  glowColor: 'green' | 'yellow';
}) {
  return (
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
        <div className="text-[#444] text-[9px] tracking-wider mb-1">ALTITUDE</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          <DataRow label="BARO" value={formatAltitude(aircraft.position.altitude)} glowColor={glowColor} />
          <DataRow label="GPS" value={formatAltitude(aircraft.position.geoAltitude)} glowColor={glowColor} />
          <DataRow label="V/S" value={formatVerticalRate(aircraft.position.verticalRate)} glowColor={glowColor} />
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
  );
}

// ============================================================================
// AIRPORT INFO CONTENT
// ============================================================================

function AirportInfoContent({ 
  airport, 
  glowColor 
}: { 
  airport: Airport; 
  glowColor: 'green' | 'yellow';
}) {
  return (
    <div className="space-y-2">
      {/* Header - ICAO & IATA */}
      <div className="flex items-baseline justify-between border-b border-[#1a1a1a] pb-2">
        <div>
          <div className="text-white font-medium text-sm">
            <ScrollingText text={airport.iata || airport.icao} glowColor={glowColor} />
          </div>
          <div className="text-[#666] text-[9px]">
            <ScrollingText text={airport.name} glowColor={glowColor} />
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
        <DataRow label="CITY" value={airport.city || 'N/A'} glowColor={glowColor} />
        <DataRow label="COUNTRY" value={airport.country || 'N/A'} glowColor={glowColor} />
        <DataRow label="ELEV" value={airport.elevation ? `${Math.round(airport.elevation)} ft` : 'N/A'} glowColor={glowColor} />
        <DataRow label="TYPE" value={airport.type.replace('_', ' ').toUpperCase()} glowColor={glowColor} />
      </div>
    </div>
  );
}

// ============================================================================
// ANIMATION STATES
// ============================================================================

type AnimationState = 'hidden' | 'entering' | 'visible' | 'exiting';

const ANIMATION_DURATION = 300; // ms

// ============================================================================
// ENTITY INFO PANEL (Universal Wrapper with Animations)
// ============================================================================

interface EntityInfoPanelProps {
  onClose?: () => void;
}

export function EntityInfoPanel({ onClose }: EntityInfoPanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [animState, setAnimState] = useState<AnimationState>('hidden');
  const animTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Store the displayed entity (persists during exit animation)
  const [displayedRef, setDisplayedRef] = useState<EntityRef | null>(null);
  const [displayedEntity, setDisplayedEntity] = useState<Aircraft | Airport | null>(null);
  
  // Get interaction state from store
  const hoveredEntity = useRadarStore((s) => s.gameState.hoveredEntity);
  const selectedEntity = useRadarStore((s) => s.gameState.selectedEntity);
  const selectEntity = useRadarStore((s) => s.selectEntity);
  const getEntityByRef = useRadarStore((s) => s.getEntityByRef);
  
  // The "target" entity we want to display (or null to hide)
  const targetRef = hoveredEntity || selectedEntity;
  const targetEntity = getEntityByRef(targetRef);
  
  // Handle animation state transitions
  useEffect(() => {
    // Clear any pending timeout
    if (animTimeoutRef.current) {
      clearTimeout(animTimeoutRef.current);
      animTimeoutRef.current = null;
    }
    
    const hasTarget = targetRef !== null && targetEntity !== undefined;
    const hasDisplayed = displayedRef !== null;
    const isSameEntity = hasTarget && hasDisplayed && 
      targetRef?.type === displayedRef?.type && targetRef?.id === displayedRef?.id;
    
    if (hasTarget) {
      if (!hasDisplayed || !isSameEntity) {
        // New entity to display - interrupt any exit and start entering
        setDisplayedRef(targetRef);
        setDisplayedEntity(targetEntity as Aircraft | Airport);
        setAnimState('entering');
        
        animTimeoutRef.current = setTimeout(() => {
          setAnimState('visible');
        }, ANIMATION_DURATION);
      }
      // If same entity, keep current state (visible or entering)
    } else {
      // No target - start exit animation if we have content
      if (hasDisplayed && animState !== 'exiting' && animState !== 'hidden') {
        setAnimState('exiting');
        
        animTimeoutRef.current = setTimeout(() => {
          setAnimState('hidden');
          setDisplayedRef(null);
          setDisplayedEntity(null);
        }, ANIMATION_DURATION);
      }
    }
    
    return () => {
      if (animTimeoutRef.current) {
        clearTimeout(animTimeoutRef.current);
      }
    };
  }, [targetRef?.type, targetRef?.id, targetEntity, displayedRef, animState]);
  
  // Measure content for height animation
  useEffect(() => {
    if (contentRef.current && displayedEntity) {
      setHeight(contentRef.current.scrollHeight);
    }
  }, [displayedEntity, displayedRef?.type, displayedRef?.id]);
  
  const isHovering = hoveredEntity !== null;
  const isSelected = selectedEntity !== null;
  const isHoveringDifferent = isSelected && isHovering && 
    (hoveredEntity?.type !== selectedEntity?.type || hoveredEntity?.id !== selectedEntity?.id);
  
  // Glow color: yellow when hovering different entity while tracking
  const glowColor = isHoveringDifferent ? 'yellow' as const : 'green' as const;
  
  // Handle switching/closing
  const handleAction = () => {
    if (isHoveringDifferent && hoveredEntity) {
      selectEntity(hoveredEntity);
    } else if (isSelected) {
      selectEntity(null);
    }
  };
  
  // Get entity type label
  const typeLabel = displayedRef ? getEntityTypeName(displayedRef.type).toUpperCase() : 'ENTITY';
  
  // Determine visual state
  const isVisible = animState === 'entering' || animState === 'visible';
  const isExiting = animState === 'exiting';
  const showContent = displayedRef !== null && displayedEntity !== null;
  
  return (
    <div 
      className={'bg-black/90 min-w-[280px] transition-all duration-300 ease-out border-[#1a1a1a] ' + 
        (showContent ? 'border ' : 'border-0 ') +
        (isHovering && !isSelected ? 'border-dashed' : 'border-solid')}
      style={{ 
        maxHeight: showContent ? '600px' : '0px',
        opacity: isVisible ? 1 : isExiting ? 0 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
        overflow: 'hidden',
        pointerEvents: isExiting ? 'none' : 'auto',
      }}
    >
      {showContent && (
        <>
          {/* Header */}
          <div 
            className={'border-b border-[#1a1a1a] px-3 py-2 text-[10px] text-[#666] transition-colors duration-300 flex justify-between items-center ' + 
              (isHovering && !isSelected ? 'border-dashed' : 'border-solid')}
          >
            <span>{typeLabel}_INFO</span>
            <div className="flex items-center gap-2">
              {/* Hovering (not tracking anything) - yellow ENTER to track */}
              {isHovering && !isSelected && (
                <span className="text-[#ffaa00]">[ENTER]</span>
              )}
              {/* Tracking and hovering different - yellow ENTER to switch */}
              {isSelected && isHoveringDifferent && (
                <button 
                  onClick={handleAction}
                  className="text-[#ffaa00] hover:text-[#ffcc00] hover:bg-[#ffaa00]/10 px-1.5 transition-colors"
                >
                  [ENTER]
                </button>
              )}
              {/* Tracking (not hovering another) - red ESC to cancel */}
              {isSelected && !isHoveringDifferent && (
                <button 
                  onClick={handleAction}
                  className="text-[#ff4444] hover:text-[#ff6666] hover:bg-[#ff4444]/10 px-1.5 transition-colors"
                >
                  [ESC]
                </button>
              )}
            </div>
          </div>
          
          {/* Content with height animation */}
          <div 
            className="transition-[height] duration-300 ease-out"
            style={{ height: height || 'auto' }}
          >
            <div ref={contentRef} className="p-3 text-[10px]">
              {/* Render entity-specific content */}
              {displayedRef?.type === 'aircraft' && displayedEntity && (
                <AircraftInfoContent aircraft={displayedEntity as Aircraft} glowColor={glowColor} />
              )}
              {displayedRef?.type === 'airport' && displayedEntity && (
                <AirportInfoContent airport={displayedEntity as Airport} glowColor={glowColor} />
              )}
              {/* Placeholder for other entity types */}
              {displayedRef && !['aircraft', 'airport'].includes(displayedRef.type) && (
                <div className="text-[#666]">
                  <ScrollingText text={`${typeLabel} info not yet implemented`} glowColor={glowColor} />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
