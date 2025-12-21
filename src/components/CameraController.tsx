'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useAirspaceStore } from '@/store/gameStore';

const GLOBE_RADIUS = 1;
const MIN_CAMERA_DISTANCE = 1.05; // Minimum distance from globe center

// Convert lat/lon to 3D position on globe
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
  
  // Track camera animation state
  const isAnimating = useRef(false);
  const animationProgress = useRef(0);
  const startPosition = useRef(new THREE.Vector3());
  const startTarget = useRef(new THREE.Vector3());
  const targetCameraPos = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  
  // Current smoothed values for tracking
  const currentTarget = useRef(new THREE.Vector3(0, 0, 0));
  const currentCameraOffset = useRef(new THREE.Vector3());
  
  const prevSelectedId = useRef<string | null>(null);
  
  // When selection changes, start animation
  useEffect(() => {
    if (selectedId && selectedId !== prevSelectedId.current) {
      const selectedAircraft = aircraft.find(a => a.id === selectedId);
      if (selectedAircraft && controlsRef.current) {
        // Start animation
        isAnimating.current = true;
        animationProgress.current = 0;
        
        // Store starting positions
        startPosition.current.copy(camera.position);
        startTarget.current.copy(controlsRef.current.target);
        
        // Calculate target position
        const aircraftPos = latLonToVector3(
          selectedAircraft.position.latitude,
          selectedAircraft.position.longitude,
          selectedAircraft.position.altitude
        );
        
        // Position camera at a nice viewing angle
        const dirFromCenter = aircraftPos.clone().normalize();
        const cameraDistance = 0.3; // Distance from aircraft
        const cameraPos = aircraftPos.clone().add(dirFromCenter.multiplyScalar(cameraDistance));
        
        targetCameraPos.current.copy(cameraPos);
        targetLookAt.current.copy(aircraftPos);
      }
    }
    
    if (!selectedId && prevSelectedId.current) {
      // Deselected - smoothly return to free mode
      isAnimating.current = false;
    }
    
    prevSelectedId.current = selectedId;
  }, [selectedId, aircraft, camera]);
  
  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    
    const selectedAircraft = selectedId ? aircraft.find(a => a.id === selectedId) : null;
    
    if (isAnimating.current) {
      // Animate to target
      animationProgress.current += delta * 1.5; // Animation speed
      const t = Math.min(animationProgress.current, 1);
      const eased = 1 - Math.pow(1 - t, 3); // Ease out cubic
      
      // Interpolate camera position
      camera.position.lerpVectors(startPosition.current, targetCameraPos.current, eased);
      
      // Interpolate look-at target
      currentTarget.current.lerpVectors(startTarget.current, targetLookAt.current, eased);
      controlsRef.current.target.copy(currentTarget.current);
      
      if (t >= 1) {
        isAnimating.current = false;
        // Store offset for tracking
        if (selectedAircraft) {
          const aircraftPos = latLonToVector3(
            selectedAircraft.position.latitude,
            selectedAircraft.position.longitude,
            selectedAircraft.position.altitude
          );
          currentCameraOffset.current.copy(camera.position).sub(aircraftPos);
        }
      }
    } else if (selectedAircraft) {
      // Tracking mode - follow the aircraft smoothly
      const aircraftPos = latLonToVector3(
        selectedAircraft.position.latitude,
        selectedAircraft.position.longitude,
        selectedAircraft.position.altitude
      );
      
      // Smoothly update camera offset (allows user to orbit while tracking)
      const targetPos = aircraftPos.clone().add(currentCameraOffset.current);
      camera.position.lerp(targetPos, delta * 3);
      
      // Smoothly update look-at target
      currentTarget.current.lerp(aircraftPos, delta * 5);
      controlsRef.current.target.copy(currentTarget.current);
    } else {
      // No aircraft selected - enforce minimum distance from globe center
      const distFromCenter = camera.position.length();
      if (distFromCenter < MIN_CAMERA_DISTANCE) {
        camera.position.normalize().multiplyScalar(MIN_CAMERA_DISTANCE);
      }
    }
    
    controlsRef.current.update();
  });
  
  // Handle user interaction to update offset
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
