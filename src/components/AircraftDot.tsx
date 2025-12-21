'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAirspaceStore } from '@/store/gameStore';

interface Aircraft {
  id: string;
  callsign: string;
  position: { latitude: number; longitude: number; altitude: number; heading: number; speed: number; };
  isPlayerControlled?: boolean;
}

function latLonToVector3(lat: number, lon: number, alt: number = 0): THREE.Vector3 {
  const r = 1 + alt * 0.0000005;
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

export function AircraftDot({ aircraft, onClick }: { aircraft: Aircraft; onClick?: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const selectedAircraft = useAirspaceStore((state) => state.gameState.selectedAircraft);
  const hoveredAircraft = useAirspaceStore((state) => state.gameState.hoveredAircraft);
  const hoverAircraft = useAirspaceStore((state) => state.hoverAircraft);
  const isSelected = selectedAircraft === aircraft.id;
  const isHovered = hoveredAircraft === aircraft.id;
  
  const currentPos = useRef(latLonToVector3(aircraft.position.latitude, aircraft.position.longitude, aircraft.position.altitude));
  const targetPos = useRef(currentPos.current.clone());
  const currentHeading = useRef(aircraft.position.heading);
  
  // Arrow shape geometry
  const arrowShape = useMemo(() => {
    const shape = new THREE.Shape();
    const s = 0.008; // scale
    shape.moveTo(0, s * 1.5); // tip
    shape.lineTo(s * 0.6, -s * 0.8); // right wing
    shape.lineTo(0, -s * 0.3); // tail center
    shape.lineTo(-s * 0.6, -s * 0.8); // left wing
    shape.lineTo(0, s * 1.5); // back to tip
    return shape;
  }, []);
  
  useEffect(() => {
    targetPos.current = latLonToVector3(aircraft.position.latitude, aircraft.position.longitude, aircraft.position.altitude);
  }, [aircraft.position.latitude, aircraft.position.longitude, aircraft.position.altitude]);
  
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    // Lerp position
    currentPos.current.lerp(targetPos.current, Math.min(delta * 2, 1));
    groupRef.current.position.copy(currentPos.current);
    
    // Orient to face outward from globe center
    groupRef.current.lookAt(0, 0, 0);
    groupRef.current.rotateX(Math.PI / 2);
    
    // Apply heading rotation (smoothly interpolate)
    const targetHeading = aircraft.position.heading * (Math.PI / 180);
    currentHeading.current += (targetHeading - currentHeading.current) * Math.min(delta * 2, 1);
    groupRef.current.rotateZ(-currentHeading.current);
    
    // Scale on hover/select
    const baseScale = isSelected ? 1.5 : isHovered ? 1.3 : 1;
    const pulse = (isSelected || isHovered) ? 1 + Math.sin(state.clock.elapsedTime * 4) * 0.1 : 1;
    groupRef.current.scale.setScalar(baseScale * pulse);
  });
  
  const getColor = () => {
    if (aircraft.isPlayerControlled) return '#00ff88';
    if (isSelected) return '#00aaff';
    if (isHovered) return '#ffaa00';
    return '#ffffff';
  };
  
  return (
    <group
      ref={groupRef}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      onPointerOver={(e) => { e.stopPropagation(); hoverAircraft(aircraft.id); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { hoverAircraft(null); document.body.style.cursor = 'auto'; }}
    >
      <mesh>
        <shapeGeometry args={[arrowShape]} />
        <meshBasicMaterial color={getColor()} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
