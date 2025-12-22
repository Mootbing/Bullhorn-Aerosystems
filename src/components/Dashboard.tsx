'use client';

import { useRadarStore, Aircraft, Airport } from '@/store/gameStore';
import { useEffect, useCallback } from 'react';
import { EntityInfoPanel } from './entities/EntityInfoPanel';
import { SearchBar } from './SearchBar';
import { ModeBar } from './ModeBar';
import { EntityRef } from '@/types/entities';

// Get angular distance between two lat/lon points (in degrees, approximate)
function angularDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

// Get direction angle from point 1 to point 2 (in degrees, 0 = up/north, 90 = right/east)
function getDirection(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  // atan2 returns angle from positive X axis, we want from positive Y (north)
  const angle = Math.atan2(dLon, dLat) * (180 / Math.PI);
  return (angle + 360) % 360;
}

// Check if direction matches arrow key (with tolerance)
function matchesDirection(direction: number, arrowKey: string, tolerance: number = 60): boolean {
  const targetAngles: Record<string, number> = {
    'ArrowUp': 0,
    'ArrowRight': 90,
    'ArrowDown': 180,
    'ArrowLeft': 270,
  };
  const target = targetAngles[arrowKey];
  if (target === undefined) return false;
  
  let diff = Math.abs(direction - target);
  if (diff > 180) diff = 360 - diff;
  return diff <= tolerance;
}

// Get lat/lon from any entity type
function getEntityLatLon(entity: Aircraft | Airport): { lat: number; lon: number; alt?: number } {
  if ('position' in entity && entity.position) {
    return { lat: entity.position.latitude, lon: entity.position.longitude, alt: entity.position.altitude };
  }
  // Airport uses lat/lon directly
  return { lat: (entity as Airport).lat, lon: (entity as Airport).lon };
}

export function Dashboard() {
  const gameState = useRadarStore((state) => state.gameState);
  const selectEntity = useRadarStore((state) => state.selectEntity);
  const hoverEntity = useRadarStore((state) => state.hoverEntity);
  const aircraft = useRadarStore((state) => state.aircraft);
  const airports = useRadarStore((state) => state.airports);
  const getEntityByRef = useRadarStore((state) => state.getEntityByRef);
  const viewportBounds = useRadarStore((state) => state.viewportBounds);
  const setFocusLocation = useRadarStore((state) => state.setFocusLocation);

  const handleClosePanel = useCallback(() => {
    selectEntity(null);
  }, [selectEntity]);

  // Find nearest entity in arrow key direction
  const findNearestInDirection = useCallback((arrowKey: string): EntityRef | null => {
    // Get current focus point
    let focusLat: number;
    let focusLon: number;
    
    const selectedEntity = gameState.selectedEntity;
    const hoveredEntity = gameState.hoveredEntity;
    const currentRef = selectedEntity || hoveredEntity;
    
    if (currentRef) {
      const entity = getEntityByRef(currentRef);
      if (entity) {
        const pos = getEntityLatLon(entity);
        focusLat = pos.lat;
        focusLon = pos.lon;
      } else {
        // Fallback to viewport center
        focusLat = viewportBounds?.centerLat ?? 0;
        focusLon = viewportBounds?.centerLon ?? 0;
      }
    } else {
      // No selection - use viewport center
      focusLat = viewportBounds?.centerLat ?? 0;
      focusLon = viewportBounds?.centerLon ?? 0;
    }
    
    // Collect all entities with their positions
    const candidates: { ref: EntityRef; lat: number; lon: number; distance: number }[] = [];
    
    // Filter by active mode
    const activeMode = gameState.activeMode;
    
    if (activeMode === 'all' || activeMode === 'aircraft') {
      aircraft.forEach(ac => {
        // Skip currently selected/hovered
        if (currentRef?.type === 'aircraft' && currentRef.id === ac.id) return;
        
        const dist = angularDistance(focusLat, focusLon, ac.position.latitude, ac.position.longitude);
        if (dist < 0.01) return; // Skip if too close (same position)
        
        const dir = getDirection(focusLat, focusLon, ac.position.latitude, ac.position.longitude);
        if (matchesDirection(dir, arrowKey)) {
          candidates.push({
            ref: { type: 'aircraft', id: ac.id },
            lat: ac.position.latitude,
            lon: ac.position.longitude,
            distance: dist,
          });
        }
      });
    }
    
    if (activeMode === 'all' || activeMode === 'airport') {
      airports.forEach(ap => {
        // Skip currently selected/hovered
        if (currentRef?.type === 'airport' && currentRef.id === ap.icao) return;
        
        const dist = angularDistance(focusLat, focusLon, ap.lat, ap.lon);
        if (dist < 0.01) return;
        
        const dir = getDirection(focusLat, focusLon, ap.lat, ap.lon);
        if (matchesDirection(dir, arrowKey)) {
          candidates.push({
            ref: { type: 'airport', id: ap.icao },
            lat: ap.lat,
            lon: ap.lon,
            distance: dist,
          });
        }
      });
    }
    
    if (candidates.length === 0) return null;
    
    // Sort by distance and return closest
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0].ref;
  }, [aircraft, airports, gameState.selectedEntity, gameState.hoveredEntity, gameState.activeMode, getEntityByRef, viewportBounds]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.key === 'Escape') {
        handleClosePanel();
      } else if (e.key === 'Enter' && gameState.hoveredEntity) {
        selectEntity(gameState.hoveredEntity);
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const nearest = findNearestInDirection(e.key);
        if (nearest) {
          // Hover and focus camera
          hoverEntity(nearest);
          const entity = getEntityByRef(nearest);
          if (entity) {
            const pos = getEntityLatLon(entity);
            setFocusLocation({
              lat: pos.lat,
              lon: pos.lon,
              alt: pos.alt,
            });
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClosePanel, gameState.hoveredEntity, selectEntity, hoverEntity, findNearestInDirection, getEntityByRef, setFocusLocation]);

  return (
    <div className="absolute inset-0 pointer-events-none font-mono">
      {/* Entity Info Panel - Bottom Left */}
      <div className="absolute bottom-14 left-4 pointer-events-auto">
        <EntityInfoPanel onClose={handleClosePanel} />
      </div>
      
      {/* Bottom Bar */}
      <div className="absolute bottom-0 left-0 right-0 p-3 pointer-events-auto">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Mode Bar */}
          <ModeBar />
          
          {/* Center: Search Bar */}
          <div className="flex-1 max-w-md">
            <SearchBar />
      </div>
      
          {/* Right: Hints & Version */}
          <div className="text-right">
            <div className="text-[8px] text-[#444]">arrow keys to navigate</div>
            <div className="text-[8px] text-[#444]">bullantir aerosystems v1.2</div>
          </div>
        </div>
      </div>
    </div>
  );
}
