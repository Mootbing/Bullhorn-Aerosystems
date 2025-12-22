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

export function CameraController() {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  
  const selectedId = useRadarStore((state) => state.gameState.selectedAircraft);
  const aircraft = useRadarStore((state) => state.aircraft);
  const setLocationReady = useRadarStore((state) => state.setLocationReady);
  
  const isAnimating = useRef(false);
  const animationProgress = useRef(0);
  const startPosition = useRef(new THREE.Vector3());
  const startTarget = useRef(new THREE.Vector3());
  const targetCameraPos = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  
  const currentTarget = useRef(new THREE.Vector3(0, 0, 0));
  const currentCameraOffset = useRef(new THREE.Vector3());
  
  const prevSelectedId = useRef<string | null>(null);
  const isReturningToEarth = useRef(false);
  const hasInitializedLocation = useRef(false);
  const [initialLocation, setInitialLocation] = useState<{ lat: number; lon: number } | null>(null);
  
  // Save camera state before selecting an aircraft so we can return to it
  const savedCameraPosition = useRef(new THREE.Vector3());
  const savedCameraTarget = useRef(new THREE.Vector3());
  
  // Shift key for orbit mode
  const isShiftHeld = useRef(false);
  const orbitTarget = useRef(new THREE.Vector3(0, 0, 0));
  const raycaster = useRef(new THREE.Raycaster());
  const globeSphere = useRef(new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1));
  
  // Track Shift key for orbit mode (works in both normal and focused modes)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && !isShiftHeld.current && controlsRef.current) {
        isShiftHeld.current = true;
        
        // In focused mode: orbit around the aircraft
        const currentSelectedId = useRadarStore.getState().gameState.selectedAircraft;
        if (currentSelectedId) {
          const currentAircraft = useRadarStore.getState().aircraft.find(a => a.id === currentSelectedId);
          if (currentAircraft) {
            const aircraftPos = latLonToVector3(
              currentAircraft.position.latitude,
              currentAircraft.position.longitude,
              currentAircraft.position.altitude
            );
            orbitTarget.current.copy(aircraftPos);
            controlsRef.current.target.copy(aircraftPos);
            controlsRef.current.update();
            return;
          }
        }
        
        // Not focused: orbit around point on globe we're looking at
        const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        raycaster.current.set(camera.position, cameraDir);
        
        const intersectPoint = new THREE.Vector3();
        const hasIntersection = raycaster.current.ray.intersectSphere(globeSphere.current, intersectPoint);
        
        if (hasIntersection) {
          orbitTarget.current.copy(intersectPoint);
          controlsRef.current.target.copy(intersectPoint);
        } else {
          const closestPoint = camera.position.clone().normalize();
          orbitTarget.current.copy(closestPoint);
          controlsRef.current.target.copy(closestPoint);
        }
        controlsRef.current.update();
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && isShiftHeld.current && controlsRef.current) {
        isShiftHeld.current = false;
        
        // Return to free rotation (target = center)
        controlsRef.current.target.set(0, 0, 0);
        currentTarget.current.set(0, 0, 0);
        controlsRef.current.update();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [camera]);
  
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
        
        const aircraftPos = latLonToVector3(latitude, longitude, altitude);
        
        // Get aircraft forward direction and up vector
        const forward = getAircraftForwardVector(latitude, longitude, heading);
        const up = aircraftPos.clone().normalize();
        const right = new THREE.Vector3().crossVectors(forward, up).normalize();
        
        // Calculate path extent for framing (in degrees)
        const speedDegPerMin = (speed / 60) / 60;
        const pathExtentPast = speedDegPerMin * 15;
        const pathExtentFuture = speedDegPerMin * 10;
        
        // Convert to 3D space distance
        const pathLength3D = (pathExtentPast + pathExtentFuture) * 0.017;
        
        // Camera distance: close enough to see detail, far enough to see full path
        const viewDistance = Math.max(0.08, Math.min(0.25, pathLength3D * 1.5 + 0.05));
        
        // Calculate center point between past and future paths
        const pathCenterOffset = forward.clone().multiplyScalar(
          (pathExtentFuture - pathExtentPast) * 0.01 * 0.3
        );
        const pathCenter = aircraftPos.clone().add(pathCenterOffset);
        
        // Position camera at a slanted angle behind and above the aircraft
        const cameraOffset = new THREE.Vector3()
          .add(up.clone().multiplyScalar(viewDistance * 0.7))
          .add(right.clone().multiplyScalar(viewDistance * 0.4))
          .add(forward.clone().multiplyScalar(-viewDistance * 0.5));
        
        const cameraPos = pathCenter.clone().add(cameraOffset);
        
        // Look at a point slightly ahead of the aircraft
        const lookAtPos = aircraftPos.clone().add(forward.clone().multiplyScalar(viewDistance * 0.3));
        
        targetCameraPos.current.copy(cameraPos);
        targetLookAt.current.copy(lookAtPos);
      }
    }
    
    if (!selectedId && prevSelectedId.current && controlsRef.current) {
      // Deselected - animate back to the saved camera position
      isAnimating.current = true;
      isReturningToEarth.current = true;
      animationProgress.current = 0;
      
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
      // Smooth animation over ~1 second
      animationProgress.current += delta * 1.2;
      const t = Math.min(animationProgress.current, 1);
      // Smooth ease-out
      const eased = 1 - Math.pow(1 - t, 3);
      
      camera.position.lerpVectors(startPosition.current, targetCameraPos.current, eased);
      currentTarget.current.lerpVectors(startTarget.current, targetLookAt.current, eased);
      controlsRef.current.target.copy(currentTarget.current);
      
      if (t >= 1) {
        isAnimating.current = false;
        isReturningToEarth.current = false;
      }
    } else {
      const distFromCenter = camera.position.length();
      if (distFromCenter < MIN_CAMERA_DISTANCE) {
        camera.position.normalize().multiplyScalar(MIN_CAMERA_DISTANCE);
      }
    }
    
    // Adjust rotation sensitivity based on zoom level
    // Slower when zoomed in, faster when zoomed out
    const cameraDistance = camera.position.length();
    // At distance 1.05 (very close): rotateSpeed = 0.1 (slow)
    // At distance 2.5 (default): rotateSpeed = 0.4
    // At distance 5 (far): rotateSpeed = 0.8 (fast)
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
      enablePan={false}
      minDistance={0.15}
      maxDistance={5}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
      dampingFactor={0.1}
      enableDamping
      onChange={handleControlsChange}
    />
  );
}
