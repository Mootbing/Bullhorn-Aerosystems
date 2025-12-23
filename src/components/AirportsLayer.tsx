'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useRadarStore, Airport } from '@/store/gameStore';
import { GLOBE, AIRPORTS, COLORS } from '@/config/constants';

function latLonToVector3(lat: number, lon: number): THREE.Vector3 {
  const r = GLOBE.AIRPORT_SURFACE_OFFSET;
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

const AIRPORT_ANIM_DURATION = 0.6; // seconds

// Instanced mesh for large airports with hover support
function LargeAirportsInstanced({ airports }: { airports: Airport[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const hoverEntity = useRadarStore((state) => state.hoverEntity);
  const selectEntity = useRadarStore((state) => state.selectEntity);
  const hoveredEntity = useRadarStore((state) => state.gameState.hoveredEntity);
  const hoveredAirport = hoveredEntity?.type === 'airport' ? hoveredEntity.id : null;
  const introPhase = useRadarStore((state) => state.introPhase);
  
  const animationProgress = useRef(0);
  const animationStarted = useRef(false);
  
  const positions = useMemo(() => {
    return airports.map(airport => latLonToVector3(airport.lat, airport.lon));
  }, [airports]);
  
  // Create a map from instance index to airport icao
  const indexToIcao = useMemo(() => {
    return airports.map(a => a.icao);
  }, [airports]);
  
  // Update instance matrices with scale animation
  useFrame((_, delta) => {
    if (!meshRef.current || positions.length === 0) return;
    
    // Start animation when airports phase begins
    if (introPhase === 'airports' || introPhase === 'aircraft' || introPhase === 'complete') {
      if (!animationStarted.current) {
        animationStarted.current = true;
        animationProgress.current = 0;
      }
    }
    
    // Animate progress
    if (animationStarted.current && animationProgress.current < 1) {
      animationProgress.current = Math.min(1, animationProgress.current + delta / AIRPORT_ANIM_DURATION);
    }
    
    // Ease out back for pop effect
    const t = animationProgress.current;
    const eased = animationStarted.current 
      ? 1 - Math.pow(1 - t, 3) * (1 + 2.5 * (1 - t))  // Overshoot ease
      : 0;
    const scale = Math.max(0, Math.min(1.1, eased)); // Slight overshoot then settle
    
    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 0, 1);
    
    positions.forEach((pos, i) => {
      dummy.position.copy(pos);
      const normal = pos.clone().normalize();
      dummy.quaternion.setFromUnitVectors(up, normal);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    
    // Also update material opacity
    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = Math.min(0.9, eased);
  });
  
  // Update colors based on hover state
  useEffect(() => {
    if (!meshRef.current) return;
    
    const color = new THREE.Color();
    const hoveredIdx = hoveredAirport ? indexToIcao.indexOf(hoveredAirport) : -1;
    
    for (let i = 0; i < airports.length; i++) {
      if (i === hoveredIdx) {
        color.set(COLORS.AIRPORT_HOVERED);
      } else {
        color.set(COLORS.AIRPORT_DEFAULT);
      }
      meshRef.current.setColorAt(i, color);
    }
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [hoveredAirport, airports.length, indexToIcao]);
  
  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined && indexToIcao[e.instanceId]) {
      hoverEntity({ type: 'airport', id: indexToIcao[e.instanceId] });
      document.body.style.cursor = 'pointer';
    }
  };
  
  const handlePointerOut = () => {
    hoverEntity(null);
    document.body.style.cursor = 'auto';
  };
  
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined && indexToIcao[e.instanceId]) {
      selectEntity({ type: 'airport', id: indexToIcao[e.instanceId] });
    }
  };
  
  if (airports.length === 0) return null;
  
  return (
    <instancedMesh 
      ref={meshRef} 
      args={[undefined, undefined, airports.length]}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      <planeGeometry args={[AIRPORTS.LARGE_AIRPORT_SIZE, AIRPORTS.LARGE_AIRPORT_SIZE]} />
      <meshBasicMaterial 
        color="#ffffff" 
        transparent 
        opacity={0}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

// Instanced mesh for small/medium airports with hover support
function SmallAirportsInstanced({ airports }: { airports: Airport[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  const hoverEntity = useRadarStore((state) => state.hoverEntity);
  const selectEntity = useRadarStore((state) => state.selectEntity);
  const hoveredEntity = useRadarStore((state) => state.gameState.hoveredEntity);
  const hoveredAirport = hoveredEntity?.type === 'airport' ? hoveredEntity.id : null;
  const introPhase = useRadarStore((state) => state.introPhase);
  
  const animationProgress = useRef(0);
  const animationStarted = useRef(false);
  
  const positions = useMemo(() => {
    return airports.map(airport => latLonToVector3(airport.lat, airport.lon));
  }, [airports]);
  
  const indexToIcao = useMemo(() => {
    return airports.map(a => a.icao);
  }, [airports]);
  
  // Update colors based on hover state
  useEffect(() => {
    if (!meshRef.current) return;
    
    const color = new THREE.Color();
    const hoveredIdx = hoveredAirport ? indexToIcao.indexOf(hoveredAirport) : -1;
    
    for (let i = 0; i < airports.length; i++) {
      if (i === hoveredIdx) {
        color.set(COLORS.AIRPORT_HOVERED);
      } else {
        color.set(COLORS.AIRPORT_DEFAULT);
      }
      meshRef.current.setColorAt(i, color);
    }
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [hoveredAirport, airports.length, indexToIcao]);
  
  useFrame((_, delta) => {
    if (!meshRef.current || positions.length === 0) return;
    
    // Start animation when airports phase begins
    if (introPhase === 'airports' || introPhase === 'aircraft' || introPhase === 'complete') {
      if (!animationStarted.current) {
        animationStarted.current = true;
        animationProgress.current = 0;
      }
    }
    
    // Animate progress
    if (animationStarted.current && animationProgress.current < 1) {
      animationProgress.current = Math.min(1, animationProgress.current + delta / AIRPORT_ANIM_DURATION);
    }
    
    // Ease out for scale
    const t = animationProgress.current;
    const eased = animationStarted.current ? 1 - Math.pow(1 - t, 3) : 0;
    const scale = eased;
    
    // Update instance matrices with scale
    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 0, 1);
    
    positions.forEach((pos, i) => {
      dummy.position.copy(pos);
      const normal = pos.clone().normalize();
      dummy.quaternion.setFromUnitVectors(up, normal);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    
    // Opacity logic
    const cameraDistance = camera.position.length();
    const baseOpacity = Math.max(0, Math.min(1, (AIRPORTS.SMALL_AIRPORT_FADE_DISTANCE - cameraDistance) * AIRPORTS.SMALL_AIRPORT_FADE_SPEED));
    
    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    
    // If any small airport is hovered, make layer fully visible
    const isHovered = hoveredAirport && indexToIcao.includes(hoveredAirport);
    if (isHovered) {
      material.opacity = eased;
      meshRef.current.visible = eased > 0.01;
    } else {
      material.opacity = baseOpacity * AIRPORTS.SMALL_AIRPORT_MAX_OPACITY * eased;
      meshRef.current.visible = baseOpacity > 0.01 && eased > 0.01;
    }
  });
  
  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined && indexToIcao[e.instanceId]) {
      hoverEntity({ type: 'airport', id: indexToIcao[e.instanceId] });
      document.body.style.cursor = 'pointer';
    }
  };
  
  const handlePointerOut = () => {
    hoverEntity(null);
    document.body.style.cursor = 'auto';
  };
  
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined && indexToIcao[e.instanceId]) {
      selectEntity({ type: 'airport', id: indexToIcao[e.instanceId] });
    }
  };
  
  if (airports.length === 0) return null;
  
  return (
    <instancedMesh 
      ref={meshRef} 
      args={[undefined, undefined, airports.length]}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      {/* Simple square geometry - minimal triangles for performance */}
      <planeGeometry args={[AIRPORTS.SMALL_AIRPORT_SIZE, AIRPORTS.SMALL_AIRPORT_SIZE]} />
      <meshBasicMaterial 
        color="#ffffff" 
        transparent 
        opacity={0.5}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

export function AirportsLayer() {
  const airports = useRadarStore((state) => state.airports);
  const fetchAirports = useRadarStore((state) => state.fetchAirports);
  const locationReady = useRadarStore((state) => state.locationReady);
  
  // Fetch airports when location is ready
  useEffect(() => {
    if (locationReady) {
      fetchAirports();
    }
  }, [locationReady, fetchAirports]);
  
  // Categorize airports
  const { largeAirports, smallAirports } = useMemo(() => {
    const large: Airport[] = [];
    const small: Airport[] = [];
    
    airports.forEach(airport => {
      if (airport.type === 'large_airport') {
        large.push(airport);
      } else {
        small.push(airport);
      }
    });
    
    return { largeAirports: large, smallAirports: small };
  }, [airports]);
  
  return (
    <group>
      {/* Large airports - bigger squares, always visible */}
      <LargeAirportsInstanced airports={largeAirports} />
      
      {/* Small/medium airports - circles, only when very zoomed in */}
      <SmallAirportsInstanced airports={smallAirports} />
    </group>
  );
}
