'use client';

import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useRadarStore, TrackWaypoint, Aircraft } from '@/store/gameStore';

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

// Animation timing constants
const TOTAL_ANIMATION_TIME = 0.8; // Total animation duration in seconds
const TRAVELED_RATIO = 0.5; // First half for traveled path
const PREDICTED_RATIO = 0.5; // Second half for predicted path

// Combined flight path with synchronized drawing animation
// Draws: origin → plane (solid) → destination (dotted) in one continuous stroke
function CombinedFlightPath({ 
  waypoints, 
  aircraft 
}: { 
  waypoints: TrackWaypoint[]; 
  aircraft: Aircraft;
}) {
  const animationProgress = useRef(0);
  const animationKey = useRef('');
  
  // Create a unique key to detect when we need to reset animation
  const currentKey = useMemo(() => {
    if (waypoints.length === 0) return '';
    const first = waypoints[0];
    const last = waypoints[waypoints.length - 1];
    return `${aircraft.id}-${waypoints.length}-${first?.latitude?.toFixed(2)}-${last?.latitude?.toFixed(2)}`;
  }, [waypoints, aircraft.id]);
  
  // Build traveled path geometry (origin → plane)
  const traveled = useMemo(() => {
    if (waypoints.length < 2) return { geometry: null, material: null, totalPoints: 0 };

    const pts: THREE.Vector3[] = [];
    
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const pos = latLonToVector3(wp.latitude, wp.longitude, wp.altitude);
      
      if (i > 0) {
        const prevWp = waypoints[i - 1];
        const prevPos = latLonToVector3(prevWp.latitude, prevWp.longitude, prevWp.altitude);
        const avgAlt = (wp.altitude + prevWp.altitude) / 2;
        
        for (let j = 1; j <= 3; j++) {
          const t = j / 4;
          pts.push(interpolateOnGlobe(prevPos, pos, t, avgAlt));
        }
      }
      pts.push(pos);
    }
    
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setDrawRange(0, 0); // Start hidden
    
    const mat = new THREE.LineBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.9,
    });
    
    return { geometry: geo, material: mat, totalPoints: pts.length };
  }, [waypoints]);
  
  // Build predicted path geometry (plane → destination)
  const predicted = useMemo(() => {
    const { latitude, longitude, altitude, heading, speed } = aircraft.position;
    
    const predictMinutes = 10;
    const pts: THREE.Vector3[] = [];
    
    const startPos = latLonToVector3(latitude, longitude, altitude);
    pts.push(startPos);
    
    const speedDegPerMin = (speed / 60) / 60;
    const headingRad = heading * (Math.PI / 180);
    
    for (let min = 1; min <= predictMinutes; min++) {
      const distance = speedDegPerMin * min;
      const newLat = latitude + distance * Math.cos(headingRad);
      const newLon = longitude + distance * Math.sin(headingRad);
      
      const clampedLat = Math.max(-90, Math.min(90, newLat));
      const clampedLon = ((newLon + 180) % 360) - 180;
      
      const pos = latLonToVector3(clampedLat, clampedLon, altitude);
      
      if (pts.length > 0) {
        const prevPos = pts[pts.length - 1];
        for (let j = 1; j <= 2; j++) {
          const t = j / 3;
          pts.push(interpolateOnGlobe(prevPos, pos, t, altitude));
        }
      }
      pts.push(pos);
    }
    
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setDrawRange(0, 0); // Start hidden
    
    // Compute line distances for dashed effect
    const lineDistances = [0];
    for (let i = 1; i < pts.length; i++) {
      lineDistances.push(lineDistances[i-1] + pts[i].distanceTo(pts[i-1]));
    }
    geo.setAttribute('lineDistance', new THREE.Float32BufferAttribute(lineDistances, 1));
    
    const mat = new THREE.LineDashedMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.5,
      dashSize: 0.002,
      gapSize: 0.004,
    });
    
    return { geometry: geo, material: mat, totalPoints: pts.length };
  }, [aircraft]);
  
  // Reset animation when aircraft/track changes
  useEffect(() => {
    if (currentKey !== animationKey.current) {
      animationProgress.current = 0;
      animationKey.current = currentKey;
      
      // Reset both geometries
      if (traveled.geometry) {
        traveled.geometry.setDrawRange(0, 0);
      }
      if (predicted.geometry) {
        predicted.geometry.setDrawRange(0, 0);
      }
    }
  }, [currentKey, traveled.geometry, predicted.geometry]);
  
  // Animate the continuous drawing: origin → plane → destination
  useFrame((_, delta) => {
    if (!traveled.geometry || !predicted.geometry) return;
    
    // Progress the animation
    animationProgress.current = Math.min(animationProgress.current + delta / TOTAL_ANIMATION_TIME, 1);
    const t = animationProgress.current;
    
    // Phase 1: Draw traveled path (origin → plane)
    // Uses linear interpolation (no easing) for constant speed
    if (t <= TRAVELED_RATIO) {
      // Normalize t to 0-1 for this phase
      const phaseT = t / TRAVELED_RATIO;
      const visibleCount = Math.max(2, Math.floor(phaseT * traveled.totalPoints));
      traveled.geometry.setDrawRange(0, visibleCount);
      predicted.geometry.setDrawRange(0, 0); // Keep predicted hidden
    } 
    // Phase 2: Draw predicted path (plane → destination)
    // Uses ease-out at the end only
    else {
      // Show full traveled path
      traveled.geometry.setDrawRange(0, traveled.totalPoints);
      
      // Normalize t to 0-1 for this phase
      const phaseT = (t - TRAVELED_RATIO) / PREDICTED_RATIO;
      
      // Apply ease-out only for the last 30% of this phase
      let easedT: number;
      if (phaseT < 0.7) {
        // Linear for first 70%
        easedT = phaseT / 0.7 * 0.7;
      } else {
        // Ease-out for last 30%
        const endT = (phaseT - 0.7) / 0.3;
        const eased = 1 - Math.pow(1 - endT, 3);
        easedT = 0.7 + eased * 0.3;
      }
      
      const visibleCount = Math.max(2, Math.floor(easedT * predicted.totalPoints));
      predicted.geometry.setDrawRange(0, visibleCount);
    }
  });

  return (
    <group>
      {/* Solid green line: origin → plane */}
      {traveled.geometry && traveled.material && (
        <line geometry={traveled.geometry} material={traveled.material} />
      )}
      
      {/* Dotted green line: plane → destination */}
      {predicted.geometry && predicted.material && (
        <line geometry={predicted.geometry} material={predicted.material} />
      )}
    </group>
  );
}

