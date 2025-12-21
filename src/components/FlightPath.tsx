'use client';

import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useAirspaceStore, TrackWaypoint } from '@/store/gameStore';

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

function interpolateOnGlobe(p1: THREE.Vector3, p2: THREE.Vector3, t: number, alt: number): THREE.Vector3 {
  const result = new THREE.Vector3();
  result.copy(p1).lerp(p2, t);
  const r = 1 + alt * 0.0000005;
  result.normalize().multiplyScalar(r);
  return result;
}

function FlightPathLine({ waypoints, isHovered }: { waypoints: TrackWaypoint[]; isHovered: boolean }) {
  const lineObject = useMemo(() => {
    if (waypoints.length < 2) {
      return null;
    }
    
    console.log('[FlightPath] Creating line with', waypoints.length, 'waypoints');

    const points: THREE.Vector3[] = [];
    
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const pos = latLonToVector3(wp.latitude, wp.longitude, wp.altitude);
      
      if (i > 0) {
        const prevWp = waypoints[i - 1];
        const prevPos = latLonToVector3(prevWp.latitude, prevWp.longitude, prevWp.altitude);
        const avgAlt = (wp.altitude + prevWp.altitude) / 2;
        
        for (let j = 1; j <= 3; j++) {
          const t = j / 4;
          const interpPos = interpolateOnGlobe(prevPos, pos, t, avgAlt);
          points.push(interpPos);
        }
      }
      
      points.push(pos);
    }
    
    console.log('[FlightPath] Total points: ', points.length);
    
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    
    const finalColors: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const progress = i / (points.length - 1);
      const intensity = 0.2 + progress * 0.8;
      finalColors.push(0, intensity, intensity * 0.9);
    }
    
    geo.setAttribute('color', new THREE.Float32BufferAttribute(finalColors, 3));
    
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
    });
    
    return new THREE.Line(geo, mat);
  }, [waypoints]);

  useEffect(() => {
    if (lineObject && lineObject.material instanceof THREE.LineBasicMaterial) {
      lineObject.material.opacity = isHovered ? 0.9 : 0.7;
    }
  }, [isHovered, lineObject]);

  if (!lineObject || waypoints.length < 2) {
    return null;
  }

  return <primitive object={lineObject} />;
}

export function FlightPath({ icao24 }: { icao24: string | null }) {
  const flightTracks = useAirspaceStore((state) => state.flightTracks);
  const fetchFlightTrack = useAirspaceStore((state) => state.fetchFlightTrack);
  const hoveredAircraft = useAirspaceStore((state) => state.gameState.hoveredAircraft);
  const selectedAircraft = useAirspaceStore((state) => state.gameState.selectedAircraft);
  
  const displayId = icao24 || hoveredAircraft || selectedAircraft;
  const isHovered = displayId === hoveredAircraft;
  
  useEffect(() => {
    if (displayId) {
      console.log('[FlightPath] Fetching track for:', displayId);
      fetchFlightTrack(displayId);
    }
  }, [displayId, fetchFlightTrack]);
  
  if (!displayId) {
    return null;
  }
  
  const track = flightTracks.get(displayId);
  
  console.log('[FlightPath] Track state:', {
    hasTrack: !!track,
    isLoading: track?.isLoading,
    error: track?.error,
    waypoints: track?.waypoints?.length || 0,
  });
  
  if (!track || track.isLoading || track.error || track.waypoints.length < 2) {
    return null;
  }
  
  return (
    <group>
      <FlightPathLine waypoints={track.waypoints} isHovered={isHovered} />
    </group>
  );
}