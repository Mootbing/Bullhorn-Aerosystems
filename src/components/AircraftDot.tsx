'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useRadarStore, ViewportBounds } from '@/store/gameStore';

interface Aircraft {
  id: string;
  callsign: string;
  position: { latitude: number; longitude: number; altitude: number; heading: number; speed: number; };
  isPlayerControlled?: boolean;
}

// Calculate opacity based on distance from viewport edge
function calculateEdgeOpacity(lat: number, lon: number, bounds: ViewportBounds | null): number {
  if (!bounds) return 1;
  
  const latRange = bounds.maxLat - bounds.minLat;
  const lonRange = bounds.maxLon - bounds.minLon;
  
  // Fade zone is 5% of the viewport size from each edge (tighter viewport)
  const fadeZoneLat = latRange * 0.05;
  const fadeZoneLon = lonRange * 0.05;
  
  // Calculate distance from edges (normalized 0-1 within fade zone)
  let latFade = 1;
  let lonFade = 1;
  
  // Latitude fade
  const distFromMinLat = lat - bounds.minLat;
  const distFromMaxLat = bounds.maxLat - lat;
  
  if (distFromMinLat < fadeZoneLat) {
    latFade = Math.max(0, distFromMinLat / fadeZoneLat);
  } else if (distFromMaxLat < fadeZoneLat) {
    latFade = Math.max(0, distFromMaxLat / fadeZoneLat);
  }
  
  // Longitude fade (handle wraparound)
  const normalizeLon = (l: number) => {
    while (l > 180) l -= 360;
    while (l < -180) l += 360;
    return l;
  };
  
  const normalizedLon = normalizeLon(lon);
  const minLon = normalizeLon(bounds.minLon);
  const maxLon = normalizeLon(bounds.maxLon);
  
  if (minLon <= maxLon) {
    const distFromMinLon = normalizedLon - minLon;
    const distFromMaxLon = maxLon - normalizedLon;
    
    if (distFromMinLon < fadeZoneLon) {
      lonFade = Math.max(0, distFromMinLon / fadeZoneLon);
    } else if (distFromMaxLon < fadeZoneLon) {
      lonFade = Math.max(0, distFromMaxLon / fadeZoneLon);
    }
  }
  
  // Use minimum of both fades, with smooth easing
  const rawOpacity = Math.min(latFade, lonFade);
  return rawOpacity * rawOpacity * (3 - 2 * rawOpacity); // Smoothstep
}