// Simple predicted path for when we don't have track data
function PredictedPathOnly({ aircraft }: { aircraft: Aircraft }) {
  const animationProgress = useRef(0);
  const prevAircraftId = useRef<string | null>(null);
  
  const { geometry, material, totalPoints } = useMemo(() => {
    const { latitude, longitude, altitude, heading, speed } = aircraft.position;
    
    const predictMinutes = 10;
    const pts: THREE.Vector3[] = [];
    
    const startPos = latLonToVector3(latitude, longitude, altitude);
    pts.push(startPos);
    
    const speedDegPerMin = (speed / 60) / 60;
    const headingRad = heading * (Math.PI / 180);
    
    for (let min = 1; min <= predictMinutes; min++) {
      const distance = speedDegPerMin * min;
      const newLat = latitude + distance * Math.cos(headingRad);
      const newLon = longitude + distance * Math.sin(headingRad);
      
      const clampedLat = Math.max(-90, Math.min(90, newLat));
      const clampedLon = ((newLon + 180) % 360) - 180;
      
      const pos = latLonToVector3(clampedLat, clampedLon, altitude);
      
      if (pts.length > 0) {
        const prevPos = pts[pts.length - 1];
        for (let j = 1; j <= 2; j++) {
          const t = j / 3;
          pts.push(interpolateOnGlobe(prevPos, pos, t, altitude));
        }
      }
      pts.push(pos);
    }
    
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setDrawRange(0, 0);
    
    const lineDistances = [0];
    for (let i = 1; i < pts.length; i++) {
      lineDistances.push(lineDistances[i-1] + pts[i].distanceTo(pts[i-1]));
    }
    geo.setAttribute('lineDistance', new THREE.Float32BufferAttribute(lineDistances, 1));
    
    const mat = new THREE.LineDashedMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.5,
      dashSize: 0.002,
      gapSize: 0.004,
    });
    
    return { geometry: geo, material: mat, totalPoints: pts.length };
  }, [aircraft]);
  
  useEffect(() => {
    if (aircraft.id !== prevAircraftId.current) {
      animationProgress.current = 0;
      prevAircraftId.current = aircraft.id;
      if (geometry) {
        geometry.setDrawRange(0, 0);
      }
    }
  }, [aircraft.id, geometry]);
  
  useFrame((_, delta) => {
    if (!geometry || totalPoints < 2) return;
    
    animationProgress.current = Math.min(animationProgress.current + delta / 0.4, 1);
    const t = animationProgress.current;
    
    // Ease-out only at the end
    let easedT: number;
    if (t < 0.7) {
      easedT = t;
    } else {
      const endT = (t - 0.7) / 0.3;
      const eased = 1 - Math.pow(1 - endT, 3);
      easedT = 0.7 + eased * 0.3;
    }
    
    const visibleCount = Math.max(2, Math.floor(easedT * totalPoints));
    geometry.setDrawRange(0, visibleCount);
  });

  if (!geometry || !material) return null;
  
  return <line geometry={geometry} material={material} />;
}

export function FlightPath({ icao24 }: { icao24: string | null }) {
  const fetchFlightTrack = useRadarStore((state) => state.fetchFlightTrack);
  const hoveredAircraft = useRadarStore((state) => state.gameState.hoveredAircraft);
  const selectedAircraft = useRadarStore((state) => state.gameState.selectedAircraft);
  const aircraft = useRadarStore((state) => state.aircraft);
  const flightTracks = useRadarStore((state) => state.flightTracks);
  
  const displayId = icao24 || hoveredAircraft || selectedAircraft;
  const currentAircraft = displayId ? aircraft.find(a => a.id === displayId) : undefined;
  
  // Get track data directly from the Map (stable reference)
  const track = displayId ? flightTracks.get(displayId) : null;
  const trackData = useMemo(() => {
    if (!track) return null;
    return {
      waypoints: track.waypoints,
      isLoading: track.isLoading || false,
      error: track.error,
    };
  }, [track]);
  
  useEffect(() => {
    if (!displayId) return;
    fetchFlightTrack(displayId);
  }, [displayId, fetchFlightTrack]);
  
  if (!displayId || !currentAircraft) return null;
  
  const hasTrack = trackData && !trackData.isLoading && !trackData.error && trackData.waypoints.length >= 2;
  
  return (
    <group>
      {/* Combined path with synchronized animation: origin → plane → destination */}
      {hasTrack ? (
        <CombinedFlightPath waypoints={trackData.waypoints} aircraft={currentAircraft} />
      ) : (
        /* Just predicted path if no track data available */
        <PredictedPathOnly aircraft={currentAircraft} />
      )}
    </group>
  );
}
