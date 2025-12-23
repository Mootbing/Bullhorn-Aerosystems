'use client';

import { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useRadarStore } from '@/store/gameStore';
import { CAMERA, LOCATIONS, GLOBE, UI, INPUT } from '@/config/constants';

// Calculate the forward direction vector for an aircraft based on heading
function getAircraftForwardVector(lat: number, lon: number, heading: number): THREE.Vector3 {
  const position = latLonToVector3(lat, lon, 0);
  const up = position.clone().normalize();
  
  const latRad = lat * (Math.PI / 180);
  const lonRad = lon * (Math.PI / 180);
  
  // North vector
  const north = new THREE.Vector3(
    Math.sin(latRad) * Math.cos(lonRad + Math.PI),
    Math.cos(latRad),
    -Math.sin(latRad) * Math.sin(lonRad + Math.PI)
  ).normalize();
  
  north.sub(up.clone().multiplyScalar(north.dot(up))).normalize();
  const east = new THREE.Vector3().crossVectors(up, north).normalize();
  north.crossVectors(east, up).normalize();
  
  // Forward based on heading (add 90 to match aircraft orientation)
  const headingRad = (heading + 90) * (Math.PI / 180);
  
  return new THREE.Vector3()
    .addScaledVector(north, Math.cos(headingRad))
    .addScaledVector(east, Math.sin(headingRad))
    .normalize();
}

