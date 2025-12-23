'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useRadarStore, Airport } from '@/store/gameStore';
import { GLOBE, AIRPORTS, COLORS } from '@/config/constants';
import { calculateViewVisibility } from '@/utils/lod';
import { latLonToVector3 } from '@/utils/geo';
import { createRenderLoopAllocations } from '@/utils/sharedGeometry';

// ============================================================================
// AIRPORTS LAYER
// Uses instanced mesh for efficient rendering
// Fixed: Pre-allocated objects for render loop, no GC pressure
// ============================================================================

const AIRPORT_ANIM_DURATION = 1.2;
const AIRPORT_RIPPLE_DURATION = 0.5;
const AIRPORT_OVERSHOOT = 1.6;
const OPACITY_SMOOTH_FACTOR = 4;

// Ripple ease: starts big, settles to 1.0
function rippleEase(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const overshoot = AIRPORT_OVERSHOOT;
  const decay = Math.pow(1 - t, 2);
  return 1 + (overshoot - 1) * decay * Math.sin(t * Math.PI);
}

// Instanced mesh for large airports
function LargeAirportsInstanced({ airports }: { airports: Airport[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  const hoverEntity = useRadarStore((state) => state.hoverEntity);
  const selectEntity = useRadarStore((state) => state.selectEntity);
  const hoveredEntity = useRadarStore((state) => state.gameState.hoveredEntity);
  const hoveredAirport = hoveredEntity?.type === 'airport' ? hoveredEntity.id : null;
  const introPhase = useRadarStore((state) => state.introPhase);
  
  // Pre-allocated objects for render loop - CRITICAL: never recreate these
  const allocs = useRef(createRenderLoopAllocations());
  const animationTime = useRef(0);
  const animationStarted = useRef(false);
  const instanceOpacities = useRef<number[]>([]);
  
  // Pre-computed positions (only update when airports change)
  const positions = useMemo(() => {
    return airports.map(airport => latLonToVector3(airport.lat, airport.lon, 0, GLOBE.AIRPORT_SURFACE_OFFSET));
  }, [airports]);
  
  // Pre-computed stagger delays
  const staggerDelays = useMemo(() => {
    return airports.map(airport => {
      const normalizedLon = (airport.lon + 180) / 360;
      const normalizedLat = (90 - airport.lat) / 180;
      const diagonal = (normalizedLon + normalizedLat) / 2;
      return diagonal * AIRPORT_ANIM_DURATION;
    });
  }, [airports]);
  
  const indexToIcao = useMemo(() => airports.map(a => a.icao), [airports]);
  
  // Initialize opacity array
  useEffect(() => {
    instanceOpacities.current = new Array(airports.length).fill(0);
  }, [airports.length]);
  
  // Update instance matrices - uses pre-allocated objects
  useFrame((_, delta) => {
    if (!meshRef.current || positions.length === 0) return;
    
    const { dummy, vec3_a } = allocs.current;
    
    // Start animation when airports phase begins
    if (introPhase === 'airports' || introPhase === 'aircraft' || introPhase === 'complete') {
      if (!animationStarted.current) {
        animationStarted.current = true;
        animationTime.current = 0;
      }
    }
    
    if (animationStarted.current) {
      animationTime.current += delta;
    }
    
    // Pre-compute up vector once (reused for all instances)
    vec3_a.set(0, 0, 1);
    
    let maxProgress = 0;
    
    if (instanceOpacities.current.length !== positions.length) {
      instanceOpacities.current = new Array(positions.length).fill(0);
    }
    
    const smoothFactor = Math.min(delta * OPACITY_SMOOTH_FACTOR, 0.25);
    
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      dummy.position.copy(pos);
      
      // Get normal for orientation (position normalized = surface normal)
      const normal = dummy.position.clone().normalize();
      dummy.quaternion.setFromUnitVectors(vec3_a, normal);
      
      // Calculate animation progress
      const delay = staggerDelays[i];
      const individualTime = Math.max(0, animationTime.current - delay);
      const individualProgress = Math.min(1, individualTime / AIRPORT_RIPPLE_DURATION);
      maxProgress = Math.max(maxProgress, individualProgress);
      
      const rippleScale = animationStarted.current ? rippleEase(individualProgress) : 0;
      
      // View visibility
      const targetVisibility = calculateViewVisibility(pos, camera);
      instanceOpacities.current[i] += (targetVisibility - instanceOpacities.current[i]) * smoothFactor;
      const smoothVisibility = instanceOpacities.current[i];
      
      dummy.scale.setScalar(rippleScale * smoothVisibility);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    }
    
    meshRef.current.instanceMatrix.needsUpdate = true;
    
    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = Math.min(0.9, maxProgress);
  });
  
  // Update colors based on hover
  useEffect(() => {
    if (!meshRef.current) return;
    
    const color = new THREE.Color();
    const hoveredIdx = hoveredAirport ? indexToIcao.indexOf(hoveredAirport) : -1;
    
    for (let i = 0; i < airports.length; i++) {
      color.set(i === hoveredIdx ? COLORS.AIRPORT_HOVERED : COLORS.AIRPORT_DEFAULT);
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
    }
  };
  
  const handlePointerOut = () => hoverEntity(null);
  
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

// Instanced mesh for small/medium airports
function SmallAirportsInstanced({ airports }: { airports: Airport[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  const hoverEntity = useRadarStore((state) => state.hoverEntity);
  const selectEntity = useRadarStore((state) => state.selectEntity);
  const hoveredEntity = useRadarStore((state) => state.gameState.hoveredEntity);
  const hoveredAirport = hoveredEntity?.type === 'airport' ? hoveredEntity.id : null;
  const introPhase = useRadarStore((state) => state.introPhase);
  
  // Pre-allocated objects - CRITICAL
  const allocs = useRef(createRenderLoopAllocations());
  const animationTime = useRef(0);
  const animationStarted = useRef(false);
  const instanceOpacities = useRef<number[]>([]);
  
  const positions = useMemo(() => {
    return airports.map(airport => latLonToVector3(airport.lat, airport.lon, 0, GLOBE.AIRPORT_SURFACE_OFFSET));
  }, [airports]);
  
  const staggerDelays = useMemo(() => {
    return airports.map(airport => {
      const normalizedLon = (airport.lon + 180) / 360;
      const normalizedLat = (90 - airport.lat) / 180;
      const diagonal = (normalizedLon + normalizedLat) / 2;
      return diagonal * AIRPORT_ANIM_DURATION;
    });
  }, [airports]);
  
  const indexToIcao = useMemo(() => airports.map(a => a.icao), [airports]);
  
  useEffect(() => {
    instanceOpacities.current = new Array(airports.length).fill(0);
  }, [airports.length]);
  
  // Update colors
  useEffect(() => {
    if (!meshRef.current) return;
    
    const color = new THREE.Color();
    const hoveredIdx = hoveredAirport ? indexToIcao.indexOf(hoveredAirport) : -1;
    const hasHover = hoveredIdx >= 0;
    
    for (let i = 0; i < airports.length; i++) {
      if (i === hoveredIdx) {
        color.set(COLORS.AIRPORT_HOVERED);
      } else if (hasHover) {
        color.set('#333333');
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
    
    const { dummy, vec3_a } = allocs.current;
    
    if (introPhase === 'airports' || introPhase === 'aircraft' || introPhase === 'complete') {
      if (!animationStarted.current) {
        animationStarted.current = true;
        animationTime.current = 0;
      }
    }
    
    if (animationStarted.current) {
      animationTime.current += delta;
    }
    
    const cameraDistance = camera.position.length();
    const baseOpacity = Math.max(0, Math.min(1, (AIRPORTS.SMALL_AIRPORT_FADE_DISTANCE - cameraDistance) * AIRPORTS.SMALL_AIRPORT_FADE_SPEED));
    
    const hoveredIdx = hoveredAirport ? indexToIcao.indexOf(hoveredAirport) : -1;
    const hasHoveredSmallAirport = hoveredIdx >= 0;
    
    vec3_a.set(0, 0, 1);
    let maxProgress = 0;
    
    if (instanceOpacities.current.length !== positions.length) {
      instanceOpacities.current = new Array(positions.length).fill(0);
    }
    
    const smoothFactor = Math.min(delta * OPACITY_SMOOTH_FACTOR, 0.25);
    
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      dummy.position.copy(pos);
      
      const normal = dummy.position.clone().normalize();
      dummy.quaternion.setFromUnitVectors(vec3_a, normal);
      
      const delay = staggerDelays[i];
      const individualTime = Math.max(0, animationTime.current - delay);
      const individualProgress = Math.min(1, individualTime / AIRPORT_RIPPLE_DURATION);
      maxProgress = Math.max(maxProgress, individualProgress);
      
      const rippleScale = animationStarted.current ? rippleEase(individualProgress) : 0;
      const targetVisibility = calculateViewVisibility(pos, camera);
      
      instanceOpacities.current[i] += (targetVisibility - instanceOpacities.current[i]) * smoothFactor;
      const smoothVisibility = instanceOpacities.current[i];
      
      dummy.scale.setScalar(rippleScale * smoothVisibility);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    }
    
    meshRef.current.instanceMatrix.needsUpdate = true;
    
    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    
    if (hasHoveredSmallAirport) {
      material.opacity = Math.max(0.8, baseOpacity * AIRPORTS.SMALL_AIRPORT_MAX_OPACITY) * maxProgress;
      meshRef.current.visible = maxProgress > 0.01;
    } else {
      material.opacity = baseOpacity * AIRPORTS.SMALL_AIRPORT_MAX_OPACITY * maxProgress;
      meshRef.current.visible = baseOpacity > 0.01 && maxProgress > 0.01;
    }
  });
  
  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined && indexToIcao[e.instanceId]) {
      hoverEntity({ type: 'airport', id: indexToIcao[e.instanceId] });
    }
  };
  
  const handlePointerOut = () => hoverEntity(null);
  
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
  
  useEffect(() => {
    if (locationReady) {
      fetchAirports();
    }
  }, [locationReady, fetchAirports]);
  
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
      <LargeAirportsInstanced airports={largeAirports} />
      <SmallAirportsInstanced airports={smallAirports} />
    </group>
  );
}
