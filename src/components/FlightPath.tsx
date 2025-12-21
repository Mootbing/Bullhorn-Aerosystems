'use client';

import { useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { LineDashedMaterial } from 'three';
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

// Solid white line for traveled path
function TraveledPath({ waypoints }: { waypoints: TrackWaypoint[] }) {
  const lineObject = useMemo(() => {
    if (waypoints.length < 2) return null;

    const points: THREE.Vector3[] = [];
    
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const pos = latLonToVector3(wp.latitude, wp.longitude, wp.altitude);
      
      if (i > 0) {
        const prevWp = waypoints[i - 1];
        const prevPos = latLonToVector3(prevWp.latitude, prevWp.longitude, prevWp.altitude);
        const avgAlt = (wp.altitude + prevWp.altitude) / 2;
        
        // Add interpolated points for smooth curve
        for (let j = 1; j <= 3; j++) {
          const t = j / 4;
          points.push(interpolateOnGlobe(prevPos, pos, t, avgAlt));
        }
      }
      
      points.push(pos);
    }
    
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    
    // Gradient from dim to bright white
    const colors: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const progress = i / (points.length - 1);
      const intensity = 0.3 + progress * 0.7; // Start dimmer, end bright
      colors.push(intensity, intensity, intensity);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
    });
    
    return new THREE.Line(geo, mat);
  }, [waypoints]);

  if (!lineObject) return null;
  return <primitive object={lineObject} />;
}

// Dotted white line for predicted future path
function PredictedPath({ aircraft }: { aircraft: Aircraft }) {
  const lineObject = useMemo(() => {
    if (!aircraft) return null;
    
    const { latitude, longitude, altitude, heading, speed } = aircraft.position;
    
    // Predict path based on current heading and speed
    // Show ~10 minutes of predicted flight
    const predictMinutes = 10;
    const points: THREE.Vector3[] = [];
    
    // Current position
    const startPos = latLonToVector3(latitude, longitude, altitude);
    points.push(startPos);
    
    // Calculate predicted positions
    // Speed is in knots, convert to degrees per minute (very rough approximation)
    const speedDegPerMin = (speed / 60) / 60; // Rough conversion
    const headingRad = heading * (Math.PI / 180);
    
    for (let min = 1; min <= predictMinutes; min++) {
      const distance = speedDegPerMin * min;
      const newLat = latitude + distance * Math.cos(headingRad);
      const newLon = longitude + distance * Math.sin(headingRad);
      
      // Clamp to valid ranges
      const clampedLat = Math.max(-90, Math.min(90, newLat));
      const clampedLon = ((newLon + 180) % 360) - 180;
      
      const pos = latLonToVector3(clampedLat, clampedLon, altitude);
      
      // Add intermediate points for curve
      if (points.length > 0) {
        const prevPos = points[points.length - 1];
        for (let j = 1; j <= 2; j++) {
          const t = j / 3;
          points.push(interpolateOnGlobe(prevPos, pos, t, altitude));
        }
      }
      points.push(pos);
    }
    
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    
    const mat = new LineDashedMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      dashSize: 0.003,
      gapSize: 0.003,
    });
    
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances(); // Required for dashed lines - must be called on Line, not geometry
    return line;
  }, [aircraft]);

  if (!lineObject) return null;
  return <primitive object={lineObject} />;
}

export function FlightPath({ icao24 }: { icao24: string | null }) {
  const fetchFlightTrack = useRadarStore((state) => state.fetchFlightTrack);
  const hoveredAircraft = useRadarStore((state) => state.gameState.hoveredAircraft);
  const selectedAircraft = useRadarStore((state) => state.gameState.selectedAircraft);
  const aircraft = useRadarStore((state) => state.aircraft);
  
  // Force re-render when tracks update by subscribing to the whole store
  const [trackData, setTrackData] = useState<{ waypoints: TrackWaypoint[]; isLoading: boolean; error?: string } | null>(null);
  
  const displayId = icao24 || hoveredAircraft || selectedAircraft;
  
  // Get the current aircraft for predicted path
  const currentAircraft = displayId ? aircraft.find(a => a.id === displayId) : undefined;
  
  // Subscribe to track changes
  useEffect(() => {
    if (!displayId) {
      setTrackData(null);
      return;
    }
    
    // Initial fetch
    fetchFlightTrack(displayId);
    
    // Subscribe to store changes
    const unsubscribe = useRadarStore.subscribe((state) => {
      const track = state.flightTracks.get(displayId);
      if (track) {
        setTrackData({
          waypoints: track.waypoints,
          isLoading: track.isLoading || false,
          error: track.error,
        });
      } else {
        setTrackData(null);
      }
    });
    
    // Check immediately
    const currentTrack = useRadarStore.getState().flightTracks.get(displayId);
    if (currentTrack) {
      setTrackData({
        waypoints: currentTrack.waypoints,
        isLoading: currentTrack.isLoading || false,
        error: currentTrack.error,
      });
    }
    
    return unsubscribe;
  }, [displayId, fetchFlightTrack]);
  
  if (!displayId) return null;
  
  const hasTrack = trackData && !trackData.isLoading && !trackData.error && trackData.waypoints.length >= 2;
  
  return (
    <group>
      {/* Solid white line for traveled path */}
      {hasTrack && <TraveledPath waypoints={trackData.waypoints} />}
      
      {/* Dotted white line for predicted future path */}
      {currentAircraft && <PredictedPath aircraft={currentAircraft} />}
    </group>
  );
}