function latLonToVector3(lat: number, lon: number, alt: number = 0): THREE.Vector3 {
  const r = 1 + alt * GLOBE.ALTITUDE_SCALE;
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

// Predict position based on speed (knots) and heading after elapsed time (seconds)
function predictPosition(
  lat: number,
  lon: number,
  heading: number,
  speedKnots: number,
  elapsedSeconds: number
): { lat: number; lon: number } {
  const kmPerHour = speedKnots * 1.852;
  const kmPerSecond = kmPerHour / 3600;
  const earthCircumferenceKm = GLOBE.EARTH_CIRCUMFERENCE_KM;
  const distanceDegreesEquator = (kmPerSecond * elapsedSeconds / earthCircumferenceKm) * 360;
  const headingRad = heading * (Math.PI / 180);
  const newLat = lat + distanceDegreesEquator * Math.cos(headingRad);
  const lonScale = Math.cos(lat * Math.PI / 180);
  const newLon = lon + (distanceDegreesEquator * Math.sin(headingRad)) / Math.max(0.1, lonScale);
  return { lat: newLat, lon: newLon };
}

export function CameraController() {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  
  const selectedEntity = useRadarStore((state) => state.gameState.selectedEntity);
  const focusLocation = useRadarStore((state) => state.gameState.focusLocation);
  const restoreCameraFlag = useRadarStore((state) => state.gameState.restoreCameraFlag);
  const aircraft = useRadarStore((state) => state.aircraft);
  const airports = useRadarStore((state) => state.airports);
  const setLocationReady = useRadarStore((state) => state.setLocationReady);
  const hoverEntity = useRadarStore((state) => state.hoverEntity);
  const setFocusLocation = useRadarStore((state) => state.setFocusLocation);
  
  // Get selected IDs by type
  const selectedAircraftId = selectedEntity?.type === 'aircraft' ? selectedEntity.id : null;
  const selectedAirportId = selectedEntity?.type === 'airport' ? selectedEntity.id : null;
  
  // Backward compat alias
  const selectedId = selectedAircraftId;
  
  const isAnimating = useRef(false);
  const animationProgress = useRef(0);
  const startPosition = useRef(new THREE.Vector3());
  const startTarget = useRef(new THREE.Vector3());
  const targetCameraPos = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  
  // Multi-phase animation for fly-over effect
  const animationPhase = useRef<'direct' | 'flyover'>('direct');
  const midpointCameraPos = useRef(new THREE.Vector3());
  const FLYOVER_ZOOM_OUT_DISTANCE = CAMERA.FLYOVER_ZOOM_OUT;
  
  const currentTarget = useRef(new THREE.Vector3(0, 0, 0));
  const currentCameraOffset = useRef(new THREE.Vector3());
  
  const prevSelectedId = useRef<string | null>(null);
  
  // Track last server update for selected aircraft prediction
  const lastServerData = useRef<{
    lat: number;
    lon: number;
    alt: number;
    heading: number;
    speed: number;
    time: number;
  } | null>(null);
  const isReturningToEarth = useRef(false);
  const hasInitializedLocation = useRef(false);
  const [initialLocation, setInitialLocation] = useState<{ lat: number; lon: number } | null>(null);
  
  // Save camera state before selecting an aircraft so we can return to it
  const savedCameraPosition = useRef(new THREE.Vector3());
  const savedCameraTarget = useRef(new THREE.Vector3());
  
  // Shift key tracking (for chase view to know when to pause following)
  const isShiftHeld = useRef(false);
  
  // Zoom key tracking (- to zoom out, = to zoom in)
  const isZoomInHeld = useRef(false);
  const isZoomOutHeld = useRef(false);
  
  // Arrow key tracking for freecam
  const arrowKeysHeld = useRef({ up: false, down: false, left: false, right: false });
  const wasMovingWithArrows = useRef(false);
  
  // Helper to find nearest entity to camera center
  const findNearestEntity = () => {
    // Get current camera look point
    const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const lookPoint = camera.position.clone().add(cameraDir).normalize();
    
    // Convert to lat/lon
    const lookLat = 90 - Math.acos(lookPoint.y) * (180 / Math.PI);
    const lookLon = Math.atan2(lookPoint.z, -lookPoint.x) * (180 / Math.PI) - 180;
    
    let bestEntity: { type: 'airport' | 'aircraft'; lat: number; lon: number; id: string } | null = null;
    let bestDist = Infinity;
    
    // Check airports
    for (const airport of airports) {
      const latDiff = airport.lat - lookLat;
      const lonDiff = airport.lon - lookLon;
      const dist = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
      
      if (dist < bestDist && dist < 15) { // Within 15 degrees
        bestDist = dist;
        bestEntity = { type: 'airport', lat: airport.lat, lon: airport.lon, id: airport.icao };
      }
    }
    
    // Check aircraft
    for (const ac of aircraft) {
      const latDiff = ac.position.latitude - lookLat;
      const lonDiff = ac.position.longitude - lookLon;
      const dist = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
      
      if (dist < bestDist && dist < 15) { // Within 15 degrees
        bestDist = dist;
        bestEntity = { type: 'aircraft', lat: ac.position.latitude, lon: ac.position.longitude, id: ac.id };
      }
    }
    
    return bestEntity;
  };
  
  // Helper to find nearest entity in a direction
  const findEntityInDirection = (direction: 'up' | 'down' | 'left' | 'right') => {
    // Get current camera look point
    const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const lookPoint = camera.position.clone().add(cameraDir).normalize();
    
    // Convert to lat/lon
    const lookLat = 90 - Math.acos(lookPoint.y) * (180 / Math.PI);
    const lookLon = Math.atan2(lookPoint.z, -lookPoint.x) * (180 / Math.PI) - 180;
    
    // Get camera right/up for direction mapping
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    
    let bestEntity: { type: 'airport'; lat: number; lon: number; id: string } | null = null;
    let bestScore = -Infinity;
    
    for (const airport of airports) {
      const latDiff = airport.lat - lookLat;
      const lonDiff = airport.lon - lookLon;
      const dist = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
      
      // Skip if too far or too close (same position)
      if (dist > UI.SNAP_MAX_DISTANCE || dist < UI.SNAP_MIN_DISTANCE) continue;
      
      // Calculate direction score based on arrow key
      let dirScore = 0;
      if (direction === 'up') dirScore = latDiff;
      else if (direction === 'down') dirScore = -latDiff;
      else if (direction === 'right') dirScore = lonDiff;
      else if (direction === 'left') dirScore = -lonDiff;
      
      // Must be in the correct direction
      if (dirScore <= 0) continue;
      
      // Score favors entities that are more directly in the direction and closer
      const score = dirScore / (dist + 1);
      
      if (score > bestScore) {
        bestScore = score;
        bestEntity = { type: 'airport', lat: airport.lat, lon: airport.lon, id: airport.icao };
      }
    }
    
    return bestEntity;
  };
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if another component already handled this (e.g. mode menu)
      if (e.defaultPrevented) return;
      
      if (e.key === 'Shift') {
        isShiftHeld.current = true;
      }
      
      // Escape: clear hover state
      if (e.key === 'Escape') {
        hoverEntity(null);
        return;
      }
      
      // Shift + Up/Down: zoom in/out
      if (e.shiftKey) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          isZoomInHeld.current = true;
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          isZoomOutHeld.current = true;
          return;
        }
        
        // Shift + Left/Right: snap to nearby entity
        if (!e.repeat) {
          let direction: 'left' | 'right' | null = null;
          if (e.key === 'ArrowLeft') direction = 'left';
          else if (e.key === 'ArrowRight') direction = 'right';
          
          if (direction) {
            e.preventDefault();
            const entity = findEntityInDirection(direction);
            if (entity) {
              setFocusLocation({ lat: entity.lat, lon: entity.lon });
              hoverEntity({ type: entity.type, id: entity.id });
            }
            return;
          }
        }
      }
      
      if (e.key === 'ArrowUp') arrowKeysHeld.current.up = true;
      if (e.key === 'ArrowDown') arrowKeysHeld.current.down = true;
      if (e.key === 'ArrowLeft') arrowKeysHeld.current.left = true;
      if (e.key === 'ArrowRight') arrowKeysHeld.current.right = true;
      
      // Track that we're moving with arrows
      const arrows = arrowKeysHeld.current;
      if (arrows.up || arrows.down || arrows.left || arrows.right) {
        wasMovingWithArrows.current = true;
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      // Skip if another component already handled this (e.g. mode menu)
      if (e.defaultPrevented) return;
      
      if (e.key === 'Shift') {
        isShiftHeld.current = false;
        // Also release zoom when shift is released
        isZoomInHeld.current = false;
        isZoomOutHeld.current = false;
      }
      if (e.key === 'ArrowUp') {
        arrowKeysHeld.current.up = false;
        isZoomInHeld.current = false;
      }
      if (e.key === 'ArrowDown') {
        arrowKeysHeld.current.down = false;
        isZoomOutHeld.current = false;
      }
      if (e.key === 'ArrowLeft') arrowKeysHeld.current.left = false;
      if (e.key === 'ArrowRight') arrowKeysHeld.current.right = false;
      
      // Check if all arrow keys are now released and we were moving
      const arrows = arrowKeysHeld.current;
      const noArrowsHeld = !arrows.up && !arrows.down && !arrows.left && !arrows.right;
      
      if (noArrowsHeld && wasMovingWithArrows.current && !isShiftHeld.current) {
        wasMovingWithArrows.current = false;
        
        // Find and highlight nearest entity
        const nearest = findNearestEntity();
        if (nearest) {
          hoverEntity({ type: nearest.type, id: nearest.id });
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
  
  // Get user's location on mount
  useEffect(() => {
    if (hasInitializedLocation.current) return;
    hasInitializedLocation.current = true;
    
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setInitialLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
        },
        () => {
          // Permission denied or error - use NYC
          setInitialLocation(LOCATIONS.DEFAULT);
        },
        { timeout: 5000, enableHighAccuracy: false }
      );
    } else {
      // Geolocation not available - use NYC
      setInitialLocation(LOCATIONS.DEFAULT);
    }
  }, []);
  
  // Set initial camera position when location is determined
  useEffect(() => {
    if (!initialLocation || !controlsRef.current) return;
    
    const targetPoint = latLonToVector3(initialLocation.lat, initialLocation.lon, 0);
    const cameraDirection = targetPoint.clone().normalize();
    const cameraPos = cameraDirection.clone().multiplyScalar(CAMERA.CITY_ZOOM_DISTANCE);
    
    camera.position.copy(cameraPos);
    // Set target to globe center (0,0,0) for free rotation around the globe
    controlsRef.current.target.set(0, 0, 0);
    currentTarget.current.set(0, 0, 0);
    controlsRef.current.update();
    
    // Signal that location is ready - allow data fetching to begin
    setLocationReady(true);
  }, [initialLocation, camera, setLocationReady]);
  
  // Focus on a specific location (from search, etc.) - flyover animation
  const prevFocusLocation = useRef<{ lat: number; lon: number } | null>(null);
  const hasSavedForFocus = useRef(false);
  useEffect(() => {
    if (!focusLocation || !controlsRef.current) return;
    
    // Skip if same location
    if (prevFocusLocation.current && 
        Math.abs(prevFocusLocation.current.lat - focusLocation.lat) < 0.0001 &&
        Math.abs(prevFocusLocation.current.lon - focusLocation.lon) < 0.0001) {
      return;
    }
    
    // Save camera position on FIRST focus (before any search navigation)
    if (!hasSavedForFocus.current && !selectedId) {
      savedCameraPosition.current.copy(camera.position);
      savedCameraTarget.current.copy(controlsRef.current.target);
      hasSavedForFocus.current = true;
    }
    
    const hadPrevLocation = prevFocusLocation.current !== null;
    prevFocusLocation.current = { lat: focusLocation.lat, lon: focusLocation.lon };
    
    // Don't override if we're tracking a selected entity
    if (selectedId) return;
    
    const currentDistance = camera.position.length();
    const targetPoint = latLonToVector3(focusLocation.lat, focusLocation.lon, focusLocation.alt || 0);
    const cameraDirection = targetPoint.clone().normalize();
    const finalCameraPos = cameraDirection.clone().multiplyScalar(currentDistance);
    
    // Calculate distance between current and target positions
    const travelDistance = camera.position.distanceTo(finalCameraPos);
    
    // Use flyover animation if moving a significant distance (and not first focus)
    const useFlyover = hadPrevLocation && travelDistance > INPUT.ANIMATION.FLYOVER_TRAVEL_THRESHOLD;
    
    isAnimating.current = true;
    isReturningToEarth.current = false;
    animationProgress.current = 0;
    
    startPosition.current.copy(camera.position);
    startTarget.current.copy(controlsRef.current.target);
    targetCameraPos.current.copy(finalCameraPos);
    targetLookAt.current.set(0, 0, 0);
    
    if (useFlyover) {
      // Calculate midpoint for flyover (zoom out, then zoom in)
      const startDir = camera.position.clone().normalize();
      const endDir = cameraDirection;
      const midDir = startDir.clone().add(endDir).normalize();
      
      // Midpoint camera position - zoomed out
      midpointCameraPos.current.copy(midDir.multiplyScalar(FLYOVER_ZOOM_OUT_DISTANCE));
      animationPhase.current = 'flyover';
    } else {
      animationPhase.current = 'direct';
    }
  }, [focusLocation, camera, selectedId]);
  
  // Restore camera to saved position (triggered by ESC during search, etc.)
  const prevRestoreFlag = useRef(0);
  useEffect(() => {
    if (restoreCameraFlag > 0 && restoreCameraFlag !== prevRestoreFlag.current && controlsRef.current) {
      prevRestoreFlag.current = restoreCameraFlag;
      
      // Reset focus state
      prevFocusLocation.current = null;
      hasSavedForFocus.current = false;
      
      // Don't restore if we're tracking something
      if (selectedId || selectedAirportId) return;
      
      // Animate back to saved position
      if (savedCameraPosition.current.lengthSq() > 0) {
        isAnimating.current = true;
        isReturningToEarth.current = true;
        animationProgress.current = 0;
        
        startPosition.current.copy(camera.position);
        startTarget.current.copy(controlsRef.current.target);
        
        targetCameraPos.current.copy(savedCameraPosition.current);
        targetLookAt.current.copy(savedCameraTarget.current);
      }
    }
  }, [restoreCameraFlag, camera, selectedId, selectedAirportId]);
  
  // Handle airport selection - zoom to airport
  const prevSelectedAirportId = useRef<string | null>(null);
  useEffect(() => {
    if (selectedAirportId && selectedAirportId !== prevSelectedAirportId.current) {
      const airport = airports.find(a => a.icao === selectedAirportId);
      if (airport && controlsRef.current) {
        // Save camera state if not already tracking something
        if (!prevSelectedId.current && !prevSelectedAirportId.current) {
          savedCameraPosition.current.copy(camera.position);
          savedCameraTarget.current.copy(controlsRef.current.target);
        }
        
        isAnimating.current = true;
        isReturningToEarth.current = false;
        animationProgress.current = 0;
        
        startPosition.current.copy(camera.position);
        startTarget.current.copy(controlsRef.current.target);
        
        const targetPoint = latLonToVector3(airport.lat, airport.lon, 0);
        const cameraDirection = targetPoint.clone().normalize();
        
        // Zoom in close to the airport
        targetCameraPos.current.copy(cameraDirection.multiplyScalar(CAMERA.CITY_ZOOM_DISTANCE));
        targetLookAt.current.set(0, 0, 0);
      }
    }
    
    // Handle deselection - return to previous position
    if (!selectedAirportId && prevSelectedAirportId.current && !selectedId && controlsRef.current) {
      isAnimating.current = true;
      isReturningToEarth.current = true;
      animationProgress.current = 0;
      
      startPosition.current.copy(camera.position);
      startTarget.current.copy(controlsRef.current.target);
      
      if (savedCameraPosition.current.lengthSq() > 0) {
        targetCameraPos.current.copy(savedCameraPosition.current);
        targetLookAt.current.copy(savedCameraTarget.current);
      }
    }
    
    prevSelectedAirportId.current = selectedAirportId;
  }, [selectedAirportId, airports, camera, selectedId]);
  
  useEffect(() => {
    if (selectedId && selectedId !== prevSelectedId.current) {
      const selectedAircraft = aircraft.find(a => a.id === selectedId);
      if (selectedAircraft && controlsRef.current) {
        // Save the current camera state BEFORE animating to the aircraft
        // Only save if we weren't already tracking something (prevSelectedId is null)
        if (!prevSelectedId.current) {
          savedCameraPosition.current.copy(camera.position);
          savedCameraTarget.current.copy(controlsRef.current.target);
        }
        
        isAnimating.current = true;
        isReturningToEarth.current = false;
        animationProgress.current = 0;
        
        startPosition.current.copy(camera.position);
        startTarget.current.copy(controlsRef.current.target);
        
        const { latitude, longitude, altitude, heading, speed } = selectedAircraft.position;
        
        // Store server data for prediction and reset camera offset
        lastServerData.current = {
          lat: latitude,
          lon: longitude,
          alt: altitude,
          heading,
          speed,
          time: Date.now(),
        };
        currentCameraOffset.current.set(0, 0, 0); // Reset so it gets calculated fresh
        
        const aircraftPos = latLonToVector3(latitude, longitude, altitude);
        
        // Get aircraft forward direction
        const forward = getAircraftForwardVector(latitude, longitude, heading);
        
        // Camera distance behind the aircraft
        const viewDistance = CAMERA.FOLLOW_DISTANCE;
        
        // Position camera directly behind the aircraft (level, not above)
        // Just move back along the opposite of forward direction
        const cameraOffset = forward.clone().multiplyScalar(-viewDistance);
        
        const cameraPos = aircraftPos.clone().add(cameraOffset);
        
        // Look at a point slightly ahead of the aircraft for better framing
        const lookAhead = aircraftPos.clone().add(forward.clone().multiplyScalar(CAMERA.FOLLOW_LOOK_AHEAD));
        
        targetCameraPos.current.copy(cameraPos);
        targetLookAt.current.copy(lookAhead);
      }
    }
    
    // Update server data when aircraft data updates
    if (selectedId) {
      const selectedAircraft = aircraft.find(a => a.id === selectedId);
      if (selectedAircraft) {
        const { latitude, longitude, altitude, heading, speed } = selectedAircraft.position;
        // Only update if position actually changed (new server data)
        if (lastServerData.current &&
            (lastServerData.current.lat !== latitude ||
             lastServerData.current.lon !== longitude)) {
          lastServerData.current = {
            lat: latitude,
            lon: longitude,
            alt: altitude,
            heading,
            speed,
            time: Date.now(),
          };
        }
      }
    }
    
    if (!selectedId && prevSelectedId.current && controlsRef.current) {
      // Deselected - animate back to the saved camera position
      isAnimating.current = true;
      isReturningToEarth.current = true;
      animationProgress.current = 0;
      
      // Clear chase view data
      lastServerData.current = null;
      currentCameraOffset.current.set(0, 0, 0);
      
      startPosition.current.copy(camera.position);
      startTarget.current.copy(controlsRef.current.target);
      
      // Return to the saved camera position
      if (savedCameraPosition.current.lengthSq() > 0) {
        targetCameraPos.current.copy(savedCameraPosition.current);
        targetLookAt.current.copy(savedCameraTarget.current);
      } else {
        const currentDir = camera.position.clone().normalize();
        targetCameraPos.current.copy(currentDir.multiplyScalar(CAMERA.CITY_ZOOM_DISTANCE));
        targetLookAt.current.set(0, 0, 0);
      }
    }
    
    prevSelectedId.current = selectedId;
  }, [selectedId, aircraft, camera, initialLocation]);
  
  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    
    const selectedAircraft = selectedId ? aircraft.find(a => a.id === selectedId) : null;
    
    if (isAnimating.current) {
      if (animationPhase.current === 'direct') {
        // Direct animation (no flyover)
        animationProgress.current += delta * INPUT.ANIMATION.CAMERA_DIRECT_SPEED;
        const t = Math.min(animationProgress.current, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        
        camera.position.lerpVectors(startPosition.current, targetCameraPos.current, eased);
        currentTarget.current.lerpVectors(startTarget.current, targetLookAt.current, eased);
        controlsRef.current.target.copy(currentTarget.current);
        
        if (t >= 1) {
          isAnimating.current = false;
          isReturningToEarth.current = false;
        }
      } else if (animationPhase.current === 'flyover') {
        // Seamless flyover: single animation through start → midpoint → target
        animationProgress.current += delta * INPUT.ANIMATION.CAMERA_FLYOVER_SPEED;
        const t = Math.min(animationProgress.current, 1);
        
        // Use smooth step for seamless acceleration/deceleration
        // t < 0.5: accelerate out (fast start, slow at midpoint)
        // t > 0.5: accelerate in (slow at midpoint, fast end)
        let eased: number;
        if (t < 0.5) {
          // First half: ease-out (fast to slow)
          const t2 = t * 2; // 0 to 1 for first half
          eased = (1 - Math.pow(1 - t2, 2)) * 0.5; // 0 to 0.5
        } else {
          // Second half: ease-in (slow to fast)
          const t2 = (t - 0.5) * 2; // 0 to 1 for second half
          eased = 0.5 + (t2 * t2) * 0.5; // 0.5 to 1
        }
        
        // Quadratic bezier through start, midpoint, target
        const oneMinusT = 1 - eased;
        const p0 = startPosition.current.clone().multiplyScalar(oneMinusT * oneMinusT);
        const p1 = midpointCameraPos.current.clone().multiplyScalar(2 * oneMinusT * eased);
        const p2 = targetCameraPos.current.clone().multiplyScalar(eased * eased);
        camera.position.copy(p0.add(p1).add(p2));
        
        currentTarget.current.set(0, 0, 0);
        controlsRef.current.target.copy(currentTarget.current);
        
        if (t >= 1) {
          isAnimating.current = false;
          isReturningToEarth.current = false;
          animationPhase.current = 'direct';
        }
      }
    } else if (selectedId && lastServerData.current && !isShiftHeld.current) {
      // Chase view: continuously follow predicted aircraft position
      const { lat, lon, alt, heading, speed, time } = lastServerData.current;
      const elapsedSeconds = (Date.now() - time) / 1000;
      
      // Calculate predicted position with altitude prediction from V/S
      let predictedLat = lat;
      let predictedLon = lon;
      
      if (speed > 10 && elapsedSeconds < 120) {
        const predicted = predictPosition(lat, lon, heading, speed, elapsedSeconds);
        predictedLat = predicted.lat;
        predictedLon = predicted.lon;
      }
      
      const predictedAircraftPos = latLonToVector3(predictedLat, predictedLon, alt);
      
      // Get current camera offset from aircraft (preserve user's viewing angle)
      if (currentCameraOffset.current.lengthSq() === 0) {
        currentCameraOffset.current.copy(camera.position).sub(predictedAircraftPos);
      }
      
      // Update the offset to maintain relative position as aircraft moves
      // This makes the camera follow the plane smoothly
      const targetCamPos = predictedAircraftPos.clone().add(currentCameraOffset.current);
      
      // Directly set camera position (faster follow)
      camera.position.copy(targetCamPos);
      
      // Update look-at to predicted position
      controlsRef.current.target.copy(predictedAircraftPos);
      currentTarget.current.copy(predictedAircraftPos);
      
      // Enable rotation but disable damping during chase view to prevent drift
      controlsRef.current.enableRotate = true;
      controlsRef.current.enableDamping = false;
    } else {
      // Re-enable damping when not in chase view
      controlsRef.current.enableRotate = true;
      controlsRef.current.enableDamping = true;
    }
    
    // Adjust rotation sensitivity based on zoom level
    const cameraDistance = camera.position.length();
    const zoomBasedRotateSpeed = Math.max(CAMERA.ROTATE_SPEED_MIN, Math.min(CAMERA.ROTATE_SPEED_MAX, (cameraDistance - 1) * INPUT.KEYBOARD.ROTATE_ZOOM_SCALE));
    controlsRef.current.rotateSpeed = zoomBasedRotateSpeed;
    
    // Keyboard zoom with - and = keys
    const zoomSpeed = CAMERA.ZOOM_SPEED_KEYBOARD * delta;
    const MIN_ZOOM = CAMERA.MIN_DISTANCE;
    const MAX_ZOOM = CAMERA.MAX_DISTANCE;
    
    if (isZoomInHeld.current || isZoomOutHeld.current) {
      const currentDist = camera.position.length();
      
      // Check if already at limit before applying zoom
      const isZoomingIn = isZoomInHeld.current;
      const isZoomingOut = isZoomOutHeld.current;
      const atMinZoom = currentDist <= MIN_ZOOM + INPUT.KEYBOARD.ZOOM_LIMIT_TOLERANCE;
      const atMaxZoom = currentDist >= MAX_ZOOM - INPUT.KEYBOARD.ZOOM_LIMIT_TOLERANCE;
      
      // Skip if already at the limit for the direction we're zooming
      if ((isZoomingIn && atMinZoom) || (isZoomingOut && atMaxZoom)) {
        // Already at limit, don't apply any zoom
      } else {
        const zoomDirection = isZoomingIn ? -1 : 1; // Negative = closer
        const newDist = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentDist + zoomDirection * zoomSpeed));
        
        // Scale camera position to new distance
        camera.position.normalize().multiplyScalar(newDist);
        
        // Also update camera offset if following an aircraft
        if (selectedId && currentCameraOffset.current.lengthSq() > 0) {
          const offsetDist = currentCameraOffset.current.length();
          const newOffsetDist = Math.max(INPUT.ANIMATION.MIN_OFFSET_DISTANCE, offsetDist + zoomDirection * zoomSpeed * INPUT.ANIMATION.OFFSET_ZOOM_MULTIPLIER);
          currentCameraOffset.current.normalize().multiplyScalar(newOffsetDist);
        }
      }
    }
    
    // Arrow keys for freecam movement (default behavior) - just moves camera, no entity interaction
    const arrows = arrowKeysHeld.current;
    const anyArrowHeld = arrows.up || arrows.down || arrows.left || arrows.right;
    
    if (!isShiftHeld.current && anyArrowHeld) {
      const panSpeed = CAMERA.PAN_SPEED * delta;
      
      // Get camera's right and up vectors for screen-space movement
      const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      
      // Calculate movement direction
      const movement = new THREE.Vector3();
      if (arrows.right) movement.add(cameraRight.clone().multiplyScalar(panSpeed));
      if (arrows.left) movement.add(cameraRight.clone().multiplyScalar(-panSpeed));
      if (arrows.up) movement.add(cameraUp.clone().multiplyScalar(panSpeed));
      if (arrows.down) movement.add(cameraUp.clone().multiplyScalar(-panSpeed));
      
      // Apply movement to camera position
      camera.position.add(movement);
      
      // Keep camera at consistent distance from globe center
      const targetDist = cameraDistance;
      camera.position.normalize().multiplyScalar(targetDist);
      
      // Update controls target to stay centered on globe
      controlsRef.current.target.set(0, 0, 0);
    }
    
    controlsRef.current.update();
  });
  
  const handleControlsChange = () => {
    if (selectedId && !isAnimating.current) {
      const selectedAircraft = aircraft.find(a => a.id === selectedId);
      if (selectedAircraft) {
        const aircraftPos = latLonToVector3(
          selectedAircraft.position.latitude,
          selectedAircraft.position.longitude,
          selectedAircraft.position.altitude
        );
        currentCameraOffset.current.copy(camera.position).sub(aircraftPos);
      }
    }
  };
  
  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={true}
      panSpeed={INPUT.MOUSE.PAN_SPEED}
      minDistance={CAMERA.MIN_DISTANCE}
      maxDistance={CAMERA.MAX_DISTANCE}
      rotateSpeed={INPUT.MOUSE.ROTATE_SPEED}
      zoomSpeed={CAMERA.ZOOM_SPEED_TRACKPAD}
      dampingFactor={INPUT.MOUSE.DAMPING_FACTOR}
      enableDamping
      onChange={handleControlsChange}
      // Mouse: left-drag = rotate, right-drag = pan, scroll = zoom
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
      // Touch: 1-finger = rotate, 2-finger = pinch zoom + pan
      touches={{
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
    />
  );
}
