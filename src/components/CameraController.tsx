'use client';

import { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useRadarStore } from '@/store/gameStore';

const MIN_CAMERA_DISTANCE = 1.12;
const DEFAULT_CAMERA_DISTANCE = 2.5;
const CITY_ZOOM_DISTANCE = 1.15; // Zoomed in on a city
const PATH_VIEW_DISTANCE = 1.25; // Distance to view full path
const SLANT_ANGLE = 0.4; // Radians - angle of slant from vertical (about 23 degrees)

// Default to New York City
const DEFAULT_LOCATION = { lat: 40.7128, lon: -74.006 };

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
  const r = 1 + alt * 0.0000005;
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
  const earthCircumferenceKm = 2 * Math.PI * 6371;
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
  const FLYOVER_ZOOM_OUT_DISTANCE = 2.2; // Distance to zoom out to during flyover
  
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
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        isShiftHeld.current = true;
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        isShiftHeld.current = false;
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
          setInitialLocation(DEFAULT_LOCATION);
        },
        { timeout: 5000, enableHighAccuracy: false }
      );
    } else {
      // Geolocation not available - use NYC
      setInitialLocation(DEFAULT_LOCATION);
    }
  }, []);
  
  // Set initial camera position when location is determined
  useEffect(() => {
    if (!initialLocation || !controlsRef.current) return;
    
    const targetPoint = latLonToVector3(initialLocation.lat, initialLocation.lon, 0);
    const cameraDirection = targetPoint.clone().normalize();
    const cameraPos = cameraDirection.clone().multiplyScalar(CITY_ZOOM_DISTANCE);
    
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
    const useFlyover = hadPrevLocation && travelDistance > 0.3;
    
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
        targetCameraPos.current.copy(cameraDirection.multiplyScalar(CITY_ZOOM_DISTANCE));
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
        
        // Get aircraft forward direction and up vector
        const forward = getAircraftForwardVector(latitude, longitude, heading);
        const up = aircraftPos.clone().normalize();
        
        // Calculate path extent for framing (in degrees)
        const speedDegPerMin = (speed / 60) / 60;
        const pathLength3D = (speedDegPerMin * 25) * 0.017; // 15 min past + 10 min future
        
        // Camera distance: close enough to see detail, far enough to see full path
        const viewDistance = Math.max(0.08, Math.min(0.25, pathLength3D * 1.5 + 0.05));
        
        // Position camera directly behind and above the aircraft (centered view)
        const cameraOffset = new THREE.Vector3()
          .add(up.clone().multiplyScalar(viewDistance * 0.6))
          .add(forward.clone().multiplyScalar(-viewDistance * 0.8));
        
        const cameraPos = aircraftPos.clone().add(cameraOffset);
        
        // Look directly at the aircraft (plane centered)
        targetCameraPos.current.copy(cameraPos);
        targetLookAt.current.copy(aircraftPos);
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
        targetCameraPos.current.copy(currentDir.multiplyScalar(CITY_ZOOM_DISTANCE));
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
        animationProgress.current += delta * 1.2;
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
        animationProgress.current += delta * 0.8; // Smooth speed for full arc
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
    } else {
      const distFromCenter = camera.position.length();
      if (distFromCenter < MIN_CAMERA_DISTANCE) {
        camera.position.normalize().multiplyScalar(MIN_CAMERA_DISTANCE);
      }
    }
    
    // Adjust rotation sensitivity based on zoom level
    const cameraDistance = camera.position.length();
    const zoomBasedRotateSpeed = Math.max(0.08, Math.min(0.8, (cameraDistance - 1) * 0.2));
    controlsRef.current.rotateSpeed = zoomBasedRotateSpeed;
    
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
      panSpeed={0.5}
      minDistance={0.15}
      maxDistance={5}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
      dampingFactor={0.1}
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
