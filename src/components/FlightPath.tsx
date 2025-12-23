'use client';

import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useRadarStore, TrackWaypoint, Aircraft } from '@/store/gameStore';
import { GLOBE, FLIGHT_PATH } from '@/config/constants';
import { latLonToVector3, interpolateOnGlobe } from '@/utils/geo';

// ============================================================================
// FLIGHT PATH COMPONENT
// Shows traveled path (solid) and predicted path (dashed)
// Fixed: Proper THREE.js disposal, no allocations in render loop
// ============================================================================

// Animation timing constants
const TOTAL_ANIMATION_TIME = FLIGHT_PATH.ANIMATION_DURATION;
const TRAVELED_RATIO = FLIGHT_PATH.TRAVELED_RATIO;
const PREDICTED_RATIO = FLIGHT_PATH.PREDICTED_RATIO;

// Combined flight path with synchronized drawing animation
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
    
    const predictMinutes = FLIGHT_PATH.PREDICT_MINUTES;
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
  
  // CRITICAL: Dispose geometries and materials on cleanup
  useEffect(() => {
    return () => {
      if (traveled.geometry) traveled.geometry.dispose();
      if (traveled.material) traveled.material.dispose();
      if (predicted.geometry) predicted.geometry.dispose();
      if (predicted.material) predicted.material.dispose();
    };
  }, [traveled, predicted]);
  
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
    if (t <= TRAVELED_RATIO) {
      const phaseT = t / TRAVELED_RATIO;
      const visibleCount = Math.max(2, Math.floor(phaseT * traveled.totalPoints));
      traveled.geometry.setDrawRange(0, visibleCount);
      predicted.geometry.setDrawRange(0, 0);
    } 
    // Phase 2: Draw predicted path (plane → destination)
    else {
      traveled.geometry.setDrawRange(0, traveled.totalPoints);
      
      const phaseT = (t - TRAVELED_RATIO) / PREDICTED_RATIO;
      
      let easedT: number;
      if (phaseT < 0.7) {
        easedT = phaseT / 0.7 * 0.7;
      } else {
        const endT = (phaseT - 0.7) / 0.3;
        const eased = 1 - Math.pow(1 - endT, 3);
        easedT = 0.7 + eased * 0.3;
      }
      
      const visibleCount = Math.max(2, Math.floor(easedT * predicted.totalPoints));
      predicted.geometry.setDrawRange(0, visibleCount);
    }
  });

  // Create line objects (memoized to avoid recreation)
  const traveledLine = useMemo(() => {
    if (!traveled.geometry || !traveled.material) return null;
    return new THREE.Line(traveled.geometry, traveled.material);
  }, [traveled.geometry, traveled.material]);
  
  const predictedLine = useMemo(() => {
    if (!predicted.geometry || !predicted.material) return null;
    const line = new THREE.Line(predicted.geometry, predicted.material);
    line.computeLineDistances();
    return line;
  }, [predicted.geometry, predicted.material]);
  
  return (
    <group>
      {traveledLine && <primitive object={traveledLine} />}
      {predictedLine && <primitive object={predictedLine} />}
    </group>
  );
}

// Simple predicted path for when we don't have track data
function PredictedPathOnly({ aircraft }: { aircraft: Aircraft }) {
  const animationProgress = useRef(0);
  const prevAircraftId = useRef<string | null>(null);
  
  const { geometry, material, totalPoints } = useMemo(() => {
    const { latitude, longitude, altitude, heading, speed } = aircraft.position;
    
    const predictMinutes = FLIGHT_PATH.PREDICT_MINUTES;
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
  
  // CRITICAL: Dispose on cleanup
  useEffect(() => {
    return () => {
      geometry?.dispose();
      material?.dispose();
    };
  }, [geometry, material]);
  
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
    
    animationProgress.current = Math.min(animationProgress.current + delta / 0.3, 1);
    const t = animationProgress.current;
    
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

  const lineObject = useMemo(() => {
    if (!geometry || !material) return null;
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    return line;
  }, [geometry, material]);

  if (!lineObject) return null;
  
  return <primitive object={lineObject} />;
}

export function FlightPath({ icao24 }: { icao24: string | null }) {
  const fetchFlightTrack = useRadarStore((state) => state.fetchFlightTrack);
  const hoveredEntity = useRadarStore((state) => state.gameState.hoveredEntity);
  const selectedEntity = useRadarStore((state) => state.gameState.selectedEntity);
  const aircraft = useRadarStore((state) => state.aircraft);
  const flightTracks = useRadarStore((state) => state.flightTracks);
  
  const hoveredAircraftId = hoveredEntity?.type === 'aircraft' ? hoveredEntity.id : null;
  const selectedAircraftId = selectedEntity?.type === 'aircraft' ? selectedEntity.id : null;
  const displayId = icao24 || hoveredAircraftId || selectedAircraftId;
  const currentAircraft = displayId ? aircraft.find(a => a.id === displayId) : undefined;
  
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
      {hasTrack ? (
        <CombinedFlightPath waypoints={trackData.waypoints} aircraft={currentAircraft} />
      ) : (
        <PredictedPathOnly aircraft={currentAircraft} />
      )}
    </group>
  );
}
