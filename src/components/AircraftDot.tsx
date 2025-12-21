'use client';

import { useRef, useState, useEffect } from 'react';
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
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const selectedAircraft = useAirspaceStore((state) => state.gameState.selectedAircraft);
  const isSelected = selectedAircraft === aircraft.id;
  
  const currentPos = useRef(latLonToVector3(aircraft.position.latitude, aircraft.position.longitude, aircraft.position.altitude));
  const targetPos = useRef(currentPos.current.clone());
  
  useEffect(() => {
    targetPos.current = latLonToVector3(aircraft.position.latitude, aircraft.position.longitude, aircraft.position.altitude);
  }, [aircraft.position.latitude, aircraft.position.longitude, aircraft.position.altitude]);
  
  useFrame((state, delta) => {
    if (!meshRef.current) return;
    currentPos.current.lerp(targetPos.current, Math.min(delta * 2, 1));
    meshRef.current.position.copy(currentPos.current);
    if (isSelected || hovered) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.2;
      meshRef.current.scale.setScalar(scale * (isSelected ? 1.5 : 1.2));
    } else {
      meshRef.current.scale.setScalar(1);
    }
  });
  
  const getColor = () => {
    if (aircraft.isPlayerControlled) return '#00ff88';
    if (isSelected) return '#00aaff';
    if (hovered) return '#ffaa00';
    return '#ffffff';
  };
  
  return (
    <mesh
      ref={meshRef}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
    >
      <sphereGeometry args={[0.006, 8, 8]} />
      <meshBasicMaterial color={getColor()} />
    </mesh>
  );
}