function latLonToVector3(lat: number, lon: number, alt: number = 0): THREE.Vector3 {
  const r = 1 + alt * 0.0000005;
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

function getAircraftOrientation(lat: number, lon: number, heading: number): THREE.Quaternion {
  const position = latLonToVector3(lat, lon, 0);
  
  // Up is radial direction (away from globe center)
  const up = position.clone().normalize();
  
  const latRad = lat * (Math.PI / 180);
  const lonRad = lon * (Math.PI / 180);
  
  // North vector (direction of increasing latitude along the surface)
  const north = new THREE.Vector3(
    Math.sin(latRad) * Math.cos(lonRad + Math.PI),
    Math.cos(latRad),
    -Math.sin(latRad) * Math.sin(lonRad + Math.PI)
  ).normalize();
  
  // Make north perpendicular to up (project onto tangent plane)
  north.sub(up.clone().multiplyScalar(north.dot(up))).normalize();
  
  // East vector (perpendicular to both up and north)
  const east = new THREE.Vector3().crossVectors(up, north).normalize();
  
  // Recalculate north to ensure orthogonality
  north.crossVectors(east, up).normalize();
  
  // Heading: 0 = north, 90 = east, 180 = south, 270 = west
  // Add 90 degrees to correct orientation (nose pointing in direction of travel)
  const headingRad = (heading + 90) * (Math.PI / 180);
  
  // Forward direction based on heading
  const forward = new THREE.Vector3()
    .addScaledVector(north, Math.cos(headingRad))
    .addScaledVector(east, Math.sin(headingRad))
    .normalize();
  
  // Create rotation matrix: forward = +Y, up = +Z (wings at +Z = away from globe)
  const matrix = new THREE.Matrix4();
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  
  matrix.makeBasis(right, forward, up);
  
  const quaternion = new THREE.Quaternion();
  quaternion.setFromRotationMatrix(matrix);
  
  return quaternion;
}

// Simple 2D triangle geometry for LOD (when there are many aircraft)
const triangleGeometry = (() => {
  const s = 0.006;
  const geometry = new THREE.BufferGeometry();
  // Flat triangle pointing in +Y direction (forward)
  const vertices = new Float32Array([
    0, s * 1.2, 0,        // Nose (front)
    -s * 0.6, -s * 0.6, 0, // Back left
    s * 0.6, -s * 0.6, 0,  // Back right
  ]);
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
})();

// Threshold for switching to simple triangles (LOD)
const LOD_THRESHOLD = 500;

export function AircraftDot({ aircraft, onClick }: { aircraft: Aircraft; onClick?: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const selectedAircraft = useRadarStore((state) => state.gameState.selectedAircraft);
  const hoveredAircraft = useRadarStore((state) => state.gameState.hoveredAircraft);
  const hoverAircraft = useRadarStore((state) => state.hoverAircraft);
  const viewportBounds = useRadarStore((state) => state.viewportBounds);
  const aircraftCount = useRadarStore((state) => state.aircraft.length);
  const isSelected = selectedAircraft === aircraft.id;
  const isHovered = hoveredAircraft === aircraft.id;
  const useSimpleMode = aircraftCount > LOD_THRESHOLD;
  
  const currentOpacity = useRef(0); // Start invisible, fade in
  const targetOpacity = useRef(1);
  const hasAppeared = useRef(false);
  
  const initialPos = latLonToVector3(aircraft.position.latitude, aircraft.position.longitude, aircraft.position.altitude);
  const initialQuat = getAircraftOrientation(aircraft.position.latitude, aircraft.position.longitude, aircraft.position.heading);
  
  const currentPos = useRef(initialPos.clone());
  const targetPos = useRef(initialPos.clone());
  const currentQuat = useRef(initialQuat.clone());
  const targetQuat = useRef(initialQuat.clone());
  
  // 3D Paper airplane geometry
  const planeGeometry = useMemo(() => {
    const s = 0.008;
    const geometry = new THREE.BufferGeometry();
    
    // Paper airplane: nose at +Y, wings at +Z (away from globe), keel at -Z (into globe)
    const vertices = new Float32Array([
      // Left wing (top surface) - wings point UP/outward (+Z)
      0, s * 1.5, 0,
      0, -s * 0.3, 0,
      -s * 0.7, -s * 0.5, s * 0.25,
      
      // Right wing (top surface) - wings point UP/outward (+Z)
      0, s * 1.5, 0,
      s * 0.7, -s * 0.5, s * 0.25,
      0, -s * 0.3, 0,
      
      // Left wing (bottom surface)
      0, s * 1.5, 0,
      -s * 0.7, -s * 0.5, s * 0.25,
      0, -s * 0.3, 0,
      
      // Right wing (bottom surface)
      0, s * 1.5, 0,
      0, -s * 0.3, 0,
      s * 0.7, -s * 0.5, s * 0.25,
      
      // Body keel (left face) - keel points DOWN/into globe (-Z)
      0, s * 1.5, 0,
      0, -s * 0.3, 0,
      0, -s * 0.6, -s * 0.15,
      
      // Body keel (right face)
      0, s * 1.5, 0,
      0, -s * 0.6, -s * 0.15,
      0, -s * 0.3, 0,
    ]);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }, []);
  
  // Larger hitbox for easier clicking
  const hitboxGeometry = useMemo(() => {
    const s = 0.02;
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      0, s * 1.5, 0,
      -s * 0.8, -s * 0.8, s * 0.4,
      s * 0.8, -s * 0.8, s * 0.4,
      
      0, s * 1.5, 0,
      s * 0.8, -s * 0.8, s * 0.4,
      0, -s * 0.8, -s * 0.3,
      
      0, s * 1.5, 0,
      0, -s * 0.8, -s * 0.3,
      -s * 0.8, -s * 0.8, s * 0.4,
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    return geometry;
  }, []);
  
  useEffect(() => {
    targetPos.current = latLonToVector3(aircraft.position.latitude, aircraft.position.longitude, aircraft.position.altitude);
    targetQuat.current = getAircraftOrientation(aircraft.position.latitude, aircraft.position.longitude, aircraft.position.heading);
  }, [aircraft.position.latitude, aircraft.position.longitude, aircraft.position.altitude, aircraft.position.heading]);
  
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    // Smooth position interpolation - matches 15 second API update interval
    // Factor of delta * 0.2 gives smooth ~15 second transition to target
    const posSmoothFactor = Math.min(delta * 0.2, 0.02);
    currentPos.current.lerp(targetPos.current, posSmoothFactor);
    groupRef.current.position.copy(currentPos.current);
    
    // Smooth rotation interpolation - slightly faster than position for responsive heading
    const rotSmoothFactor = Math.min(delta * 0.3, 0.03);
    currentQuat.current.slerp(targetQuat.current, rotSmoothFactor);
    groupRef.current.quaternion.copy(currentQuat.current);
    
    // Calculate zoom-based scale (like FlightRadar24)
    // Camera distance ranges from ~1.05 (very close) to ~5 (far away)
    const cameraDistance = state.camera.position.length();
    // Scale factor: SMALLER when zoomed in to prevent overlapping, larger when zoomed out
    // At distance 1.15 (city zoom), scale = ~0.3 (small to avoid overlap)
    // At distance 2.5 (default), scale = ~0.7
    // At distance 5 (max zoom out), scale = 1.0 (full size)
    const zoomScale = Math.max(0.2, Math.min(1.2, cameraDistance / 5));
    
    // Scale on hover/select
    const baseScale = isSelected ? 1.5 : isHovered ? 1.3 : 1;
    const pulse = (isSelected || isHovered) ? 1 + Math.sin(state.clock.elapsedTime * 4) * 0.1 : 1;
    groupRef.current.scale.setScalar(baseScale * pulse * zoomScale);
    
    // Smooth opacity transitions for viewport edge fading and fade-in
    // Selected/hovered aircraft always fully visible
    const edgeOpacity = (isSelected || isHovered) ? 1 : calculateEdgeOpacity(
      aircraft.position.latitude,
      aircraft.position.longitude,
      viewportBounds
    );
    
    // Fade in on first appearance
    if (!hasAppeared.current) {
      hasAppeared.current = true;
      currentOpacity.current = 0;
    }
    
    targetOpacity.current = edgeOpacity;
    // Smooth opacity transition
    const opacitySmoothFactor = Math.min(delta * 3, 0.2);
    currentOpacity.current += (targetOpacity.current - currentOpacity.current) * opacitySmoothFactor;
    
    // Update material opacity
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = currentOpacity.current;
      material.transparent = currentOpacity.current < 1;
    }
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
      {/* Only show hitbox in detailed paper airplane mode for performance */}
      {!useSimpleMode && (
        <mesh geometry={hitboxGeometry}>
          <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* LOD: Show simple 2D triangle or detailed paper airplane based on aircraft count */}
      <mesh ref={meshRef} geometry={useSimpleMode ? triangleGeometry : planeGeometry}>
        <meshBasicMaterial color={getColor()} side={THREE.DoubleSide} transparent />
      </mesh>
    </group>
  );
}
