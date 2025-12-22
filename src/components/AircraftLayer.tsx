'use client';

import { useState, useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useRadarStore, Aircraft } from '@/store/gameStore';
import { AircraftDot } from './AircraftDot';
import { FlightPath } from './FlightPath';

// Convert lat/lon to 3D position for frustum check
function latLonToVector3(lat: number, lon: number, alt: number = 0): THREE.Vector3 {
  const r = 1 + alt * 0.0000005;
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

// Grace period before deloading out-of-view aircraft (ms)
const DELOAD_GRACE_PERIOD = 5000;
// How often to check for aircraft to deload (ms)
const DELOAD_CHECK_INTERVAL = 2000;

export function AircraftLayer() {
  const aircraft = useRadarStore((state) => state.aircraft);
  const selectEntity = useRadarStore((state) => state.selectEntity);
  const removeAircraft = useRadarStore((state) => state.removeAircraft);
  const hoveredEntity = useRadarStore((state) => state.gameState.hoveredEntity);
  const selectedEntity = useRadarStore((state) => state.gameState.selectedEntity);
  const { camera } = useThree();
  
  // Extract aircraft IDs from unified entity refs
  const hoveredAircraft = hoveredEntity?.type === 'aircraft' ? hoveredEntity.id : null;
  const selectedAircraft = selectedEntity?.type === 'aircraft' ? selectedEntity.id : null;
  const displayPathFor = hoveredAircraft || selectedAircraft;
  
  // Refs to track current selection/hover for use in useFrame (avoids stale closures)
  const selectedRef = useRef<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  selectedRef.current = selectedAircraft;
  hoveredRef.current = hoveredAircraft;
  
  // Visible aircraft state - updated on camera move
  const [visibleAircraft, setVisibleAircraft] = useState<Aircraft[]>([]);
  const lastUpdateTime = useRef(0);
  const frustum = useRef(new THREE.Frustum());
  const projScreenMatrix = useRef(new THREE.Matrix4());
  
  // Track when aircraft left the viewport for deloading
  const outOfViewSince = useRef<Map<string, number>>(new Map());
  const visibleIds = useRef<Set<string>>(new Set());
  
  // Check visibility of an aircraft
  const isAircraftVisible = (ac: Aircraft, cameraDir: THREE.Vector3, cameraPos: THREE.Vector3): boolean => {
    const pos = latLonToVector3(ac.position.latitude, ac.position.longitude, ac.position.altitude);
    
    // Check if position is in camera frustum
    if (!frustum.current.containsPoint(pos)) {
      return false;
    }
    
    // Check if aircraft is on the visible side of the globe (not behind it)
    const toAircraft = pos.clone().sub(cameraPos);
    const dotProduct = toAircraft.normalize().dot(cameraDir);
    
    // Only show if roughly in front of camera (dot > -0.3 allows some peripheral vision)
    return dotProduct > -0.3;
  };
  
  // Update visible aircraft when camera moves (throttled)
  useFrame((state) => {
    const now = state.clock.elapsedTime;
    // Throttle to every 100ms for performance
    if (now - lastUpdateTime.current < 0.1) return;
    lastUpdateTime.current = now;
    
    // Update frustum from camera
    projScreenMatrix.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.current.setFromProjectionMatrix(projScreenMatrix.current);
    
    // Get camera forward direction for backface culling
    const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const cameraPos = camera.position;
    
    const nowMs = Date.now();
    const newVisibleIds = new Set<string>();
    
    const visible = aircraft.filter((ac) => {
      // Always keep selected/hovered aircraft visible (use refs to get current values)
      if (ac.id === selectedRef.current || ac.id === hoveredRef.current) {
        newVisibleIds.add(ac.id);
        outOfViewSince.current.delete(ac.id); // Reset timer
        return true;
      }
      
      const isVisible = isAircraftVisible(ac, cameraDir, cameraPos);
      
      if (isVisible) {
        newVisibleIds.add(ac.id);
        // Clear out-of-view timer when aircraft comes back into view
        outOfViewSince.current.delete(ac.id);
      } else {
        // Track when aircraft left viewport
        if (!outOfViewSince.current.has(ac.id)) {
          outOfViewSince.current.set(ac.id, nowMs);
        }
      }
      
      return isVisible;
    });
    
    visibleIds.current = newVisibleIds;
    
    // Only update state if count changed (avoid unnecessary re-renders)
    if (visible.length !== visibleAircraft.length || 
        visible.some((ac, i) => visibleAircraft[i]?.id !== ac.id)) {
      setVisibleAircraft(visible);
    }
  });
  
  // Periodically deload aircraft that have been out of view for too long
  useEffect(() => {
    const checkDeload = () => {
      const nowMs = Date.now();
      const toRemove: string[] = [];
      
      outOfViewSince.current.forEach((exitTime, id) => {
        // Don't remove selected or hovered aircraft
        if (id === selectedAircraft || id === hoveredAircraft) {
          outOfViewSince.current.delete(id);
          return;
        }
        
        // Check if grace period has passed
        if (nowMs - exitTime > DELOAD_GRACE_PERIOD) {
          toRemove.push(id);
          outOfViewSince.current.delete(id);
        }
      });
      
      if (toRemove.length > 0) {
        console.log(`[AircraftLayer] Deloading ${toRemove.length} out-of-view aircraft`);
        removeAircraft(toRemove);
      }
    };
    
    const interval = setInterval(checkDeload, DELOAD_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [removeAircraft, selectedAircraft, hoveredAircraft]);
  
  return (
    <group>
      {displayPathFor && <FlightPath icao24={displayPathFor} />}
      
      {visibleAircraft.map((ac) => (
        <AircraftDot key={ac.id} aircraft={ac} onClick={() => selectEntity({ type: 'aircraft', id: ac.id })} />
      ))}
    </group>
  );
}
