'use client';

import { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useAirspaceStore } from '@/store/gameStore';

const MIN_CAMERA_DISTANCE = 1.12;
const DEFAULT_CAMERA_DISTANCE = 2.5;
const CITY_ZOOM_DISTANCE = 1.15; // Zoomed in on a city
const FOLLOW_DISTANCE = 0.04; // How far behind the aircraft to position camera
const FOLLOW_HEIGHT = 0.02; // How high above the aircraft

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
  
  const selectedId = useAirspaceStore((state) => state.gameState.selectedAircraft);
  const aircraft = useAirspaceStore((state) => state.aircraft);
  const setLocationReady = useAirspaceStore((state) => state.setLocationReady);
  
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
  
  // Shift key for orbit mode
  const isShiftHeld = useRef(false);
  const orbitTarget = useRef(new THREE.Vector3(0, 0, 0));
  const raycaster = useRef(new THREE.Raycaster());
  const globeSphere = useRef(new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1));
  
  // Track Shift key for orbit mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && !isShiftHeld.current && controlsRef.current) {
        isShiftHeld.current = true;
        
        // Calculate where camera is looking at on the globe
        const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        raycaster.current.set(camera.position, cameraDir);
        
        const intersectPoint = new THREE.Vector3();
        const hasIntersection = raycaster.current.ray.intersectSphere(globeSphere.current, intersectPoint);
        
        if (hasIntersection) {
          // Set orbit target to the point on globe we're looking at
          orbitTarget.current.copy(intersectPoint);
          controlsRef.current.target.copy(intersectPoint);
        } else {
          // Looking away from globe - use closest point on globe
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
        
        // Return to free globe rotation (target = center)
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
        isAnimating.current = true;
        isReturningToEarth.current = false;
        animationProgress.current = 0;
        
        startPosition.current.copy(camera.position);
        startTarget.current.copy(controlsRef.current.target);
        
        const aircraftPos = latLonToVector3(
          selectedAircraft.position.latitude,
          selectedAircraft.position.longitude,
          selectedAircraft.position.altitude
        );
        
        // Get aircraft forward direction and up vector
        const forward = getAircraftForwardVector(
          selectedAircraft.position.latitude,
          selectedAircraft.position.longitude,
          selectedAircraft.position.heading
        );
        const up = aircraftPos.clone().normalize();
        
        // Position camera behind and above the aircraft (chase cam)
        const cameraPos = aircraftPos.clone()
          .sub(forward.clone().multiplyScalar(FOLLOW_DISTANCE)) // Behind
          .add(up.clone().multiplyScalar(FOLLOW_HEIGHT)); // Above
        
        // Look at a point ahead of the aircraft
        const lookAtPos = aircraftPos.clone().add(forward.clone().multiplyScalar(0.05));
        
        targetCameraPos.current.copy(cameraPos);
        targetLookAt.current.copy(lookAtPos);
      }
    }
    
    if (!selectedId && prevSelectedId.current && controlsRef.current) {
      // Deselected - animate back to free globe view
      isAnimating.current = true;
      isReturningToEarth.current = true;
      animationProgress.current = 0;
      
      startPosition.current.copy(camera.position);
      startTarget.current.copy(controlsRef.current.target);
      
      // Target: return to current direction at city zoom level, orbiting globe center
      const currentDir = camera.position.clone().normalize();
      targetCameraPos.current.copy(currentDir.multiplyScalar(CITY_ZOOM_DISTANCE));
      targetLookAt.current.set(0, 0, 0); // Free rotation around globe center
    }
    
    prevSelectedId.current = selectedId;
  }, [selectedId, aircraft, camera, initialLocation]);
  
  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    
    const selectedAircraft = selectedId ? aircraft.find(a => a.id === selectedId) : null;
    
    if (isAnimating.current) {
      animationProgress.current += delta * 1.5;
      const t = Math.min(animationProgress.current, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      
      camera.position.lerpVectors(startPosition.current, targetCameraPos.current, eased);
      currentTarget.current.lerpVectors(startTarget.current, targetLookAt.current, eased);
      controlsRef.current.target.copy(currentTarget.current);
      
      if (t >= 1) {
        isAnimating.current = false;
        if (selectedAircraft && !isReturningToEarth.current) {
          const aircraftPos = latLonToVector3(
            selectedAircraft.position.latitude,
            selectedAircraft.position.longitude,
            selectedAircraft.position.altitude
          );
          currentCameraOffset.current.copy(camera.position).sub(aircraftPos);
        }
        isReturningToEarth.current = false;
      }
    } else if (selectedAircraft) {
      const aircraftPos = latLonToVector3(
        selectedAircraft.position.latitude,
        selectedAircraft.position.longitude,
        selectedAircraft.position.altitude
      );
      
      // Follow the aircraft using the user's current camera offset
      // This allows the user to orbit around the plane while following
      const targetPos = aircraftPos.clone().add(currentCameraOffset.current);
      camera.position.lerp(targetPos, delta * 2);
      
      // Keep looking at the aircraft
      currentTarget.current.lerp(aircraftPos, delta * 3);
      controlsRef.current.target.copy(currentTarget.current);
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
