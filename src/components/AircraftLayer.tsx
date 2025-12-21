'use client';

import { useState, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAirspaceStore, Aircraft } from '@/store/gameStore';
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

export function AircraftLayer() {
  const aircraft = useAirspaceStore((state) => state.aircraft);
  const selectAircraft = useAirspaceStore((state) => state.selectAircraft);
  const hoveredAircraft = useAirspaceStore((state) => state.gameState.hoveredAircraft);
  const selectedAircraft = useAirspaceStore((state) => state.gameState.selectedAircraft);
  const { camera } = useThree();
  
  const displayPathFor = hoveredAircraft || selectedAircraft;
  
  // Visible aircraft state - updated on camera move
  const [visibleAircraft, setVisibleAircraft] = useState<Aircraft[]>([]);
  const lastUpdateTime = useRef(0);
  const frustum = useRef(new THREE.Frustum());
  const projScreenMatrix = useRef(new THREE.Matrix4());
  
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
    
    const visible = aircraft.filter((ac) => {
      // Always keep selected/hovered aircraft visible
      if (ac.id === selectedAircraft || ac.id === hoveredAircraft) {
        return true;
      }
      
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
    });
    
    // Only update state if count changed (avoid unnecessary re-renders)
    if (visible.length !== visibleAircraft.length || 
        visible.some((ac, i) => visibleAircraft[i]?.id !== ac.id)) {
      setVisibleAircraft(visible);
    }
  });
  
  return (
    <group>
      {displayPathFor && <FlightPath icao24={displayPathFor} />}
      
      {visibleAircraft.map((ac) => (
        <AircraftDot key={ac.id} aircraft={ac} onClick={() => selectAircraft(ac.id)} />
      ))}
    </group>
  );
}
